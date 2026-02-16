import { randomUUID } from "node:crypto";
import { generateExecutionPlan, getNextSteps, parseWorkflow, type Step, type Workflow } from "@obora/core";
import type { CellManager } from "../cell/CellManager.js";
import type { Task } from "../cell/types.js";
import type { PolicyEngine } from "../policy/PolicyEngine.js";
import { parseDuration } from "./utils.js";
import type {
  Execution,
  ExecutionFilter,
  ExecutionStepStatus,
  RuntimeOrchestrator as RuntimeOrchestratorContract,
  RuntimeOrchestratorOptions,
} from "./types.js";

export interface RuntimeOrchestratorDependencies {
  cellManager: CellManager;
  policyEngine: PolicyEngine;
}

export class DefaultRuntimeOrchestrator implements RuntimeOrchestratorContract {
  private readonly workflows = new Map<string, Workflow>();
  private readonly executions = new Map<string, Execution>();
  private readonly createExecutionId: () => string;
  private readonly now: () => Date;

  constructor(
    private readonly dependencies: RuntimeOrchestratorDependencies,
    private readonly options: RuntimeOrchestratorOptions = {}
  ) {
    this.createExecutionId = options.createExecutionId ?? (() => randomUUID());
    this.now = options.now ?? (() => new Date());
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
          execution.endedAt = this.now();
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
        return { step, status: "waiting", error: record.error };
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
        record.status = "failed";
        record.error = this.extractError(result.output);
        return { step, status: "failed", error: record.error };
      }

      record.status = "completed";
      execution.outputs[step.name] = result.output;
      return { step, status: "completed" };
    } finally {
      await this.dependencies.cellManager.stopCell(cellId, "Step execution finished");
    }
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
