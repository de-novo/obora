import { describe, it, expect, vi } from "vitest";
import { ResumeOrchestrator, type ResumeOrchestratorDeps } from "../resume-orchestrator.js";
import { OboraError, OboraErrorCode } from "../../runtime-types.js";
import type { WorkflowDef } from "../../workflow.js";
import type { EventBus } from "../../events/event-bus.js";
import type { EngineBuilder } from "../engine-builder.js";
import type { StepExecutionEngine } from "../step-execution-engine.js";
import type { RepairLoopTracker } from "../repair-loop-tracker.js";
import type { StorageAdapter } from "@obora/runtime";
import type { HookExecutionResult } from "../../hooks.js";

const RESUME_TEST_TIMEOUT_MS = 10_000;

function createMockDeps() {
  const eventBus: EventBus = {
    emit: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventBus;

  const engineBuilder: EngineBuilder = {
    build: vi.fn().mockResolvedValue({
      stepExecutor: {
        executeStep: vi.fn().mockResolvedValue({ output: "result", raw: {} }),
      },
      costTracker: undefined,
    }),
  } as unknown as EngineBuilder;

  const stepExecutionEngine: StepExecutionEngine = {
    runStepHook: vi.fn().mockResolvedValue(undefined),
  } as unknown as StepExecutionEngine;

  const repairLoopTracker: RepairLoopTracker = {
    getSummary: vi.fn().mockReturnValue(undefined),
    clearSummary: vi.fn(),
  } as unknown as RepairLoopTracker;

  return {
    deps: {
      deps: {
        eventBus,
        config: {
          logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
          persistence: { enabled: false },
        },
      } as unknown as ResumeOrchestratorDeps["deps"],
      engineBuilder,
      stepExecutionEngine,
      repairLoopTracker,
    } as unknown as ResumeOrchestratorDeps,
    eventBus,
    engineBuilder,
    stepExecutionEngine,
    repairLoopTracker,
  };
}

function createMockDepsWithEngine(engineOverride: unknown) {
  const mockDeps = createMockDeps();
  vi.mocked(mockDeps.engineBuilder.build).mockResolvedValue(engineOverride as never);
  return mockDeps;
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
  }, RESUME_TEST_TIMEOUT_MS);

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
  }, RESUME_TEST_TIMEOUT_MS);

  it("runs cost pre-gate and persists object outputs directly", async () => {
    const costTracker = { preStepGate: vi.fn().mockResolvedValue(undefined) };
    const mockDeps = createMockDepsWithEngine({
      stepExecutor: {
        executeStep: vi.fn().mockResolvedValue({ output: { value: "object-result" }, raw: {} }),
      },
      costTracker,
    });
    const orchestrator = new ResumeOrchestrator(mockDeps.deps);
    const workflow = createWorkflowDef();
    const adapter = createMockAdapter();

    const result = await orchestrator.executeResume(
      "run-1",
      "test",
      workflow,
      undefined,
      ["step1"],
      [{ stepName: "step1", action: "rerun" }],
      {},
      adapter
    );

    expect(costTracker.preStepGate).toHaveBeenCalledWith("step1");
    expect(result.input).toBeUndefined();
    expect(adapter.saveStep).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        output: { value: "object-result" },
      })
    );
    expect(adapter.saveRun).toHaveBeenCalledWith(
      expect.objectContaining({ input: { value: null } })
    );
  });

  it("throws OboraError when engine has no step executor", async () => {
    const mockDeps = createMockDepsWithEngine({
      stepExecutor: undefined,
      costTracker: undefined,
    });
    const orchestrator = new ResumeOrchestrator(mockDeps.deps);
    const workflow = createWorkflowDef();
    const adapter = createMockAdapter();

    await expect(
      orchestrator.executeResume(
        "run-1",
        "test",
        workflow,
        {},
        ["step1"],
        [{ stepName: "step1", action: "rerun" }],
        {},
        adapter
      )
    ).rejects.toMatchObject({ code: OboraErrorCode.ADAPTER_LLM_UNAVAILABLE });

    expect(adapter.saveStep).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({ code: OboraErrorCode.ADAPTER_LLM_UNAVAILABLE }),
      })
    );
  });

  it("persists unknown error code for non-Error thrown values", async () => {
    const mockDeps = createMockDepsWithEngine({
      stepExecutor: {
        executeStep: vi.fn().mockRejectedValue("string failure"),
      },
      costTracker: undefined,
    });
    const orchestrator = new ResumeOrchestrator(mockDeps.deps);
    const workflow = createWorkflowDef();
    const adapter = createMockAdapter();

    await expect(
      orchestrator.executeResume(
        "run-1",
        "test",
        workflow,
        {},
        ["step1"],
        [{ stepName: "step1", action: "rerun" }],
        {},
        adapter
      )
    ).rejects.toBe("string failure");

    expect(adapter.saveStep).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        error: expect.objectContaining({
          code: OboraErrorCode.SDK_UNKNOWN_ERROR,
          message: "string failure",
          stack: undefined,
        }),
      })
    );
  });

  it("persists repair loop summary metadata when present", async () => {
    const mockDeps = createMockDeps();
    const summary = { repairCompleted: 1 };
    vi.mocked(mockDeps.repairLoopTracker.getSummary).mockReturnValue(summary as never);
    const orchestrator = new ResumeOrchestrator(mockDeps.deps);
    const workflow = createWorkflowDef();
    const adapter = createMockAdapter();

    await orchestrator.executeResume(
      "run-1",
      "test",
      workflow,
      {},
      [],
      [{ stepName: "step1", action: "skip" }],
      {},
      adapter
    );

    expect(adapter.saveRun).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { repairLoop: summary },
      })
    );
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
    } as never);

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
        executeStep: vi.fn().mockRejectedValue(new (await import("../../cost-tracker.js")).BudgetExceededError("budget exceeded")),
      },
      costTracker: undefined,
    } as never);

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

    const hookResult = {
      success: true,
      lifecycle: "pre_step",
      command: "test",
      cwd: process.cwd(),
      exitCode: 0,
      signal: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
    } satisfies HookExecutionResult;
    vi.mocked(mockDeps.stepExecutionEngine.runStepHook).mockResolvedValue(hookResult);

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
