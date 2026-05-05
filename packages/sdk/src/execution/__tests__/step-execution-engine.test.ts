import { describe, it, expect, vi, beforeEach } from "vitest";
import { StepExecutionEngine } from "../step-execution-engine.js";
import { OboraError } from "../../runtime-types.js";
import type { EventBus } from "../../events/event-bus.js";
import type { RepairLoopTracker } from "../repair-loop-tracker.js";
import type { StepExecutor } from "../../step-executor.js";
import type { CostTracker } from "../../cost-tracker.js";
import type { BlackboardManager } from "../../blackboard/blackboard-manager.js";
import type { ExecutionObserver } from "../../blackboard/execution-observer.js";
import type { WorkflowDef, WorkflowStep } from "../../workflow.js";
import type { RuntimeExecution } from "../../runtime-types.js";
import type { StorageAdapter } from "@obora/runtime";

function createEngine() {
  const eventBus: EventBus = { emit: vi.fn().mockResolvedValue(undefined) } as any;
  const repairLoopTracker: RepairLoopTracker = {
    recordRepairStarted: vi.fn(),
    recordRepairCompleted: vi.fn(),
    recordRepairNoProgress: vi.fn(),
    recordValidationPass: vi.fn(),
    recordValidationFailure: vi.fn(),
    recordBackEdgeTriggered: vi.fn(),
    recordBackEdgeExhausted: vi.fn(),
  } as any;

  const engine = new StepExecutionEngine({
    eventBus,
    config: { logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } } as any,
    repairLoopTracker,
  });

  return { engine, eventBus, repairLoopTracker };
}

function createMockStepExecutor(): StepExecutor {
  return {
    executeStep: vi.fn().mockResolvedValue({ output: "result", raw: {} }),
  } as unknown as StepExecutor;
}

function createMockBlackboard(): BlackboardManager {
  return {
    recordStepStart: vi.fn(),
    recordStepEnd: vi.fn(),
    recordStepOutput: vi.fn(),
    recordValidation: vi.fn(),
    getFailureHistory: vi.fn().mockReturnValue([]),
    getSnapshot: vi.fn().mockReturnValue({
      facts: [],
      failures: [],
      stepOutputs: {},
      stepTimings: {},
    }),
  } as unknown as BlackboardManager;
}

function createMockPersistenceAdapter(): StorageAdapter {
  return {
    saveStep: vi.fn().mockResolvedValue(undefined),
    getSteps: vi.fn().mockResolvedValue([]),
    getRun: vi.fn().mockResolvedValue(null),
    saveRun: vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageAdapter;
}

function createWorkflowDef(steps: WorkflowStep[]): WorkflowDef {
  return {
    name: "test",
    version: "1.0",
    steps,
  };
}

describe("StepExecutionEngine - executeSingleStep", () => {
  it("executes a single step with hooks and persistence", async () => {
    const { engine, eventBus } = createEngine();
    const stepExecutor = createMockStepExecutor();
    const blackboard = createMockBlackboard();
    const persistenceAdapter = createMockPersistenceAdapter();

    const step: WorkflowStep = {
      name: "step1",
      agent: "agent1",
      input: { task: "test" },
    };
    const workflow = createWorkflowDef([step]);
    const execution: RuntimeExecution = {
      id: "exec-1",
      workflowName: "test",
      status: "running",
      input: {},
      startedAt: new Date(),
      stepOrder: ["step1"],
      completedSteps: [],
      stepRecords: {},
      outputs: {},
    };

    const result = await engine.executeSingleStep(
      step, workflow, execution, stepExecutor, undefined,
      "exec-1", true, persistenceAdapter, undefined, blackboard
    );

    expect(result.output).toBe("result");
    expect(execution.completedSteps).toContain("step1");
    expect(persistenceAdapter.saveStep).toHaveBeenCalled();
    expect(eventBus.emit).toHaveBeenCalledWith("step_start", "exec-1", expect.any(Object));
    expect(eventBus.emit).toHaveBeenCalledWith("step_end", "exec-1", expect.any(Object));
    expect(blackboard.recordStepStart).toHaveBeenCalledWith("step1");
    expect(blackboard.recordStepEnd).toHaveBeenCalledWith("step1");
  });

  it("throws when no stepExecutor for non-parallel step", async () => {
    const { engine } = createEngine();
    const step: WorkflowStep = { name: "step1", agent: "agent1", input: {} };
    const workflow = createWorkflowDef([step]);
    const execution: RuntimeExecution = {
      id: "exec-1", workflowName: "test", status: "running",
      input: {}, startedAt: new Date(), stepOrder: ["step1"],
      completedSteps: [], stepRecords: {}, outputs: {},
    };

    await expect(
      engine.executeSingleStep(step, workflow, execution, undefined, undefined, "exec-1", false, null)
    ).rejects.toThrow(/LLM adapter/);
  });

  it("handles parallel branches within a step", async () => {
    const { engine } = createEngine();
    const stepExecutor = createMockStepExecutor();
    vi.mocked(stepExecutor.executeStep).mockResolvedValue({ output: "branch-result", raw: {} });

    const step: WorkflowStep = {
      name: "step1",
      agent: "agent1",
      input: {},
      parallel: [
        { agent: "agent-a", input: { task: "a" } },
        { agent: "agent-b", input: { task: "b" } },
      ],
      merge: "concat",
    };
    const workflow = createWorkflowDef([step]);
    const execution: RuntimeExecution = {
      id: "exec-1", workflowName: "test", status: "running",
      input: {}, startedAt: new Date(), stepOrder: ["step1"],
      completedSteps: [], stepRecords: {}, outputs: {},
    };

    const result = await engine.executeSingleStep(
      step, workflow, execution, stepExecutor, undefined, "exec-1", false, null
    );

    expect(result.output).toEqual(["branch-result", "branch-result"]);
    expect(stepExecutor.executeStep).toHaveBeenCalledTimes(2);
  });

  it("throws when all parallel branches fail", async () => {
    const { engine } = createEngine();
    const stepExecutor = createMockStepExecutor();
    vi.mocked(stepExecutor.executeStep).mockRejectedValue(new Error("branch fail"));

    const step: WorkflowStep = {
      name: "step1",
      agent: "agent1",
      input: {},
      parallel: [{ agent: "agent-a", input: {} }],
    };
    const workflow = createWorkflowDef([step]);
    const execution: RuntimeExecution = {
      id: "exec-1", workflowName: "test", status: "running",
      input: {}, startedAt: new Date(), stepOrder: ["step1"],
      completedSteps: [], stepRecords: {}, outputs: {},
    };

    await expect(
      engine.executeSingleStep(step, workflow, execution, stepExecutor, undefined, "exec-1", false, null)
    ).rejects.toThrow(/All parallel branches failed/);
  });

  it("handles cost tracker preStepGate", async () => {
    const { engine } = createEngine();
    const stepExecutor = createMockStepExecutor();
    const costTracker: CostTracker = {
      preStepGate: vi.fn().mockResolvedValue(undefined),
    } as any;

    const step: WorkflowStep = { name: "step1", agent: "agent1", input: {} };
    const workflow = createWorkflowDef([step]);
    const execution: RuntimeExecution = {
      id: "exec-1", workflowName: "test", status: "running",
      input: {}, startedAt: new Date(), stepOrder: ["step1"],
      completedSteps: [], stepRecords: {}, outputs: {},
    };

    await engine.executeSingleStep(
      step, workflow, execution, stepExecutor, costTracker, "exec-1", false, null
    );

    expect(costTracker.preStepGate).toHaveBeenCalledWith("step1");
  });

  it("handles persistence save failure gracefully", async () => {
    const { engine, eventBus } = createEngine();
    const stepExecutor = createMockStepExecutor();
    const persistenceAdapter = createMockPersistenceAdapter();
    vi.mocked(persistenceAdapter.saveStep).mockRejectedValue(new Error("save failed"));

    const step: WorkflowStep = { name: "step1", agent: "agent1", input: {} };
    const workflow = createWorkflowDef([step]);
    const execution: RuntimeExecution = {
      id: "exec-1", workflowName: "test", status: "running",
      input: {}, startedAt: new Date(), stepOrder: ["step1"],
      completedSteps: [], stepRecords: {}, outputs: {},
    };

    // Should not throw
    await engine.executeSingleStep(
      step, workflow, execution, stepExecutor, undefined, "exec-1", true, persistenceAdapter
    );

    expect(persistenceAdapter.saveStep).toHaveBeenCalled();
    // step_end should still be emitted
    expect(eventBus.emit).toHaveBeenCalledWith("step_end", "exec-1", expect.any(Object));
  });
});

describe("StepExecutionEngine - executeStepLoop", () => {
  it("executes steps sequentially and records outputs", async () => {
    const { engine, eventBus } = createEngine();
    const stepExecutor = createMockStepExecutor();

    const steps: WorkflowStep[] = [
      { name: "step1", agent: "agent1", input: {} },
      { name: "step2", agent: "agent2", input: {} },
    ];
    const workflow = createWorkflowDef(steps);
    const execution: RuntimeExecution = {
      id: "exec-1", workflowName: "test", status: "running",
      input: {}, startedAt: new Date(), stepOrder: ["step1", "step2"],
      completedSteps: [], stepRecords: {}, outputs: {},
    };

    await engine.executeStepLoop(
      steps, workflow, execution, stepExecutor, undefined,
      "exec-1", false, null
    );

    expect(execution.completedSteps).toEqual(["step1", "step2"]);
    expect(execution.outputs.step1).toBe("result");
    expect(execution.outputs.step2).toBe("result");
  });

  it("handles back-edge routing on step failure", async () => {
    const { engine, eventBus } = createEngine();
    const stepExecutor = createMockStepExecutor();
    vi.mocked(stepExecutor.executeStep)
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce({ output: "retry-success", raw: {} });

    const steps: WorkflowStep[] = [
      { name: "step1", agent: "agent1", input: {}, on_fail: { goto: "step1", max_iterations: 2 } },
    ];
    const workflow = createWorkflowDef(steps);
    const execution: RuntimeExecution = {
      id: "exec-1", workflowName: "test", status: "running",
      input: {}, startedAt: new Date(), stepOrder: ["step1"],
      completedSteps: [], stepRecords: {}, outputs: {},
    };

    await engine.executeStepLoop(
      steps, workflow, execution, stepExecutor, undefined,
      "exec-1", false, null
    );

    expect(execution.completedSteps).toEqual(["step1"]);
    expect(eventBus.emit).toHaveBeenCalledWith("workflow.back_edge_triggered", "exec-1", expect.any(Object));
  });

  it("throws when back-edge max iterations exceeded", async () => {
    const { engine, eventBus } = createEngine();
    const stepExecutor = createMockStepExecutor();
    vi.mocked(stepExecutor.executeStep).mockRejectedValue(new Error("always fails"));

    const steps: WorkflowStep[] = [
      { name: "step1", agent: "agent1", input: {}, on_fail: { goto: "step1", max_iterations: 1 } },
    ];
    const workflow = createWorkflowDef(steps);
    const execution: RuntimeExecution = {
      id: "exec-1", workflowName: "test", status: "running",
      input: {}, startedAt: new Date(), stepOrder: ["step1"],
      completedSteps: [], stepRecords: {}, outputs: {},
    };

    await expect(
      engine.executeStepLoop(steps, workflow, execution, stepExecutor, undefined, "exec-1", false, null)
    ).rejects.toThrow("always fails");

    expect(eventBus.emit).toHaveBeenCalledWith("workflow.back_edge_exhausted", "exec-1", expect.any(Object));
  });

  it("respects signal abort", async () => {
    const { engine } = createEngine();
    const stepExecutor = createMockStepExecutor();
    const controller = new AbortController();
    controller.abort();

    const steps: WorkflowStep[] = [
      { name: "step1", agent: "agent1", input: {} },
    ];
    const workflow = createWorkflowDef(steps);
    const execution: RuntimeExecution = {
      id: "exec-1", workflowName: "test", status: "running",
      input: {}, startedAt: new Date(), stepOrder: ["step1"],
      completedSteps: [], stepRecords: {}, outputs: {},
    };

    await engine.executeStepLoop(
      steps, workflow, execution, stepExecutor, undefined,
      "exec-1", false, null, controller.signal
    );

    expect(execution.completedSteps).toHaveLength(0);
  });

  it("handles validation failure and back-edge", async () => {
    const { engine, eventBus } = createEngine();
    const stepExecutor = createMockStepExecutor();
    vi.mocked(stepExecutor.executeStep)
      .mockResolvedValueOnce({
        output: { passed: false, summary: "validation failed", failedChecks: [{ name: "check1", message: "failed" }], signature: "sig1" },
        raw: {},
      })
      .mockResolvedValueOnce({ output: "success", raw: {} });

    const steps: WorkflowStep[] = [
      {
        name: "step1",
        agent: "agent1",
        input: {},
        config: {
          validation: {
            enabled: true,
            emit_structured_result: false,
          },
        },
        on_fail: { goto: "step1", max_iterations: 2 },
      },
    ];
    const workflow = createWorkflowDef(steps);
    const execution: RuntimeExecution = {
      id: "exec-1", workflowName: "test", status: "running",
      input: {}, startedAt: new Date(), stepOrder: ["step1"],
      completedSteps: [], stepRecords: {}, outputs: {},
    };

    await engine.executeStepLoop(
      steps, workflow, execution, stepExecutor, undefined,
      "exec-1", false, null
    );

    // The validation output triggers back-edge, then retry succeeds
    expect(execution.completedSteps).toContain("step1");
    expect(stepExecutor.executeStep).toHaveBeenCalledTimes(2);
    expect(eventBus.emit).toHaveBeenCalledWith("workflow.validation_failed", "exec-1", expect.any(Object));
    expect(eventBus.emit).toHaveBeenCalledWith("workflow.back_edge_triggered", "exec-1", expect.any(Object));
  });
});

describe("StepExecutionEngine - executeParallelStepLoop", () => {
  it("executes multi-step layers in parallel", async () => {
    const { engine, eventBus } = createEngine();
    const stepExecutor = createMockStepExecutor();

    const layers: WorkflowStep[][] = [
      [
        { name: "step1", agent: "agent1", input: {} },
        { name: "step2", agent: "agent2", input: {} },
      ],
    ];
    const firstLayer = layers[0]!;
    const workflow = createWorkflowDef([firstLayer[0]!, firstLayer[1]!]);
    const execution: RuntimeExecution = {
      id: "exec-1", workflowName: "test", status: "running",
      input: {}, startedAt: new Date(), stepOrder: ["step1", "step2"],
      completedSteps: [], stepRecords: {}, outputs: {},
    };

    await engine.executeParallelStepLoop(
      layers, workflow, execution, stepExecutor, undefined,
      "exec-1", false, null
    );

    expect(execution.completedSteps).toContain("step1");
    expect(execution.completedSteps).toContain("step2");
    expect(eventBus.emit).toHaveBeenCalledWith("parallel_layer_start", "exec-1", expect.any(Object));
    expect(eventBus.emit).toHaveBeenCalledWith("parallel_layer_end", "exec-1", expect.any(Object));
  });

  it("handles parallel layer failures gracefully", async () => {
    const { engine, eventBus } = createEngine();
    const stepExecutor = createMockStepExecutor();
    vi.mocked(stepExecutor.executeStep)
      .mockResolvedValueOnce({ output: "ok", raw: {} })
      .mockRejectedValueOnce(new Error("fail"));

    const layers: WorkflowStep[][] = [
      [
        { name: "step1", agent: "agent1", input: {} },
        { name: "step2", agent: "agent2", input: {} },
      ],
    ];
    const firstLayer = layers[0]!;
    const workflow = createWorkflowDef([firstLayer[0]!, firstLayer[1]!]);
    const execution: RuntimeExecution = {
      id: "exec-1", workflowName: "test", status: "running",
      input: {}, startedAt: new Date(), stepOrder: ["step1", "step2"],
      completedSteps: [], stepRecords: {}, outputs: {},
    };

    await engine.executeParallelStepLoop(
      layers, workflow, execution, stepExecutor, undefined,
      "exec-1", false, null
    );

    expect(eventBus.emit).toHaveBeenCalledWith("warning", "exec-1", expect.objectContaining({
      message: expect.stringContaining("step2"),
    }));
  });

  it("delegates single-step layers to executeStepLoop", async () => {
    const { engine } = createEngine();
    const stepExecutor = createMockStepExecutor();

    const layers: WorkflowStep[][] = [
      [{ name: "step1", agent: "agent1", input: {} }],
    ];
    const firstLayer = layers[0]!;
    const workflow = createWorkflowDef([firstLayer[0]!]);
    const execution: RuntimeExecution = {
      id: "exec-1", workflowName: "test", status: "running",
      input: {}, startedAt: new Date(), stepOrder: ["step1"],
      completedSteps: [], stepRecords: {}, outputs: {},
    };

    await engine.executeParallelStepLoop(
      layers, workflow, execution, stepExecutor, undefined,
      "exec-1", false, null
    );

    expect(execution.completedSteps).toContain("step1");
  });
});
