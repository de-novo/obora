import { randomUUID } from "node:crypto";
import { generateExecutionPlan, getNextSteps, parseWorkflow, type Step, type Workflow } from "@obora/core";
import type { CellManager } from "../cell/CellManager.js";
import type { Task } from "../cell/types.js";
import type { ConsensusGate } from "../consensus/ConsensusGate.js";
import type { PolicyEngine } from "../policy/PolicyEngine.js";
import type { PolicyDecision } from "../policy/types.js";
import type { RecoveryEngine } from "../recovery/types.js";
import { parseDuration } from "./utils.js";
import type {
  Execution,
  ExecutionFilter,
  ExecutionStepStatus,
  GateWaitState,
  GateWaitStateStore,
  RuntimeOrchestrator as RuntimeOrchestratorContract,
  RuntimeOrchestratorOptions,
} from "./types.js";

export interface RuntimeOrchestratorDependencies {
  cellManager: CellManager;
  policyEngine: PolicyEngine;
  consensusGate?: ConsensusGate;
  recoveryEngine?: RecoveryEngine;
  gateWaitStateStore?: GateWaitStateStore;
}

interface WaitingContext {
  workflow: Workflow;
  step: Step;
  completed: Set<string>;
  scheduled: Set<string>;
  input: unknown;
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

  constructor(
    private readonly dependencies: RuntimeOrchestratorDependencies,
    private readonly options: RuntimeOrchestratorOptions = {}
  ) {
    this.createExecutionId = options.createExecutionId ?? (() => randomUUID());
    this.now = options.now ?? (() => new Date());
    this.gateWaitStateStore = dependencies.gateWaitStateStore ?? inMemoryGateStateStore();
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

    const completed = new Set<string>();
    const scheduled = new Set<string>();
    return this.executeLoop(execution, workflow, input, completed, scheduled);
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

    const record = execution.stepRecords[execution.waitingGate.stepName]!;
    record.status = "failed";
    record.error = reason;
    record.endedAt = this.now();

    execution.status = "failed";
    execution.error = reason;
    execution.endedAt = this.now();
    execution.waitingGate = undefined;
    this.waitingContexts.delete(executionId);

    return this.cloneExecution(execution);
  }

  async onGateTimeout(executionId: string): Promise<Execution> {
    const execution = this.requireExecution(executionId);
    const gate = execution.waitingGate;
    if (!gate) {
      throw new Error(`Execution is not waiting on gate: ${executionId}`);
    }

    gate.status = "timeout";
    await this.gateWaitStateStore.save(gate);
    await this.gateWaitStateStore.delete(executionId);

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

        execution.status = "failed";
        execution.error = result.error ?? `Step failed: ${result.step.name}`;
        execution.endedAt = this.now();
        return this.cloneExecution(execution);
      }
    }

    execution.status = "completed";
    execution.endedAt = this.now();
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

    const decision = this.dependencies.policyEngine.enforce(
      { type: "step_start", name: step.name, params: { agent: step.agent } },
      { stepName: step.name }
    );

    record.policyDecision = decision;

    if (decision.type === "deny") {
      record.status = "failed";
      record.error = decision.reason;
      record.endedAt = this.now();
      return { step, status: "failed", error: decision.reason };
    }

    if (decision.type === "gate") {
      const approvedKey = `${execution.id}:${step.name}`;
      if (this.approvedGateSteps.has(approvedKey)) {
        this.approvedGateSteps.delete(approvedKey);
      } else {
        const gateWait = this.createGateWaitState(execution.id, step, decision);
        if (this.options.onGate) {
          const gateResult = await this.options.onGate(execution, step, decision);
          if (gateResult === "rejected") {
            record.status = "failed";
            record.error = `Gate rejected: ${decision.gateType}`;
            record.endedAt = this.now();
            return { step, status: "failed", error: record.error };
          }
        } else {
          record.status = "waiting";
          record.error = `Gate required: ${decision.gateType}`;
          record.endedAt = this.now();
          execution.waitingGate = gateWait;
          await this.gateWaitStateStore.save(gateWait);
          return { step, status: "waiting", error: record.error };
        }
      }
    }

    const cellId = this.dependencies.cellManager.createCell({
      config: this.buildCellConfig(step),
      runTask: async (task) => this.buildStepOutput(step, task, workflowInput, execution.outputs),
    });

    try {
      const result = await this.dependencies.cellManager.execute(cellId, this.stepToTask(step, workflowInput));
      record.result = result;
      record.endedAt = this.now();

      if (!result.success) {
        return this.handleStepFailure(execution, step, cellId, result.output);
      }

      const consensusResult = await this.evaluateConsensusIfNeeded(step, execution);
      if (consensusResult) {
        record.consensus = consensusResult;
        if (consensusResult.status !== "pass") {
          const reason = consensusResult.status === "fail" ? consensusResult.reason : `consensus ${consensusResult.status}`;
          return this.handleStepFailure(execution, step, cellId, { error: reason });
        }
      }

      record.status = "completed";
      execution.outputs[step.name] = result.output;
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
    votes.forEach((vote) => consensusGate.registerVote(session.id, vote));
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

    const strategy = this.extractRecoveryStrategy(step) ?? this.options.defaultRecoveryStrategy;
    if (strategy && this.dependencies.recoveryEngine) {
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
      record.recovery = recovery;
      if (recovery.status === "recovered") {
        record.status = "completed";
        execution.outputs[step.name] = { recovered: true, strategy: strategy.type };
        return { step, status: "completed" };
      }
    }

    record.status = "failed";
    record.error = error;
    return { step, status: "failed", error };
  }

  private extractConsensusConfig(step: Step) {
    const config = step.config as Record<string, unknown> | undefined;
    const raw = config?.consensus as Record<string, unknown> | undefined;
    if (!raw) {
      return undefined;
    }

    return {
      type: (raw.type as "majority" | "unanimous" | "weighted" | "score-threshold" | "custom") ?? "majority",
      voters: Array.isArray(raw.voters) ? raw.voters as Array<{ id: string; weight?: number }> : [],
      minRequired: typeof raw.minRequired === "number" ? raw.minRequired : 1,
      threshold: typeof raw.threshold === "number" ? raw.threshold : undefined,
      timeout: typeof raw.timeout === "string" ? raw.timeout : undefined,
      bestEffort: Array.isArray(raw.bestEffort) ? raw.bestEffort as string[] : undefined,
    };
  }

  private extractRecoveryStrategy(step: Step) {
    const config = step.config as Record<string, unknown> | undefined;
    const raw = config?.recovery as Record<string, unknown> | undefined;
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
    decision: Extract<PolicyDecision, { type: "gate" }>
  ): GateWaitState {
    const config = (decision.config ?? {}) as { timeout?: string; fallback?: "fail" | "escalate" };
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
