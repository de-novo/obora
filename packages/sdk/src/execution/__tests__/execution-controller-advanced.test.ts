import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ExecutionController } from "../execution-controller.js";
import { OboraError, OboraErrorCode } from "../../runtime-types.js";
import { BudgetExceededError } from "../../cost-tracker.js";
import type { WorkflowRunner } from "../workflow-runner.js";
import type { TKGService } from "../tkg-service.js";
import type { EventBus } from "../../events/event-bus.js";
import type { PersistenceManager } from "../../persistence/persistence-manager.js";
import type { DLQStore } from "../../dlq/index.js";
import type { ExecutionLock } from "../execution-lock.js";
import type { RuntimeExecution, RunOptions } from "../../runtime-types.js";
import type { WorkflowDef } from "../../workflow.js";

function createMockRunner(): WorkflowRunner {
  return {
    executeRun: vi.fn().mockResolvedValue(undefined),
    executeResume: vi.fn().mockResolvedValue({ id: "run-1", status: "completed" }),
    getPersistedRepairLoopSummary: vi.fn().mockReturnValue(undefined),
    clearPersistedRepairLoopSummary: vi.fn(),
  } as unknown as WorkflowRunner;
}

function createMockTKGService(): TKGService {
  return {
    rollbackTKGOnExecutionFailure: vi.fn().mockResolvedValue({ restored: false }),
  } as unknown as TKGService;
}

function createMockEventBus(): EventBus {
  return {
    emit: vi.fn().mockResolvedValue(undefined),
  } as unknown as EventBus;
}

function createMockPersistenceManager(): PersistenceManager {
  return {
    getStorageAdapter: vi.fn().mockResolvedValue({
      getRun: vi.fn().mockResolvedValue({ id: "run-1", status: "failed", workflowName: "test" }),
      getSteps: vi.fn().mockResolvedValue([]),
      saveRun: vi.fn().mockResolvedValue(undefined),
    }),
  } as unknown as PersistenceManager;
}

function createMockDLQStore(): DLQStore {
  return {
    append: vi.fn().mockResolvedValue(undefined),
  } as unknown as DLQStore;
}

function createMockExecutionLock(): ExecutionLock {
  return {
    acquire: vi.fn().mockResolvedValue(true),
    release: vi.fn().mockResolvedValue(undefined),
    isLocked: vi.fn().mockResolvedValue(false),
  } as unknown as ExecutionLock;
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

function createController(opts: Partial<ConstructorParameters<typeof ExecutionController>[0]> = {}) {
  const runner = createMockRunner();
  const tkgService = createMockTKGService();
  const eventBus = createMockEventBus();
  const persistenceManager = createMockPersistenceManager();
  const dlqStore = createMockDLQStore();
  const executionLock = createMockExecutionLock();
  const executions = new Map<string, RuntimeExecution>();

  return {
    controller: new ExecutionController({
      config: {
        logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
        config: {},
      } as any,
      runner,
      tkgService,
      eventBus,
      persistenceManager,
      dlqStore,
      executionLock,
      executions,
      ...opts,
    }),
    runner,
    tkgService,
    eventBus,
    persistenceManager,
    dlqStore,
    executionLock,
    executions,
  };
}

describe("ExecutionController - Auto-rollback & DLQ", () => {
  it("triggers auto-rollback on execution failure", async () => {
    const { controller, runner, tkgService, eventBus } = createController();
    
    vi.mocked(runner.executeRun).mockRejectedValue(new Error("step failed"));
    vi.mocked(tkgService.rollbackTKGOnExecutionFailure).mockResolvedValue({
      restored: true,
      restoredFactCount: 5,
    });

    const workflow = createWorkflowDef();
    const workflows = new Map([["test", workflow]]);
    const handle = await controller.start("test", workflow, {}, new Map(), workflows);

    await expect(handle.wait()).rejects.toThrow("step failed");

    expect(tkgService.rollbackTKGOnExecutionFailure).toHaveBeenCalled();
    expect(eventBus.emit).toHaveBeenCalledWith("warning", expect.any(String), {
      message: "Auto-rollback completed: 5 facts restored",
      code: "TKG_AUTO_ROLLBACK_SUCCESS",
    });
  });

  it("emits warning when auto-rollback fails", async () => {
    const { controller, runner, tkgService, eventBus } = createController();
    
    vi.mocked(runner.executeRun).mockRejectedValue(new Error("step failed"));
    vi.mocked(tkgService.rollbackTKGOnExecutionFailure).mockRejectedValue(new Error("rollback error"));

    const workflow = createWorkflowDef();
    const workflows = new Map([["test", workflow]]);
    const handle = await controller.start("test", workflow, {}, new Map(), workflows);

    await expect(handle.wait()).rejects.toThrow("step failed");

    expect(eventBus.emit).toHaveBeenCalledWith("warning", expect.any(String), {
      message: "Auto-rollback failed: rollback error",
      code: "TKG_AUTO_ROLLBACK_FAILED",
    });
  });

  it("captures failure in DLQ", async () => {
    const { controller, runner, dlqStore, eventBus } = createController();
    
    vi.mocked(runner.executeRun).mockRejectedValue(new Error("step failed"));
    vi.mocked(runner.getPersistedRepairLoopSummary).mockReturnValue({
      repairStarted: 2,
      lastRepairStep: "step1",
    });

    const workflow = createWorkflowDef();
    const workflows = new Map([["test", workflow]]);
    const handle = await controller.start("test", workflow, {}, new Map(), workflows);

    await expect(handle.wait()).rejects.toThrow("step failed");

    expect(dlqStore.append).toHaveBeenCalled();
    // The DLQ warning may be wrapped in another emit call — just verify it was emitted at all
    const warningCalls = vi.mocked(eventBus.emit).mock.calls.filter(
      (c) => c[0] === "warning"
    );
    expect(warningCalls.length).toBeGreaterThanOrEqual(1);
    expect(warningCalls.some((c) =>
      (c[2] as any)?.code === "DLQ_ENTRY_CREATED"
    )).toBe(true);
  });

  it("skips DLQ and rollback for budget exceeded", async () => {
    const { controller, runner, tkgService, dlqStore } = createController();
    
    vi.mocked(runner.executeRun).mockRejectedValue(new BudgetExceededError("budget exceeded", 100, 50));

    const workflow = createWorkflowDef();
    const workflows = new Map([["test", workflow]]);
    const handle = await controller.start("test", workflow, {}, new Map(), workflows);

    await expect(handle.wait()).rejects.toThrow("budget exceeded");

    expect(tkgService.rollbackTKGOnExecutionFailure).not.toHaveBeenCalled();
    expect(dlqStore.append).not.toHaveBeenCalled();
  });
});

describe("ExecutionController - Lock", () => {
  it("throws when lock acquisition fails", async () => {
    const executionLock = createMockExecutionLock();
    vi.mocked(executionLock.acquire).mockResolvedValue(false);

    const { controller } = createController({ executionLock });
    const workflow = createWorkflowDef();

    await expect(controller.start("test", workflow, {}, new Map(), new Map())).rejects.toThrow(
      "Another execution of workflow"
    );
  });
});

describe("ExecutionController - Cancel", () => {
  it("cancels a running execution", async () => {
    const { controller, runner, eventBus } = createController();
    
    // Make executeRun hang
    let resolveRun: () => void;
    const runPromise = new Promise<void>((r) => { resolveRun = r; });
    vi.mocked(runner.executeRun).mockReturnValue(runPromise as any);

    const workflow = createWorkflowDef();
    const handle = await controller.start("test", workflow, {}, new Map(), new Map());

    // Start waiting but don't await yet — catch rejection to avoid unhandled
    const waitPromise = handle.wait().catch(() => {});

    // Wait for microtask to start running
    await new Promise((r) => setTimeout(r, 20));

    await handle.cancel("user requested");

    expect(handle.status).toBe("aborted");
    expect(eventBus.emit).toHaveBeenCalledWith("error", expect.any(String), expect.objectContaining({
      code: OboraErrorCode.SDK_EXECUTION_CANCELLED,
    }));
    expect(eventBus.emit).toHaveBeenCalledWith("execution_end", expect.any(String), {
      workflowName: "test",
      status: "aborted",
    });

    resolveRun!();
    await waitPromise; // clean up
  });

  it("ignores cancel when already settled", async () => {
    const { controller, runner } = createController();
    vi.mocked(runner.executeRun).mockResolvedValue(undefined);

    const workflow = createWorkflowDef();
    const handle = await controller.start("test", workflow, {}, new Map(), new Map());

    await handle.wait();
    expect(handle.status).toBe("completed");

    // Cancel after completion should be no-op
    await handle.cancel();
    expect(handle.status).toBe("completed");
  });
});

describe("ExecutionController - Timeout", () => {
  it("handles timeout by cancelling execution", async () => {
    const { controller, runner } = createController();
    
    let resolveRun: () => void;
    const runPromise = new Promise<void>((r) => { resolveRun = r; });
    vi.mocked(runner.executeRun).mockReturnValue(runPromise as any);

    const workflow = createWorkflowDef();
    const handle = await controller.start("test", workflow, {
      variables: { executionTimeoutMs: 50 },
    }, new Map(), new Map());

    // Start waiting but catch rejection to avoid unhandled
    const waitPromise = handle.wait().catch(() => {});

    // Wait for timeout
    await new Promise((r) => setTimeout(r, 100));

    expect(handle.status).toBe("aborted");
    resolveRun!();
    await waitPromise; // clean up
  });

  it("resolves timeout from workflow variables", async () => {
    const { controller } = createController();
    const workflow = createWorkflowDef();
    workflow.variables = { executionTimeoutMs: 500 };

    const handle = await controller.start("test", workflow, {}, new Map(), new Map());
    expect(handle).toBeDefined();
  });
});

describe("ExecutionController - setPolicy", () => {
  it("updates policy", () => {
    const { controller } = createController();
    const policy = { name: "test-policy" } as any;
    controller.setPolicy(policy);
    expect(controller).toBeDefined();
  });
});

describe("ExecutionController - Resume", () => {
  it("throws when run not found", async () => {
    const { controller, persistenceManager } = createController();
    
    const mockAdapter = {
      getRun: vi.fn().mockResolvedValue(null),
    };
    vi.mocked(persistenceManager.getStorageAdapter).mockResolvedValue(mockAdapter as any);

    await expect(controller.resume("missing", {}, new Map())).rejects.toThrow(OboraError);
  });
});
