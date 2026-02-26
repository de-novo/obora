import { randomUUID } from "node:crypto";
import { buildGraph, generateExecutionPlan, getNextSteps, parseWorkflow, type Step, type Workflow } from "../_legacy/workflow/index.js";
import type { CellManager } from "../cell/CellManager.js";
import type { Task } from "../cell/types.js";
import type { AuditTrail } from "../audit/AuditTrail.js";
import type { AuditEventType } from "../audit/types.js";
import { persistStructuredAuditEvent } from "../audit/AuditReplay.js";
import type { ConsensusGate } from "../consensus/ConsensusGate.js";
import type { PolicyEngine } from "../policy/PolicyEngine.js";
import type { PolicyDecision } from "../policy/types.js";
import type { RecoveryEngine, RecoveryStrategy } from "../recovery/types.js";
import type { StateBinder, StateBinding } from "../state/StateBinder.js";
import type { StorageAdapter, RunRecord, StepRecord, ResumeOptions } from "../storage/types.js";
import type { ArtifactStore } from "../artifacts/types.js";
import { CheckpointManager, PolicyDriftError } from "../checkpoint/CheckpointManager.js";
import type { PolicyHashInput } from "../checkpoint/policy-hash.js";
import { parseDuration } from "./utils.js";
import type {
  Execution,
  ExecutionFilter,
  ExecutionStepStatus,
  GateWaitState,
  GateWaitStateStore,
  ResumeResult,
  RuntimeOrchestrator as RuntimeOrchestratorContract,
  RuntimeOrchestratorOptions,
} from "./types.js";

export interface RuntimeOrchestratorDependencies {
  cellManager: CellManager;
  policyEngine: PolicyEngine;
  stateBinder?: StateBinder;
  auditTrail?: AuditTrail;
  consensusGate?: ConsensusGate;
  recoveryEngine?: RecoveryEngine;
  gateWaitStateStore?: GateWaitStateStore;
  storageAdapter?: StorageAdapter;
  artifactStore?: ArtifactStore;
}

interface WaitingContext {
  workflow: Workflow;
  step: Step;
  completed: Set<string>;
  scheduled: Set<string>;
  input: unknown;
}

interface StepGateDecision {
  gateType: GateWaitState["gateType"];
  config?: { timeout?: string; fallback?: "fail" | "escalate" | "auto-approve" };
}

interface RuntimeGateDecision extends Extract<PolicyDecision, { type: "gate" }> {
  gateType: GateWaitState["gateType"];
  config?: { timeout?: string; fallback?: "fail" | "escalate" | "auto-approve" };
}

interface BackEdgeState {
  source: string;
  target: string;
  iterationCount: number;
  costUsd: number;
}

interface BackEdgeTriggerResult {
  step: Step;
  status: "back_edge";
  targetStep: string;
}

const LOOP_KEY_PREFIX = "__obora.loop.";
const STARVATION_TIMEOUT_MS_DEFAULT = 60000;
const defaultWait = async (ms: number): Promise<void> => {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const inMemoryGateStateStore = (): GateWaitStateStore => {
  const states = new Map<string, GateWaitState>();
  return {
    save: async (state) => {
      states.set(state.executionId, structuredClone(state));
    },
    get: async (executionId) => {
      const value = states.get(executionId);
      return value ? structuredClone(value) : undefined;
    },
    delete: async (executionId) => {
      states.delete(executionId);
    },
  };
};

export class DefaultRuntimeOrchestrator implements RuntimeOrchestratorContract {
  private readonly workflows = new Map<string, Workflow>();
  private readonly executions = new Map<string, Execution>();
  private readonly waitingContexts = new Map<string, WaitingContext>();
  private readonly approvedGateSteps = new Set<string>();
  private readonly createExecutionId: () => string;
  private readonly now: () => Date;
  private readonly wait: (ms: number) => Promise<void>;
  private readonly starvationTimeoutMs: number;
  private readonly gateWaitStateStore: GateWaitStateStore;

  private policyConfig: PolicyHashInput = {};
  private checkpointManager?: CheckpointManager;

  constructor(
    private readonly dependencies: RuntimeOrchestratorDependencies,
    private readonly options: RuntimeOrchestratorOptions = {}
  ) {
    this.createExecutionId = options.createExecutionId ?? (() => randomUUID());
    this.now = options.now ?? (() => new Date());
    this.wait = options.wait ?? defaultWait;
    this.starvationTimeoutMs = options.starvationTimeoutMs ?? STARVATION_TIMEOUT_MS_DEFAULT;
    this.gateWaitStateStore = dependencies.gateWaitStateStore ?? inMemoryGateStateStore();
    if (dependencies.storageAdapter) {
      this.checkpointManager = new CheckpointManager(dependencies.storageAdapter);
    }
  }

  /** Set the policy config used for checkpoint drift detection */
  setPolicyConfig(config: PolicyHashInput): void {
    this.policyConfig = config;
  }

  define(name: string, workflow: Workflow | string): void {
    const parsed = typeof workflow === "string" ? parseWorkflow(workflow) : workflow;
    this.workflows.set(name, structuredClone(parsed));
  }

  async run(name: string, input: unknown): Promise<Execution> {
    const workflow = this.workflows.get(name);
    if (!workflow) {
      throw new Error(`Workflow is not defined: ${name}`);
    }

    const plan = generateExecutionPlan(workflow);
    if (!plan.isValid) {
      throw new Error(`Invalid workflow DAG: ${(plan.cyclicPath ?? []).join(" -> ")}`);
    }

    const execution = this.createExecution(name, workflow, input, plan.executionOrder);
    this.executions.set(execution.id, execution);
    await this.persistRun(execution);

    await this.recordAudit(execution.id, "execution_start", {
      workflowName: name,
      stepOrder: execution.stepOrder,
      input,
    });

    const completed = new Set<string>();
    const scheduled = new Set<string>();
    return this.executeLoop(execution, workflow, input, completed, scheduled);
  }

  async resume(runId: string, options: ResumeOptions = {}): Promise<ResumeResult> {
    const adapter = this.dependencies.storageAdapter;
    if (!adapter || !this.checkpointManager) {
      throw new Error("StorageAdapter is required for resume");
    }

    // 1. Load run and checkpoint
    const runRecord = await adapter.getRun(runId);
    if (!runRecord) {
      throw new Error(`Run not found: ${runId}`);
    }

    const checkpoint = await this.checkpointManager.getLatestCheckpoint(runId);
    if (!checkpoint) {
      throw new Error(`No checkpoint found for run: ${runId}`);
    }

    // 2. Detect policy drift
    const drift = this.checkpointManager.detectDrift(checkpoint, this.policyConfig);
    const driftPolicy = options.driftPolicy ?? "warn";

    if (drift.drifted) {
      await this.recordAudit(runId, "recovery_start", {
        type: "policy_drift_detected",
        category: "recovery",
        action: "policy_drift_detected",
        runId,
        oldHash: drift.oldHash,
        newHash: drift.newHash,
        driftPolicy,
        timestamp: this.now().toISOString(),
      });

      if (driftPolicy === "reject") {
        throw new PolicyDriftError(drift.oldHash, drift.newHash);
      }
    }

    // 3. Load steps and determine restoration policy
    const steps = await adapter.getSteps(runId);
    const workflow = this.workflows.get(runRecord.workflowName);
    if (!workflow) {
      throw new Error(`Workflow is not defined: ${runRecord.workflowName}`);
    }

    const allStepNames = workflow.steps.map((s) => s.name);
    const stepPolicies = this.checkpointManager.resolveStepPolicies(
      steps,
      checkpoint.completedSteps,
      allStepNames,
      options,
    );

    // 4. Create new execution with restored state
    const execution = this.createExecution(
      runRecord.workflowName,
      workflow,
      runRecord.input,
      allStepNames,
    );
    // Override execution id with original runId so all persistence (runs, steps, checkpoints)
    // stays under the same run identity
    execution.id = runId;
    this.executions.set(execution.id, execution);

    // Update run record to link resumed execution
    await adapter.saveRun({
      ...runRecord,
      status: "running",
      completedAt: undefined,
    });

    await this.recordAudit(execution.id, "snapshot_restore", {
      originalRunId: runId,
      checkpointId: checkpoint.id,
      restoredSteps: stepPolicies.filter((p) => p.action === "restore").map((p) => p.stepName),
      rerunSteps: stepPolicies.filter((p) => p.action === "rerun").map((p) => p.stepName),
    });

    // 4b. Restore StateBinder state from checkpoint snapshot
    if (this.dependencies.stateBinder && checkpoint.stateSnapshot) {
      const snapshot = checkpoint.stateSnapshot as Record<string, unknown>;
      // Re-bind outputs from checkpoint as state
      // StateBinder operates through bind(), so we restore by writing snapshot entries
      // as completed step outputs to maintain state consistency
      for (const [key, value] of Object.entries(snapshot)) {
        // Skip non-serializable values (functions, symbols); restore all JSON-safe values including primitives
        if (typeof value === "function" || typeof value === "symbol") continue;
        await this.dependencies.stateBinder.bind(
          { success: true, output: value, toolCalls: [], metrics: { durationMs: 0, tokenUsage: { input: 0, output: 0 }, retries: 0 } },
          [{ source: "output", target: key }],
        );
      }
    }

    if (checkpoint.stateSnapshot && typeof checkpoint.stateSnapshot === "object") {
      const snapshot = checkpoint.stateSnapshot as Record<string, unknown>;
      for (const [key, value] of Object.entries(snapshot)) {
        if (key.startsWith(LOOP_KEY_PREFIX)) {
          execution.outputs[key] = value;
        }
      }
    }

    // 5. Restore completed steps and execute remaining
    const completed = new Set<string>();
    const scheduled = new Set<string>();
    const restoredSteps: string[] = [];
    const rerunSteps: string[] = [];

    for (const policy of stepPolicies) {
      if (policy.action === "restore") {
        completed.add(policy.stepName);
        execution.completedSteps = [...completed];
        execution.outputs[policy.stepName] = policy.output ?? {};
        const record = execution.stepRecords[policy.stepName];
        if (record) {
          record.status = "completed";
          record.startedAt = this.now();
          record.endedAt = this.now();
        }
        restoredSteps.push(policy.stepName);
      } else if (policy.action === "skip") {
        completed.add(policy.stepName);
        const record = execution.stepRecords[policy.stepName];
        if (record) {
          record.status = "skipped";
        }
      } else {
        rerunSteps.push(policy.stepName);
      }
    }

    // Sync completedSteps so skip-only resumes report accurate state
    execution.completedSteps = [...completed];

    await this.persistRun(execution);

    // Execute remaining steps — execution.id is already set to runId above,
    // so executeLoop's checkpoint saves naturally use the correct run identity.
    // No need to wrap checkpointManager (which would be unsafe under concurrent resumes).
    const result = await this.executeLoop(execution, workflow, runRecord.input, completed, scheduled);

    // Save final checkpoint under original runId
    if (this.checkpointManager) {
      const lastStep = allStepNames[allStepNames.length - 1];
      await this.checkpointManager.saveCheckpoint(
        runId,
        lastStep,
        [...completed],
        execution.outputs,
        this.policyConfig,
      );
    }

    return {
      execution: result,
      restoredSteps,
      rerunSteps,
      driftDetected: drift.drifted,
    };
  }

  async approve(executionId: string): Promise<Execution> {
    const execution = this.requireExecution(executionId);
    const waitingContext = this.waitingContexts.get(executionId);
    if (!waitingContext || !execution.waitingGate) {
      throw new Error(`Execution is not waiting on gate: ${executionId}`);
    }

    execution.waitingGate.status = "approved";
    await this.gateWaitStateStore.save(execution.waitingGate);
    await this.gateWaitStateStore.delete(executionId);
    await this.recordAudit(execution.id, "gate_resolve", {
      stepName: waitingContext.step.name,
      gateType: execution.waitingGate.gateType,
      status: "approved",
    });

    const record = execution.stepRecords[waitingContext.step.name]!;
    record.status = "pending";
    record.error = undefined;
    record.endedAt = undefined;

    execution.waitingGate = undefined;
    execution.status = "running";
    execution.error = undefined;
    waitingContext.scheduled.delete(waitingContext.step.name);
    this.approvedGateSteps.add(`${execution.id}:${waitingContext.step.name}`);
    this.waitingContexts.delete(executionId);

    return this.executeLoop(
      execution,
      waitingContext.workflow,
      waitingContext.input,
      waitingContext.completed,
      waitingContext.scheduled
    );
  }

  async reject(executionId: string, reason = "Gate rejected"): Promise<Execution> {
    const execution = this.requireExecution(executionId);
    if (!execution.waitingGate) {
      throw new Error(`Execution is not waiting on gate: ${executionId}`);
    }

    execution.waitingGate.status = "rejected";
    await this.gateWaitStateStore.save(execution.waitingGate);
    await this.gateWaitStateStore.delete(executionId);
    await this.recordAudit(execution.id, "gate_resolve", {
      stepName: execution.waitingGate.stepName,
      gateType: execution.waitingGate.gateType,
      status: "rejected",
      reason,
    });

    const record = execution.stepRecords[execution.waitingGate.stepName]!;
    record.status = "failed";
    record.error = reason;
    record.endedAt = this.now();

    execution.status = "failed";
    execution.error = reason;
    execution.endedAt = this.now();
    execution.waitingGate = undefined;
    this.waitingContexts.delete(executionId);
    await this.recordExecutionEnd(execution);

    return this.cloneExecution(execution);
  }

  async onGateTimeout(executionId: string): Promise<Execution> {
    const execution = this.requireExecution(executionId);
    const gate = execution.waitingGate;
    if (!gate) {
      throw new Error(`Execution is not waiting on gate: ${executionId}`);
    }

    const waitingContext = this.waitingContexts.get(executionId);

    if (gate.fallback === "auto-approve") {
      if (!waitingContext) {
        throw new Error(`Execution waiting context is missing: ${executionId}`);
      }

      gate.status = "approved";
      await this.gateWaitStateStore.save(gate);
      await this.gateWaitStateStore.delete(executionId);
      await this.recordAudit(execution.id, "gate_resolve", {
        stepName: gate.stepName,
        gateType: gate.gateType,
        status: "approved",
        fallback: "auto-approve",
      });

      const record = execution.stepRecords[gate.stepName]!;
      record.status = "pending";
      record.error = undefined;
      record.endedAt = undefined;

      execution.waitingGate = undefined;
      execution.status = "running";
      execution.error = undefined;
      waitingContext.scheduled.delete(gate.stepName);
      this.approvedGateSteps.add(`${execution.id}:${gate.stepName}`);
      this.waitingContexts.delete(executionId);

      return this.executeLoop(
        execution,
        waitingContext.workflow,
        waitingContext.input,
        waitingContext.completed,
        waitingContext.scheduled
      );
    }

    gate.status = "timeout";
    await this.gateWaitStateStore.save(gate);
    await this.gateWaitStateStore.delete(executionId);
    await this.recordAudit(execution.id, "gate_resolve", {
      stepName: gate.stepName,
      gateType: gate.gateType,
      status: "timeout",
    });

    const record = execution.stepRecords[gate.stepName]!;
    record.status = "failed";
    record.error = `Gate timeout: ${gate.gateType}`;
    record.endedAt = this.now();

    if (gate.fallback === "escalate" && this.dependencies.recoveryEngine) {
      const recovery = await this.dependencies.recoveryEngine.handle(
        {
          executionId: execution.id,
          cellId: `gate:${gate.stepName}`,
          stepName: gate.stepName,
          attempt: 1,
          error: new Error(record.error),
        },
        { type: "escalate", severity: "high", channel: "human-approval", summary: record.error }
      );
      record.recovery = recovery;
    }

    execution.status = "failed";
    execution.error = record.error;
    execution.endedAt = this.now();
    execution.waitingGate = undefined;
    this.waitingContexts.delete(executionId);
    await this.recordExecutionEnd(execution);
    return this.cloneExecution(execution);
  }

  getExecution(id: string): Execution {
    const execution = this.executions.get(id);
    if (!execution) {
      throw new Error(`Execution not found: ${id}`);
    }
    return this.cloneExecution(execution);
  }

  listExecutions(filter?: ExecutionFilter): Execution[] {
    const items = [...this.executions.values()].filter((execution) => {
      if (filter?.status && execution.status !== filter.status) {
        return false;
      }
      if (filter?.workflowName && execution.workflowName !== filter.workflowName) {
        return false;
      }
      return true;
    });

    return items.map((execution) => this.cloneExecution(execution));
  }

  private requireExecution(executionId: string): Execution {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }
    return execution;
  }

  private async executeLoop(
    execution: Execution,
    workflow: Workflow,
    input: unknown,
    completed: Set<string>,
    scheduled: Set<string>
  ): Promise<Execution> {
    while (completed.size < workflow.steps.length) {
      const candidates = getNextSteps(workflow, completed)
        .filter((step) => !scheduled.has(step.name))
        .sort((a, b) => execution.stepOrder.indexOf(a.name) - execution.stepOrder.indexOf(b.name));

      if (candidates.length === 0) {
        execution.status = "failed";
        execution.error = "No executable step found while execution is incomplete";
        execution.endedAt = this.now();
        await this.recordAudit(execution.id, "error", { message: execution.error });
        await this.recordExecutionEnd(execution);
        return this.cloneExecution(execution);
      }

      const maxParallel = workflow.config?.max_parallel && workflow.config.max_parallel > 0
        ? workflow.config.max_parallel
        : 1;
      const runnable = candidates.slice(0, maxParallel);
      runnable.forEach((step) => scheduled.add(step.name));

      const batchResults = await Promise.all(runnable.map((step) => this.runStep(execution, workflow, step, input, completed)));

      for (const result of batchResults) {
        if (result.status === "completed") {
          completed.add(result.step.name);
          execution.completedSteps = [...completed];

          // Save checkpoint after each step completion
          if (this.checkpointManager) {
            await this.checkpointManager.saveCheckpoint(
              execution.id,
              result.step.name,
              [...completed],
              execution.outputs,
              this.policyConfig,
            );
          }

          continue;
        }

        if (result.status === "back_edge") {
          this.pruneForBackEdge(workflow, completed, scheduled, result.targetStep);
          execution.completedSteps = [...completed];
          if (this.checkpointManager) {
            await this.checkpointManager.saveCheckpoint(
              execution.id,
              result.step.name,
              [...completed],
              execution.outputs,
              this.policyConfig,
            );
          }
          continue;
        }

        if (result.status === "waiting") {
          execution.status = "waiting";
          execution.error = `Execution is waiting at step: ${result.step.name}`;
          this.waitingContexts.set(execution.id, {
            workflow,
            step: result.step,
            completed,
            scheduled,
            input,
          });
          return this.cloneExecution(execution);
        }

        // Save checkpoint on failure so resume can pick up from here
        if (this.checkpointManager) {
          await this.checkpointManager.saveCheckpoint(
            execution.id,
            result.step.name,
            [...completed],
            execution.outputs,
            this.policyConfig,
          );
        }

        execution.status = "failed";
        execution.error = result.error ?? `Step failed: ${result.step.name}`;
        execution.endedAt = this.now();
        await this.recordExecutionEnd(execution);
        return this.cloneExecution(execution);
      }
    }

    execution.status = "completed";
    execution.endedAt = this.now();
    await this.recordExecutionEnd(execution);
    return this.cloneExecution(execution);
  }

  private createExecution(name: string, workflow: Workflow, input: unknown, stepOrder: string[]): Execution {
    const startedAt = this.now();
    return {
      id: this.createExecutionId(),
      workflowName: name,
      status: "running",
      input,
      startedAt,
      stepOrder,
      completedSteps: [],
      stepRecords: Object.fromEntries(
        workflow.steps.map((step) => [
          step.name,
          {
            stepName: step.name,
            status: "pending" as ExecutionStepStatus,
          },
        ])
      ),
      outputs: {},
    };
  }

  private async runStep(
    execution: Execution,
    workflow: Workflow,
    step: Step,
    workflowInput: unknown,
    completed: Set<string>,
  ): Promise<{
    step: Step;
    status: "completed" | "failed" | "waiting" | "back_edge";
    targetStep?: string;
    error?: string;
  }> {
    const record = execution.stepRecords[step.name]!;
    record.status = "running";
    record.startedAt = this.now();
    await this.persistStep(execution, step.name);

    await this.recordAudit(execution.id, "step_start", {
      stepName: step.name,
      agent: step.agent,
    });

    const decision = this.dependencies.policyEngine.enforce(
      { type: "step_start", name: step.name, params: { agent: step.agent } },
      { stepName: step.name }
    );

    record.policyDecision = decision;
    await this.recordAudit(execution.id, "policy_check", {
      stepName: step.name,
      decision,
    });

    if (decision.type === "deny") {
      record.status = "failed";
      record.error = decision.reason;
      record.endedAt = this.now();
      await this.persistStep(execution, step.name);
      await this.recordAudit(execution.id, "policy_deny", {
        stepName: step.name,
        reason: decision.reason,
      });
      await this.recordAudit(execution.id, "step_end", {
        stepName: step.name,
        status: record.status,
        error: record.error,
      });
      return { step, status: "failed", error: decision.reason };
    }

    const gateDecision = this.mergeGateDecision(
      decision.type === "gate" ? decision : undefined,
      this.extractGateConfig(step)
    );

    if (gateDecision) {
      const approvedKey = `${execution.id}:${step.name}`;
      if (this.approvedGateSteps.has(approvedKey)) {
        this.approvedGateSteps.delete(approvedKey);
      } else {
        const gateWait = this.createGateWaitState(execution.id, step, gateDecision);
        await this.recordAudit(execution.id, "gate_wait", {
          stepName: step.name,
          gateType: gateDecision.gateType,
          timeout: gateWait.timeout,
        });
        if (this.options.onGate) {
          const gateResult = await this.options.onGate(execution, step, gateDecision);
          if (gateResult === "rejected") {
            record.status = "failed";
            record.error = `Gate rejected: ${gateDecision.gateType}`;
            record.endedAt = this.now();
            await this.persistStep(execution, step.name);
            await this.recordAudit(execution.id, "gate_resolve", {
              stepName: step.name,
              gateType: gateDecision.gateType,
              status: "rejected",
            });
            await this.recordAudit(execution.id, "step_end", {
              stepName: step.name,
              status: record.status,
              error: record.error,
            });
            return { step, status: "failed", error: record.error };
          }
          await this.recordAudit(execution.id, "gate_resolve", {
            stepName: step.name,
            gateType: gateDecision.gateType,
            status: "approved",
          });
        } else {
          record.status = "waiting";
          record.error = `Gate required: ${gateDecision.gateType}`;
          record.endedAt = this.now();
          execution.waitingGate = gateWait;
          await this.persistStep(execution, step.name);
          await this.gateWaitStateStore.save(gateWait);
          return { step, status: "waiting", error: record.error };
        }
      }
    }

    const cellId = this.dependencies.cellManager.createCell({
      config: this.buildCellConfig(step),
      runTask: async (task) => this.buildStepOutput(step, task, workflowInput, execution.outputs),
    });

    await this.recordAudit(execution.id, "cell_start", {
      stepName: step.name,
      cellId,
    }, { cellId });

    try {
      const result = await this.dependencies.cellManager.execute(cellId, this.stepToTask(step, workflowInput));
      record.result = result;
      record.endedAt = this.now();
      this.trackLoopCost(execution, workflow, step.name, result.metrics.costUsd);

      await this.recordAudit(execution.id, "cell_end", {
        stepName: step.name,
        success: result.success,
        metrics: result.metrics,
      }, { cellId });

      for (const toolCall of result.toolCalls) {
        await this.recordAudit(execution.id, "tool_call", {
          stepName: step.name,
          toolName: toolCall.toolName,
          params: toolCall.params,
        }, { cellId, durationMs: toolCall.durationMs });
        await this.recordAudit(execution.id, "tool_result", {
          stepName: step.name,
          toolName: toolCall.toolName,
          status: toolCall.status,
          result: toolCall.result,
          error: toolCall.error,
        }, { cellId, durationMs: toolCall.durationMs });
      }

      if (!result.success) {
        const failure = await this.handleStepFailure(execution, workflow, step, cellId, result.output, result.metrics.costUsd);
        await this.recordAudit(execution.id, "step_end", {
          stepName: step.name,
          status: failure.status === "back_edge" ? "failed" : "failed",
          error: failure.error,
        }, { cellId });
        return failure;
      }

      await this.bindStepState(execution, step, result);

      const consensusResult = await this.evaluateConsensusIfNeeded(step, execution);
      if (consensusResult) {
        record.consensus = consensusResult;
        await this.recordAudit(execution.id, "consensus_result", {
          stepName: step.name,
          result: consensusResult,
        });
        if (consensusResult.status !== "pass") {
          const reason = consensusResult.status === "fail" ? consensusResult.reason : `consensus ${consensusResult.status}`;
          const failure = await this.handleStepFailure(execution, workflow, step, cellId, { error: reason }, result.metrics.costUsd);
          await this.recordAudit(execution.id, "step_end", {
            stepName: step.name,
            status: "failed",
            error: failure.error,
          }, { cellId });
          return failure;
        }
      }

      record.status = "completed";
      record.endedAt = this.now();
      execution.outputs[step.name] = result.output;
      try {
        await this.captureArtifacts(execution.id, step.name, result.output, result.toolCalls);
      } catch (artifactError) {
        await this.recordAudit(execution.id, "warning", {
          stepName: step.name,
          message: "Artifact capture failed",
          error: artifactError instanceof Error ? artifactError.message : String(artifactError),
        }, { cellId });
      }
      await this.persistStep(execution, step.name);
      await this.recordAudit(execution.id, "step_end", {
        stepName: step.name,
        status: "completed",
      }, { cellId });
      return { step, status: "completed" };
    } finally {
      await this.dependencies.cellManager.stopCell(cellId, "Step execution finished");
    }
  }

  private async evaluateConsensusIfNeeded(step: Step, execution: Execution) {
    const consensusGate = this.dependencies.consensusGate;
    const consensusConfig = this.extractConsensusConfig(step);
    if (!consensusGate || !consensusConfig) {
      return undefined;
    }

    const session = consensusGate.setup(consensusConfig);
    const votes = await this.options.consensusVoteProvider?.(step, this.cloneExecution(execution), consensusConfig) ?? [];
    for (const vote of votes) {
      consensusGate.registerVote(session.id, vote);
      await this.recordAudit(execution.id, "consensus_vote", {
        stepName: step.name,
        sessionId: session.id,
        vote,
      });
    }
    return consensusGate.evaluate(session.id);
  }

  private async handleStepFailure(
    execution: Execution,
    workflow: Workflow,
    step: Step,
    cellId: string,
    output: unknown,
    cellCostUsd?: number,
  ): Promise<{ step: Step; status: "failed" | "completed" | "back_edge"; targetStep?: string; error?: string }> {
    const record = execution.stepRecords[step.name]!;
    const error = this.extractError(output);

    const backEdgeResult = await this.tryHandleBackEdge(execution, workflow, step, error, cellId, cellCostUsd);
    if (backEdgeResult) {
      return backEdgeResult;
    }

    const strategy = this.extractRecoveryStrategy(step, execution) ?? this.options.defaultRecoveryStrategy;
    if (strategy && this.dependencies.recoveryEngine) {
      await this.recordAudit(execution.id, "recovery_start", {
        stepName: step.name,
        strategy,
        error,
      }, { cellId });
      const recovery = await this.dependencies.recoveryEngine.handle(
        {
          executionId: execution.id,
          cellId,
          stepName: step.name,
          attempt: 1,
          error: new Error(error),
        },
        strategy
      );
      await this.recordAudit(execution.id, "recovery_end", {
        stepName: step.name,
        strategy,
        recovery,
      }, { cellId });
      record.recovery = recovery;
      if (recovery.status === "recovered") {
        record.status = "completed";
        record.endedAt = this.now();
        execution.outputs[step.name] = { recovered: true, strategy: strategy.type };
        await this.persistStep(execution, step.name);
        return { step, status: "completed" };
      }
    }

    record.status = "failed";
    record.error = error;
    record.endedAt ??= this.now();
    await this.persistStep(execution, step.name);
    return { step, status: "failed", error };
  }

  private async tryHandleBackEdge(
    execution: Execution,
    workflow: Workflow,
    step: Step,
    error: string,
    cellId: string,
    _cellCostUsd?: number,
  ): Promise<BackEdgeTriggerResult | undefined> {
    const onFail = step.on_fail;
    if (!onFail?.goto) {
      return undefined;
    }

    const state = this.getBackEdgeState(execution, step.name, onFail.goto);
    const maxCostEscalation = onFail.max_cost_escalation ?? onFail.escalate_on_exhaust;
    const exhausted = state.iterationCount >= onFail.max_iterations;
    const costExceeded = onFail.max_cost !== null && state.costUsd > onFail.max_cost;

    if (costExceeded || exhausted) {
      const escalation = costExceeded ? maxCostEscalation : onFail.escalate_on_exhaust;
      const escalationStrategy = this.toBackEdgeEscalationStrategy(escalation, step.name, onFail.goto, error);
      const recovery = await this.runRecovery(execution, step, cellId, error, escalationStrategy);
      execution.stepRecords[step.name]!.recovery = recovery;
      execution.stepRecords[step.name]!.status = "failed";
      execution.stepRecords[step.name]!.error = error;
      execution.stepRecords[step.name]!.endedAt = this.now();
      await this.persistStep(execution, step.name);

      if (costExceeded) {
        await this.recordAudit(execution.id, "workflow.back_edge_cost_exceeded", {
          source_step: step.name,
          target_step: onFail.goto,
          iteration: state.iterationCount,
          max_cost_usd: onFail.max_cost,
          actual_cost_usd: state.costUsd,
          escalation_action: escalation,
          timestamp: this.now().toISOString(),
        }, { cellId });
      } else {
        await this.recordAudit(execution.id, "workflow.back_edge_exhausted", {
          source_step: step.name,
          target_step: onFail.goto,
          total_iterations: state.iterationCount,
          escalation_action: escalation,
          total_cost_usd: state.costUsd,
          timestamp: this.now().toISOString(),
        }, { cellId });
      }

      return { step, status: "failed", error };
    }

    const nextState: BackEdgeState = {
      ...state,
      iterationCount: state.iterationCount + 1,
    };
    this.setBackEdgeState(execution, nextState);

    if (onFail.reset_state) {
      delete execution.outputs[onFail.goto];
    }

    await this.recordAudit(execution.id, "workflow.back_edge_triggered", {
      source_step: step.name,
      target_step: onFail.goto,
      iteration: nextState.iterationCount,
      reason: "FAIL",
      cost_so_far_usd: nextState.costUsd,
      timestamp: this.now().toISOString(),
    }, { cellId });

    await this.handleStarvation(execution, workflow, step.name, onFail.goto);
    await this.wait(onFail.cooldown_ms);

    const record = execution.stepRecords[step.name]!;
    record.status = "failed";
    record.error = error;
    record.endedAt = this.now();
    await this.persistStep(execution, step.name);
    return { step, status: "back_edge", targetStep: onFail.goto };
  }

  private loopStateKey(stepId: string, field: "iteration_count" | "cost_usd" | "target"): string {
    return `${LOOP_KEY_PREFIX}${stepId}.${field}`;
  }

  private getBackEdgeState(execution: Execution, source: string, target: string): BackEdgeState {
    const iterationRaw = execution.outputs[this.loopStateKey(source, "iteration_count")];
    const costRaw = execution.outputs[this.loopStateKey(source, "cost_usd")];
    const targetRaw = execution.outputs[this.loopStateKey(source, "target")];

    const iterationCount = typeof iterationRaw === "number" && Number.isFinite(iterationRaw) ? iterationRaw : 1;
    const costUsd = typeof costRaw === "number" && Number.isFinite(costRaw) ? costRaw : 0;
    const currentTarget = typeof targetRaw === "string" ? targetRaw : target;

    return { source, target: currentTarget, iterationCount, costUsd };
  }

  private setBackEdgeState(execution: Execution, state: BackEdgeState): void {
    execution.outputs[this.loopStateKey(state.source, "iteration_count")] = state.iterationCount;
    execution.outputs[this.loopStateKey(state.source, "cost_usd")] = state.costUsd;
    execution.outputs[this.loopStateKey(state.source, "target")] = state.target;
  }

  private trackLoopCost(execution: Execution, workflow: Workflow, stepName: string, costUsd: number | undefined): void {
    if (typeof costUsd !== "number" || !Number.isFinite(costUsd) || costUsd <= 0) {
      return;
    }

    const graph = buildGraph(workflow.steps);
    for (const sourceStep of workflow.steps) {
      const target = sourceStep.on_fail?.goto;
      if (!target) {
        continue;
      }
      if (!this.isStepInBackEdgeChain(graph.edges, target, sourceStep.name, stepName)) {
        continue;
      }

      const state = this.getBackEdgeState(execution, sourceStep.name, target);
      state.costUsd += costUsd;
      this.setBackEdgeState(execution, state);
    }
  }

  private isStepInBackEdgeChain(
    edges: Map<string, Set<string>>,
    chainTarget: string,
    chainSource: string,
    stepName: string,
  ): boolean {
    const reachable = (from: string, to: string): boolean => {
      if (from === to) {
        return true;
      }
      const visited = new Set<string>();
      const queue = [from];
      while (queue.length > 0) {
        const node = queue.shift()!;
        const deps = edges.get(node) ?? new Set<string>();
        for (const dep of deps) {
          if (dep === to) {
            return true;
          }
          if (!visited.has(dep)) {
            visited.add(dep);
            queue.push(dep);
          }
        }
      }
      return false;
    };

    return reachable(chainTarget, stepName) && reachable(stepName, chainSource);
  }

  private pruneForBackEdge(workflow: Workflow, completed: Set<string>, scheduled: Set<string>, targetStep: string): void {
    const graph = buildGraph(workflow.steps);
    const queue = [targetStep];
    const visited = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      completed.delete(current);
      scheduled.delete(current);

      const dependents = graph.edges.get(current) ?? new Set<string>();
      for (const dependent of dependents) {
        queue.push(dependent);
      }
    }
  }

  private async runRecovery(
    execution: Execution,
    step: Step,
    cellId: string,
    error: string,
    strategy: RecoveryStrategy | undefined,
  ) {
    if (!strategy || !this.dependencies.recoveryEngine) {
      return undefined;
    }

    await this.recordAudit(execution.id, "recovery_start", {
      stepName: step.name,
      strategy,
      error,
    }, { cellId });
    const recovery = await this.dependencies.recoveryEngine.handle(
      {
        executionId: execution.id,
        cellId,
        stepName: step.name,
        attempt: 1,
        error: new Error(error),
      },
      strategy,
    );
    await this.recordAudit(execution.id, "recovery_end", {
      stepName: step.name,
      strategy,
      recovery,
    }, { cellId });
    return recovery;
  }

  private toBackEdgeEscalationStrategy(
    escalation: "human" | "dlq" | "fail",
    source: string,
    target: string,
    error: string,
  ): RecoveryStrategy | undefined {
    if (escalation === "fail") {
      return undefined;
    }
    const channel = escalation === "human" ? "human" : "dlq";
    return {
      type: "escalate",
      severity: "high",
      channel,
      summary: `back-edge exhausted for ${source} -> ${target}: ${error}`,
    };
  }

  private async handleStarvation(
    execution: Execution,
    workflow: Workflow,
    sourceStep: string,
    targetStep: string,
  ): Promise<void> {
    const maxParallel = workflow.config?.max_parallel && workflow.config.max_parallel > 0
      ? workflow.config.max_parallel
      : 1;
    const ready = getNextSteps(workflow, new Set(execution.completedSteps)).filter((step) => step.name !== targetStep);
    if (ready.length === 0 || maxParallel > 1) {
      return;
    }

    const starvationRoot = (execution.metadata ??= {});
    const starvationMap = ((starvationRoot.__oboraStarvation as Record<string, string> | undefined) ??= {});
    const nowIso = this.now().toISOString();

    for (const blocked of ready) {
      const startedAt = starvationMap[blocked.name] ?? nowIso;
      starvationMap[blocked.name] = startedAt;
      const waitDurationMs = this.now().getTime() - new Date(startedAt).getTime();
      const timedOut = waitDurationMs > this.starvationTimeoutMs;

      await this.recordAudit(execution.id, "workflow.step_starvation_warning", {
        blocked_step: blocked.name,
        blocking_loop: { source: sourceStep, target: targetStep },
        wait_duration_ms: waitDurationMs,
        action: timedOut ? "timeout" : "continue",
        timestamp: this.now().toISOString(),
      });

      if (!timedOut) {
        continue;
      }

      const blockedRecord = execution.stepRecords[blocked.name];
      if (blockedRecord) {
        blockedRecord.status = "failed";
        blockedRecord.error = "starvation_timeout";
        blockedRecord.endedAt = this.now();
      }
      const recoveryStrategy = this.extractRecoveryStrategy(blocked, execution) ?? this.options.defaultRecoveryStrategy;
      const recovery = await this.runRecovery(
        execution,
        blocked,
        `starvation:${blocked.name}`,
        "starvation_timeout",
        recoveryStrategy,
      );
      if (blockedRecord) {
        blockedRecord.recovery = recovery;
      }
      await this.persistStep(execution, blocked.name);
    }
  }

  private extractGateConfig(step: Step): StepGateDecision | undefined {
    const rawStep = step as Step & { gate?: unknown; gate_config?: unknown; config?: Record<string, unknown> };
    const gate = rawStep.gate;
    const gateConfig = rawStep.gate_config ?? (rawStep.config as Record<string, unknown> | undefined)?.gate_config;

    const validGateTypes: GateWaitState["gateType"][] = ["human-approval", "consensus", "external"];

    const parseConfig = (value: unknown): StepGateDecision["config"] => {
      if (!value || typeof value !== "object") {
        return undefined;
      }
      const config = value as Record<string, unknown>;
      return {
        timeout: typeof config.timeout === "string" ? config.timeout : undefined,
        fallback:
          config.fallback === "fail" ||
          config.fallback === "escalate" ||
          config.fallback === "auto-approve"
            ? config.fallback
            : undefined,
      };
    };

    if (gate === undefined || gate === false) {
      return undefined;
    }

    if (gate === true) {
      const parsedConfig = parseConfig(gateConfig);
      const gateType = parsedConfig && gateConfig && typeof gateConfig === "object"
        && validGateTypes.includes((gateConfig as Record<string, unknown>).type as GateWaitState["gateType"])
        ? (gateConfig as Record<string, unknown>).type as GateWaitState["gateType"]
        : "human-approval";
      return { gateType, config: parsedConfig };
    }

    if (typeof gate === "string" && validGateTypes.includes(gate as GateWaitState["gateType"])) {
      return { gateType: gate as GateWaitState["gateType"], config: parseConfig(gateConfig) };
    }

    if (typeof gate === "object" && gate !== null) {
      const gateObj = gate as Record<string, unknown>;
      const gateType = typeof gateObj.type === "string" && validGateTypes.includes(gateObj.type as GateWaitState["gateType"])
        ? gateObj.type as GateWaitState["gateType"]
        : "human-approval";
      const mergedConfig = { ...parseConfig(gateObj), ...parseConfig(gateConfig) };
      return { gateType, config: mergedConfig };
    }

    return undefined;
  }

  private mergeGateDecision(
    policyDecision?: Extract<PolicyDecision, { type: "gate" }>,
    stepGate?: StepGateDecision
  ): RuntimeGateDecision | undefined {
    if (!policyDecision && !stepGate) {
      return undefined;
    }

    const policyConfig = policyDecision?.config && typeof policyDecision.config === "object"
      ? policyDecision.config as { timeout?: unknown; fallback?: unknown }
      : undefined;

    const mergedConfig = {
      timeout: typeof policyConfig?.timeout === "string" ? policyConfig.timeout : undefined,
      fallback:
        policyConfig?.fallback === "fail" ||
        policyConfig?.fallback === "escalate" ||
        policyConfig?.fallback === "auto-approve"
          ? policyConfig.fallback
          : undefined,
      ...stepGate?.config,
    };

    return {
      type: "gate",
      gateType: stepGate?.gateType ?? (policyDecision?.gateType as GateWaitState["gateType"] ?? "human-approval"),
      config: mergedConfig,
    };
  }

  /**
   * Consensus schema compatibility:
   * - Canonical (SCHEMAS.md): `step.consensus.rule`, `step.consensus.best_effort`
   * - Legacy compatibility: `step.consensus.type`, `step.consensus.bestEffort`
   * - Transitional fallback: `step.config.consensus` (older workflow fixtures)
   */
  private extractConsensusConfig(step: Step) {
    const directConsensus = (step as Step & { consensus?: Record<string, unknown> }).consensus;
    const fallbackConsensus = (step.config as Record<string, unknown> | undefined)?.consensus as
      | Record<string, unknown>
      | undefined;
    const raw = directConsensus ?? fallbackConsensus;

    if (!raw) {
      return undefined;
    }

    // SCHEMAS.md uses `consensus.min`; runtime consensus gate consumes `minRequired` internally.
    // Keep backward compatibility with legacy `minRequired` while prioritizing `min`.
    const minRequired = typeof raw.min === "number"
      ? raw.min
      : typeof raw.minRequired === "number"
        ? raw.minRequired
        : 1;

    const bestEffort = Array.isArray(raw.best_effort)
      ? raw.best_effort
      : Array.isArray(raw.bestEffort)
        ? raw.bestEffort
        : undefined;

    return {
      type:
        (raw.rule as "majority" | "unanimous" | "weighted" | "score-threshold" | "custom") ??
        (raw.type as "majority" | "unanimous" | "weighted" | "score-threshold" | "custom") ??
        "majority",
      voters: Array.isArray(raw.voters) ? raw.voters as Array<{ id: string; weight?: number }> : [],
      minRequired,
      threshold: typeof raw.threshold === "number" ? raw.threshold : undefined,
      timeout: typeof raw.timeout === "string" ? raw.timeout : undefined,
      bestEffort: Array.isArray(bestEffort) ? bestEffort.filter((value): value is string => typeof value === "string") : undefined,
    };
  }

  private extractRecoveryStrategy(step: Step, execution: Execution) {
    const workflow = this.workflows.get(execution.workflowName);
    const workflowRecovery = workflow?.recovery?.[step.name] as Record<string, unknown> | undefined;
    const legacyRecovery = (step.config as Record<string, unknown> | undefined)?.recovery as Record<string, unknown> | undefined;

    const modern = this.toRecoveryStrategyFromWorkflow(workflowRecovery);
    if (modern) {
      return modern;
    }

    return this.toRecoveryStrategyFromLegacy(legacyRecovery);
  }

  private toRecoveryStrategyFromWorkflow(raw?: Record<string, unknown>) {
    if (!raw || typeof raw.on_fail !== "string") {
      return undefined;
    }

    if (raw.on_fail === "retry") {
      return {
        type: "retry" as const,
        mode: (raw.backoff as "linear" | "exponential") ?? "linear",
        maxAttempts: typeof raw.max_retries === "number" ? raw.max_retries : 1,
        initialDelayMs: typeof raw.backoff_base === "string" ? parseDuration(raw.backoff_base) : 0,
        maxDelayMs: 0,
      };
    }

    if (raw.on_fail === "rollback") {
      return { type: "rollback" as const, snapshotId: String(raw.snapshot_id ?? raw.snapshotId ?? "") };
    }

    if (raw.on_fail === "escalate") {
      return {
        type: "escalate" as const,
        severity: "high" as const,
        channel: String(raw.to ?? "human"),
        summary: typeof raw.summary === "string" ? raw.summary : undefined,
      };
    }

    if (raw.on_fail === "alternative") {
      const fallback = raw.fallback as { name?: unknown } | undefined;
      return {
        type: "alternative" as const,
        stepName: typeof fallback?.name === "string" ? fallback.name : String(raw.to ?? ""),
        payload: fallback,
      };
    }

    if (raw.on_fail === "custom" && typeof raw.custom === "string") {
      return { type: "custom" as const, handlerPath: raw.custom };
    }

    return undefined;
  }

  private toRecoveryStrategyFromLegacy(raw?: Record<string, unknown>) {
    if (!raw || typeof raw.type !== "string") {
      return undefined;
    }

    if (raw.type === "retry") {
      return {
        type: "retry" as const,
        mode: (raw.mode as "linear" | "exponential") ?? "linear",
        maxAttempts: typeof raw.maxAttempts === "number" ? raw.maxAttempts : 1,
        initialDelayMs: typeof raw.initialDelayMs === "number" ? raw.initialDelayMs : 0,
        maxDelayMs: typeof raw.maxDelayMs === "number" ? raw.maxDelayMs : 0,
        multiplier: typeof raw.multiplier === "number" ? raw.multiplier : undefined,
      };
    }

    if (raw.type === "rollback") {
      return { type: "rollback" as const, snapshotId: String(raw.snapshotId ?? "") };
    }

    if (raw.type === "escalate") {
      return {
        type: "escalate" as const,
        severity: (raw.severity as "low" | "medium" | "high" | "critical") ?? "high",
        channel: String(raw.channel ?? "human"),
        summary: typeof raw.summary === "string" ? raw.summary : undefined,
      };
    }

    if (raw.type === "alternative") {
      return {
        type: "alternative" as const,
        stepName: String(raw.stepName ?? ""),
        payload: raw.payload,
      };
    }

    return undefined;
  }

  private createGateWaitState(
    executionId: string,
    step: Step,
    decision: RuntimeGateDecision
  ): GateWaitState {
    const config = (decision.config ?? {}) as {
      timeout?: string;
      fallback?: "fail" | "escalate" | "auto-approve";
    };
    return {
      executionId,
      stepName: step.name,
      gateType: decision.gateType as GateWaitState["gateType"],
      status: "waiting",
      createdAt: this.now(),
      timeout: config.timeout,
      fallback: config.fallback,
      persisted: true,
    };
  }

  private stepToTask(step: Step, input: unknown): Task {
    return {
      id: `${step.name}:${this.now().getTime()}`,
      type: `workflow-step:${step.name}`,
      description: step.description ?? `Execute workflow step ${step.name}`,
      input: {
        workflowInput: input,
        step,
      },
      priority: 0,
      metadata: {
        stepName: step.name,
        agent: step.agent,
      },
    };
  }

  private buildCellConfig(step: Step): { timeout?: number; metadata: Record<string, unknown> } {
    return {
      timeout: step.timeout ? parseDuration(step.timeout) : undefined,
      metadata: {
        stepName: step.name,
        agent: step.agent,
      },
    };
  }

  private buildStepOutput(
    step: Step,
    task: Task,
    workflowInput: unknown,
    outputs: Record<string, unknown>
  ): Record<string, unknown> {
    return {
      stepName: step.name,
      agent: step.agent,
      task,
      workflowInput,
      previousOutputs: { ...outputs },
    };
  }

  private async bindStepState(execution: Execution, step: Step, result: { success: boolean; output: unknown }): Promise<void> {
    const bindings = this.extractStateBindings(step);
    if (!this.dependencies.stateBinder || bindings.length === 0) {
      return;
    }

    await this.dependencies.stateBinder.bind(result, bindings);
  }

  private extractStateBindings(step: Step): StateBinding[] {
    const directBindings = (step as Step & { bindings?: unknown }).bindings;
    if (Array.isArray(directBindings)) {
      return directBindings.filter(this.isStateBinding);
    }

    const config = step.config as Record<string, unknown> | undefined;
    const configBindings = config?.bindings;
    if (Array.isArray(configBindings)) {
      return configBindings.filter(this.isStateBinding);
    }

    return [];
  }

  private readonly isStateBinding = (value: unknown): value is StateBinding => {
    if (!value || typeof value !== "object") {
      return false;
    }

    const candidate = value as Record<string, unknown>;
    return typeof candidate.source === "string" && typeof candidate.target === "string";
  };

  private async recordExecutionEnd(execution: Execution): Promise<void> {
    await this.recordAudit(execution.id, "execution_end", {
      status: execution.status,
      completedSteps: execution.completedSteps,
      error: execution.error,
      endedAt: execution.endedAt,
    });
    await this.persistRun(execution);
  }

  // ── Persistence hooks (opt-in) ──

  private static mapExecutionStatusToRunStatus(status: Execution["status"]): RunRecord["status"] {
    switch (status) {
      case "running": return "running";
      case "completed": return "completed";
      case "failed": return "failed";
      case "waiting":
      case "suspended": return "suspended";
      default: return "running";
    }
  }

  private async persistRun(execution: Execution): Promise<void> {
    const adapter = this.dependencies.storageAdapter;
    if (!adapter) return;
    const input = (typeof execution.input === "object" && execution.input !== null && !Array.isArray(execution.input))
      ? execution.input as Record<string, unknown>
      : { value: execution.input };
    await adapter.saveRun({
      id: execution.id,
      workflowName: execution.workflowName,
      status: DefaultRuntimeOrchestrator.mapExecutionStatusToRunStatus(execution.status),
      input,
      startedAt: execution.startedAt.toISOString(),
      completedAt: execution.endedAt?.toISOString(),
      metadata: execution.metadata,
    });
  }

  private async persistStep(execution: Execution, stepName: string): Promise<void> {
    const adapter = this.dependencies.storageAdapter;
    if (!adapter) return;
    const rec = execution.stepRecords[stepName];
    if (!rec) return;
    await adapter.saveStep({
      id: `${execution.id}:${stepName}`,
      runId: execution.id,
      stepName,
      status: rec.status === "pending" || rec.status === "waiting" ? "running" : rec.status as StepRecord["status"],
      input: undefined,
      output: rec.result ? (rec.result as unknown as Record<string, unknown>) : undefined,
      error: rec.error ? this.toStepError(rec) : undefined,
      startedAt: rec.startedAt?.toISOString() ?? new Date().toISOString(),
      completedAt: rec.endedAt?.toISOString(),
      durationMs: rec.startedAt && rec.endedAt
        ? rec.endedAt.getTime() - rec.startedAt.getTime()
        : undefined,
    });
  }

  private toStepError(rec: { error?: string; recovery?: { error?: unknown } }): StepRecord["error"] {
    // Try to extract structured error info from recovery context
    const raw = rec.recovery?.error;
    if (raw && typeof raw === "object" && raw !== null && "code" in raw && "message" in raw) {
      const err = raw as { code: string; message: string; stack?: string };
      return { code: err.code, message: err.message, stack: err.stack };
    }
    // For OboraError-like objects with code property
    if (raw instanceof Error) {
      const code = "code" in raw && typeof (raw as Record<string, unknown>).code === "string"
        ? (raw as Record<string, unknown>).code as string
        : "STEP_ERROR";
      return { code, message: raw.message, stack: raw.stack };
    }
    return { code: "STEP_ERROR", message: rec.error ?? "Unknown error" };
  }

  private async captureArtifacts(
    runId: string,
    stepName: string,
    output: unknown,
    toolCalls: Array<{ toolName?: string; params?: unknown; status?: string }>,
  ): Promise<void> {
    const store = this.dependencies.artifactStore;
    const adapter = this.dependencies.storageAdapter;
    if (!store || !adapter) return;

    const candidates: Array<{ name: string; mime: string; data: Buffer }> = [];

    // Rule 1) explicit artifacts tag in step output
    if (output && typeof output === "object" && "artifacts" in (output as Record<string, unknown>)) {
      const tagged = (output as Record<string, unknown>).artifacts;
      const list = Array.isArray(tagged) ? tagged : [tagged];
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const name = typeof rec.name === "string" ? rec.name : undefined;
        const mime = typeof rec.mime === "string" ? rec.mime : "application/octet-stream";
        const data = rec.data;
        if (!name || data === undefined || data === null) continue;
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(typeof data === "string" ? data : JSON.stringify(data), "utf-8");
        candidates.push({ name, mime, data: buf });
      }
    }

    // Rule 2) file_write tool calls
    for (const tool of toolCalls) {
      if (tool.toolName !== "file_write" || tool.status !== "success") continue;
      const params = tool.params as Record<string, unknown> | undefined;
      if (!params) continue;
      const path = typeof params.path === "string" ? params.path : undefined;
      const content = typeof params.content === "string" ? params.content : undefined;
      if (!path || content === undefined) continue;
      const parts = path.split(/[\\/]/);
      const name = parts[parts.length - 1] ?? `${stepName}.txt`;
      candidates.push({ name, mime: "text/plain", data: Buffer.from(content, "utf-8") });
    }

    // Rule 3) structured JSON output fallback (only when no explicit artifacts were detected)
    if (candidates.length === 0 && output && typeof output === "object" && !Array.isArray(output)) {
      candidates.push({
        name: `${stepName}.json`,
        mime: "application/json",
        data: Buffer.from(JSON.stringify(output, null, 2), "utf-8"),
      });
    }

    const seen = new Set<string>();
    for (const c of candidates) {
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      const saved = await store.save(runId, stepName, c.name, c.data, c.mime);
      await adapter.saveArtifact({
        id: saved.id,
        runId: saved.runId,
        stepName: saved.stepName,
        name: saved.name,
        mimeType: saved.mime,
        sizeBytes: saved.size,
        storageRef: saved.path,
        createdAt: saved.createdAt,
      });
    }
  }

  private async recordAudit(
    executionId: string,
    type: AuditEventType,
    data: unknown,
    options: { cellId?: string; durationMs?: number } = {}
  ): Promise<void> {
    const event = {
      id: randomUUID(),
      executionId,
      cellId: options.cellId,
      timestamp: this.now(),
      type,
      data,
      metadata: options.durationMs !== undefined ? { durationMs: options.durationMs } : undefined,
    };

    if (this.dependencies.auditTrail) {
      await this.dependencies.auditTrail.record(event);
    }

    await persistStructuredAuditEvent(this.dependencies.storageAdapter, executionId, event);
  }

  private extractError(output: unknown): string {
    if (output && typeof output === "object" && "error" in (output as Record<string, unknown>)) {
      const value = (output as Record<string, unknown>).error;
      if (typeof value === "string") {
        return value;
      }
    }
    return "Step execution failed";
  }

  private cloneExecution(execution: Execution): Execution {
    return structuredClone(execution);
  }
}
