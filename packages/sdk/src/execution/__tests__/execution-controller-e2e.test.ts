import { describe, it, expect, vi } from "vitest";
import { ExecutionController } from "../execution-controller.js";
import { OboraError, OboraErrorCode } from "../../runtime-types.js";
import type { WorkflowRunner } from "../workflow-runner.js";
import type { TKGService } from "../tkg-service.js";
import type { EventBus } from "../../events/event-bus.js";
import type { PersistenceManager } from "../../persistence/persistence-manager.js";
import type { RuntimeExecution } from "../../runtime-types.js";
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
    on: vi.fn().mockReturnValue(() => {}),
  } as unknown as EventBus;
}

function createMockPersistenceManager(): PersistenceManager {
  return {
    getStorageAdapter: vi.fn().mockResolvedValue({
      getRun: vi.fn().mockResolvedValue(null),
      getSteps: vi.fn().mockResolvedValue([]),
      saveRun: vi.fn().mockResolvedValue(undefined),
    }),
  } as unknown as PersistenceManager;
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

function createController() {
  const runner = createMockRunner();
  const tkgService = createMockTKGService();
  const eventBus = createMockEventBus();
  const persistenceManager = createMockPersistenceManager();
  const executions = new Map<string, RuntimeExecution>();

  const controller = new ExecutionController({
    config: {
      logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
      config: {},
    } as any,
    runner,
    tkgService,
    eventBus,
    persistenceManager,
    executions,
  });

  return { controller, runner, eventBus, persistenceManager, executions };
}

describe("ExecutionController E2E - Cancel", () => {
  it("cancels a running execution and emits error event", async () => {
    const { controller, runner, eventBus } = createController();

    let resolveRun: () => void;
    const runPromise = new Promise<void>((r) => { resolveRun = r; });
    vi.mocked(runner.executeRun).mockReturnValue(runPromise as any);

    const workflow = createWorkflowDef();
    const handle = await controller.start("test", workflow, {}, new Map(), new Map());

    const waitPromise = handle.wait().catch(() => {});
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
    await waitPromise;
  });
});

describe("ExecutionController E2E - Timeout", () => {
  it("times out execution and emits error event", async () => {
    const { controller, runner, eventBus } = createController();

    let resolveRun: () => void;
    const runPromise = new Promise<void>((r) => { resolveRun = r; });
    vi.mocked(runner.executeRun).mockReturnValue(runPromise as any);

    const workflow = createWorkflowDef();
    const handle = await controller.start("test", workflow, {
      variables: { executionTimeoutMs: 50 },
    }, new Map(), new Map());

    const waitPromise = handle.wait().catch(() => {});
    await new Promise((r) => setTimeout(r, 100));

    expect(handle.status).toBe("aborted");
    expect(eventBus.emit).toHaveBeenCalledWith("error", expect.any(String), expect.objectContaining({
      code: OboraErrorCode.SDK_EXECUTION_CANCELLED,
    }));

    resolveRun!();
    await waitPromise;
  });
});

describe("ExecutionController E2E - Lock contention", () => {
  it("prevents concurrent execution when lock is held", async () => {
    const executionLock = {
      acquire: vi.fn().mockResolvedValue(false),
      release: vi.fn().mockResolvedValue(undefined),
      isLocked: vi.fn().mockResolvedValue(true),
    };

    const controller = new ExecutionController({
      config: { logger: { warn: vi.fn() } } as any,
      runner: createMockRunner(),
      tkgService: createMockTKGService(),
      eventBus: createMockEventBus(),
      persistenceManager: createMockPersistenceManager(),
      executionLock,
      executions: new Map(),
    });

    const workflow = createWorkflowDef();
    await expect(
      controller.start("test", workflow, {}, new Map(), new Map())
    ).rejects.toThrow("Another execution of workflow");
  });
});
