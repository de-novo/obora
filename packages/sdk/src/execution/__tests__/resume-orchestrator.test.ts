import { describe, it, expect, vi } from "vitest";
import { ResumeOrchestrator } from "../resume-orchestrator.js";
import { OboraError, OboraErrorCode } from "../../runtime-types.js";
import type { WorkflowDef } from "../../workflow.js";
import type { EventBus } from "../../events/event-bus.js";
import type { EngineBuilder } from "../engine-builder.js";
import type { StepExecutionEngine } from "../step-execution-engine.js";
import type { RepairLoopTracker } from "../repair-loop-tracker.js";
import type { StorageAdapter } from "@obora/runtime";

function createMockDeps() {
  const eventBus: EventBus = {
    emit: vi.fn().mockResolvedValue(undefined),
  } as any;

  const engineBuilder: EngineBuilder = {
    build: vi.fn().mockResolvedValue({
      stepExecutor: {
        executeStep: vi.fn().mockResolvedValue({ output: "result", raw: {} }),
      },
      costTracker: undefined,
    }),
  } as any;

  const stepExecutionEngine: StepExecutionEngine = {
    runStepHook: vi.fn().mockResolvedValue(undefined),
  } as any;

  const repairLoopTracker: RepairLoopTracker = {
    getSummary: vi.fn().mockReturnValue(undefined),
    clearSummary: vi.fn(),
  } as any;

  return {
    deps: {
      deps: {
        eventBus,
        config: {
          logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
          persistence: { enabled: false },
        },
      },
      engineBuilder,
      stepExecutionEngine,
      repairLoopTracker,
    },
    eventBus,
    engineBuilder,
    stepExecutionEngine,
    repairLoopTracker,
  };
}

function createWorkflowDef(): WorkflowDef {
  return {
    name: "test",
    version: "1.0",
    steps: [
      { name: "step1", agent: "agent1", input: {} },
      { name: "step2", agent: "agent2", input: {} },
    ],
  };
}

function createMockAdapter(): StorageAdapter {
  return {
    saveRun: vi.fn().mockResolvedValue(undefined),
    saveStep: vi.fn().mockResolvedValue(undefined),
    getRun: vi.fn().mockResolvedValue(null),
    getSteps: vi.fn().mockResolvedValue([]),
    saveCheckpoint: vi.fn().mockResolvedValue(undefined),
  } as unknown as StorageAdapter;
}

describe("ResumeOrchestrator - executeResume", () => {
  it("resumes execution with rerun steps", async () => {
    const mockDeps = createMockDeps();
    const orchestrator = new ResumeOrchestrator(mockDeps.deps);
    const workflow = createWorkflowDef();
    const adapter = createMockAdapter();

    const result = await orchestrator.executeResume(
      "run-1", "test", workflow, {},
      ["step2"],
      [
        { stepName: "step1", action: "restore", output: "restored-output" },
        { stepName: "step2", action: "rerun" },
      ],
      {},
      adapter
    );

    expect(result.status).toBe("completed");
    expect(result.outputs.step1).toBe("restored-output");
    expect(result.outputs.step2).toBe("result");
    expect(mockDeps.eventBus.emit).toHaveBeenCalledWith("execution_start", "run-1", expect.any(Object));
    expect(mockDeps.eventBus.emit).toHaveBeenCalledWith("execution_end", "run-1", expect.any(Object));
    expect(adapter.saveRun).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });

  it("handles skip policy", async () => {
    const mockDeps = createMockDeps();
    const orchestrator = new ResumeOrchestrator(mockDeps.deps);
    const workflow = createWorkflowDef();
    const adapter = createMockAdapter();

    const result = await orchestrator.executeResume(
      "run-1", "test", workflow, {},
      [],
      [
        { stepName: "step1", action: "skip" },
      ],
      {},
      adapter
    );

    expect(result.completedSteps).toContain("step1");
    expect(result.outputs.step1).toBeUndefined();
  });

  it("handles step execution failure", async () => {
    const mockDeps = createMockDeps();
    const orchestrator = new ResumeOrchestrator(mockDeps.deps);
    const workflow = createWorkflowDef();
    const adapter = createMockAdapter();

    vi.mocked(mockDeps.engineBuilder.build).mockResolvedValue({
      stepExecutor: {
        executeStep: vi.fn().mockRejectedValue(new Error("step failed")),
      },
      costTracker: undefined,
    } as any);

    await expect(
      orchestrator.executeResume(
        "run-1", "test", workflow, {},
        ["step1"],
        [{ stepName: "step1", action: "rerun" }],
        {},
        adapter
      )
    ).rejects.toThrow("step failed");

    expect(adapter.saveStep).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  it("handles budget exceeded error", async () => {
    const mockDeps = createMockDeps();
    const orchestrator = new ResumeOrchestrator(mockDeps.deps);
    const workflow = createWorkflowDef();
    const adapter = createMockAdapter();

    vi.mocked(mockDeps.engineBuilder.build).mockResolvedValue({
      stepExecutor: {
        executeStep: vi.fn().mockRejectedValue(new (await import("../../cost-tracker.js")).BudgetExceededError("budget exceeded", 100, 50)),
      },
      costTracker: undefined,
    } as any);

    await expect(
      orchestrator.executeResume(
        "run-1", "test", workflow, {},
        ["step1"],
        [{ stepName: "step1", action: "rerun" }],
        {},
        adapter
      )
    ).rejects.toThrow("budget exceeded");

    expect(adapter.saveStep).toHaveBeenCalledWith(expect.objectContaining({
      status: "failed",
      error: expect.objectContaining({
        code: OboraErrorCode.POLICY_RESOURCE_EXCEEDED,
      }),
    }));
  });

  it("executes hooks when configured", async () => {
    const mockDeps = createMockDeps();
    const orchestrator = new ResumeOrchestrator(mockDeps.deps);
    const workflow: WorkflowDef = {
      name: "test",
      version: "1.0",
      steps: [
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
        },
      ],
    };
    const adapter = createMockAdapter();

    const hookResult = { success: true, command: "test", exitCode: 0, stdout: "", stderr: "", durationMs: 0 };
    vi.mocked(mockDeps.stepExecutionEngine.runStepHook).mockResolvedValue(hookResult as any);

    await orchestrator.executeResume(
      "run-1", "test", workflow, {},
      ["step1"],
      [{ stepName: "step1", action: "rerun" }],
      {},
      adapter
    );

    expect(mockDeps.stepExecutionEngine.runStepHook).toHaveBeenCalledWith(
      workflow, workflow.steps[0], "pre_step", "run-1"
    );
    expect(mockDeps.stepExecutionEngine.runStepHook).toHaveBeenCalledWith(
      workflow, workflow.steps[0], "pre_validation", "run-1"
    );
    expect(mockDeps.stepExecutionEngine.runStepHook).toHaveBeenCalledWith(
      workflow, workflow.steps[0], "post_step", "run-1", { continueOnError: true }
    );
  });
});
