import { randomUUID } from "node:crypto";
import { generateExecutionPlan, getNextSteps, parseWorkflow, type Step, type Workflow } from "../_legacy/workflow/index.js";
import type { CellManager } from "../cell/CellManager.js";
import type { Task } from "../cell/types.js";
import type { AuditTrail } from "../audit/AuditTrail.js";
import type { AuditEventType } from "../audit/types.js";
import type { ConsensusGate } from "../consensus/ConsensusGate.js";
import type { PolicyEngine } from "../policy/PolicyEngine.js";
import type { PolicyDecision } from "../policy/types.js";
import type { RecoveryEngine } from "../recovery/types.js";
import type { StateBinder, StateBinding } from "../state/StateBinder.js";
import type { StorageAdapter, RunRecord, StepRecord, ResumeOptions } from "../storage/types.js";
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
  private readonly gateWaitStateStore: GateWaitStateStore;

  private policyConfig: PolicyHashInput = {};
  private checkpointManager?: CheckpointManager;

  constructor(
    private readonly dependencies: RuntimeOrchestratorDependencies,
    private readonly options: RuntimeOrchestratorOptions = {}
  ) {
    this.createExecutionId = options.createExecutionId ?? (() => randomUUID());
    this.now = options.now ?? (() => new Date());
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
      await this.recordAudit(runId, "snapshot_restore", {
        category: "recovery",
        action: "policy_drift_detected",
        oldHash: drift.oldHash,
        newHash: drift.newHash,
        driftAction: driftPolicy,
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
          record.status = "completed";
        }
      } else {
        rerunSteps.push(policy.stepName);
      }
    }

    await this.persistRun(execution);

    // Execute remaining steps
    const result = await this.executeLoop(execution, workflow, runRecord.input, completed, scheduled);

    // Save final checkpoint
    if (this.checkpointManager) {
      const lastStep = allStepNames[allStepNames.length - 1];
      await this.checkpointManager.saveCheckpoint(
        execution.id,
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

      const batchResults = await Promise.all(runnable.map((step) => this.runStep(execution, step, input)));

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

  private async runStep(execution: Execution, step: Step, workflowInput: unknown): Promise<{
    step: Step;
    status: "completed" | "failed" | "waiting";
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
        const failure = await this.handleStepFailure(execution, step, cellId, result.output);
        await this.recordAudit(execution.id, "step_end", {
          stepName: step.name,
          status: "failed",
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
          const failure = await this.handleStepFailure(execution, step, cellId, { error: reason });
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
    step: Step,
    cellId: string,
    output: unknown
  ): Promise<{ step: Step; status: "failed" | "completed"; error?: string }> {
    const record = execution.stepRecords[step.name]!;
    const error = this.extractError(output);

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

  private async recordAudit(
    executionId: string,
    type: AuditEventType,
    data: unknown,
    options: { cellId?: string; durationMs?: number } = {}
  ): Promise<void> {
    if (!this.dependencies.auditTrail) {
      return;
    }

    await this.dependencies.auditTrail.record({
      id: randomUUID(),
      executionId,
      cellId: options.cellId,
      timestamp: this.now(),
      type,
      data,
      metadata: options.durationMs !== undefined ? { durationMs: options.durationMs } : undefined,
    });
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
