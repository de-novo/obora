import { describe, expect, it, vi } from "vitest";
import { ExecutionController } from "../execution-controller.js";
import type { WorkflowRunner } from "../workflow-runner.js";
import type { EventBus } from "../../events/event-bus.js";
import type { PersistenceManager } from "../../persistence/persistence-manager.js";
import type { OboraRuntimeConfig, RuntimeExecution, AgentFactory } from "../../runtime-types.js";
import type { WorkflowDef } from "../../workflow.js";
import { BudgetExceededError } from "../../cost-tracker.js";

describe("ExecutionController Error Handling", () => {
  const makeMockRunner = (): WorkflowRunner => ({
    executeRun: vi.fn().mockResolvedValue(undefined),
    getPersistedRepairLoopSummary: vi.fn().mockReturnValue(undefined),
    clearPersistedRepairLoopSummary: vi.fn(),
  } as unknown as WorkflowRunner);

  const makeMockTKGService = () => ({
    rollbackTKGOnExecutionFailure: vi.fn().mockResolvedValue({ restored: false, restoredFactCount: 0, scope: "" }),
  });

  const makeMockEventBus = (): EventBus => ({
    on: vi.fn().mockReturnValue(() => {}),
    emit: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventBus);

  const makeMockPersistenceManager = (): PersistenceManager => ({
    save: vi.fn().mockResolvedValue(undefined),
    load: vi.fn().mockResolvedValue(null),
  } as unknown as PersistenceManager);

  const makeBaseConfig = (): OboraRuntimeConfig => ({
    llm: { provider: "mock", apiKey: "test-key", model: "mock-model" },
    verbose: false,
  });

  const makeWorkflow = (name: string): WorkflowDef => ({ name, steps: [] });

  it("handles BudgetExceededError by marking as suspended", async () => {
    const runner = makeMockRunner();
    vi.mocked(runner.executeRun).mockRejectedValueOnce(new BudgetExceededError("budget exceeded"));

    const eventBus = makeMockEventBus();
    const persistenceManager = makeMockPersistenceManager();
    const executions = new Map<string, RuntimeExecution>();

    const controller = new ExecutionController({
      config: makeBaseConfig(),
      runner,
      tkgService: makeMockTKGService() as any,
      eventBus,
      persistenceManager,
      executions,
    });

    const workflow = makeWorkflow("test");
    const agents = new Map<string, AgentFactory>();
    const workflows = new Map<string, WorkflowDef>([["test", workflow]]);

    const handle = await controller.start("test", workflow, {}, agents, workflows);
    await expect(handle.wait()).rejects.toThrow("budget exceeded");
    expect(handle.status).toBe("suspended");
  });

  it("emits warning when rollback fails", async () => {
    const runner = makeMockRunner();
    vi.mocked(runner.executeRun).mockRejectedValueOnce(new Error("step failed"));

    const tkgService = makeMockTKGService();
    vi.mocked(tkgService.rollbackTKGOnExecutionFailure).mockRejectedValueOnce(new Error("rollback failed"));

    const eventBus = makeMockEventBus();
    const persistenceManager = makeMockPersistenceManager();
    const executions = new Map<string, RuntimeExecution>();

    const controller = new ExecutionController({
      config: makeBaseConfig(),
      runner,
      tkgService: tkgService as any,
      eventBus,
      persistenceManager,
      executions,
    });

    const workflow = makeWorkflow("test");
    const agents = new Map<string, AgentFactory>();
    const workflows = new Map<string, WorkflowDef>([["test", workflow]]);

    const handle = await controller.start("test", workflow, {}, agents, workflows);
    await expect(handle.wait()).rejects.toThrow("step failed");

    // Should emit warning about rollback failure
    const warningEmit = vi.mocked(eventBus.emit).mock.calls.find(
      (call) => (call[2] as any)?.code === "TKG_AUTO_ROLLBACK_FAILED"
    );
    expect(warningEmit).toBeDefined();
  });

  it("emits success when rollback succeeds", async () => {
    const runner = makeMockRunner();
    vi.mocked(runner.executeRun).mockRejectedValueOnce(new Error("step failed"));

    const tkgService = makeMockTKGService();
    vi.mocked(tkgService.rollbackTKGOnExecutionFailure).mockResolvedValueOnce({
      restored: true,
      restoredFactCount: 5,
      scope: "project:test",
    });

    const eventBus = makeMockEventBus();
    const persistenceManager = makeMockPersistenceManager();
    const executions = new Map<string, RuntimeExecution>();

    const controller = new ExecutionController({
      config: makeBaseConfig(),
      runner,
      tkgService: tkgService as any,
      eventBus,
      persistenceManager,
      executions,
    });

    const workflow = makeWorkflow("test");
    const agents = new Map<string, AgentFactory>();
    const workflows = new Map<string, WorkflowDef>([["test", workflow]]);

    const handle = await controller.start("test", workflow, {}, agents, workflows);
    await expect(handle.wait()).rejects.toThrow("step failed");

    // Should emit success about rollback
    const successEmit = vi.mocked(eventBus.emit).mock.calls.find(
      (call) => (call[2] as any)?.code === "TKG_AUTO_ROLLBACK_SUCCESS"
    );
    expect(successEmit).toBeDefined();
  });
});
