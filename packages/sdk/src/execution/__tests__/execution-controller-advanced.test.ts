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
import type { OboraRuntimeConfig, RuntimeExecution, RunOptions } from "../../runtime-types.js";
import type { WorkflowDef } from "../../workflow.js";
import type { PolicyDefinition } from "../../policy.js";
import type { StorageAdapter } from "@obora/runtime";

const mockCheckpointManager = {
  getLatestCheckpoint: vi.fn(),
  detectDrift: vi.fn(),
  resolveStepPolicies: vi.fn(),
  saveCheckpoint: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@obora/runtime", async () => {
  const actual = await vi.importActual<typeof import("@obora/runtime")>("@obora/runtime");
  class MockCheckpointManager {
    constructor() {
      return mockCheckpointManager;
    }
  }

  return {
    ...actual,
    CheckpointManager: MockCheckpointManager,
  };
});

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

function createRuntimeExecution(status: RuntimeExecution["status"] = "completed"): RuntimeExecution {
  return {
    id: "run-1",
    workflowName: "test",
    status,
    input: {},
    startedAt: new Date(),
    stepOrder: [],
    completedSteps: [],
    stepRecords: {},
    outputs: {},
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
        autoRecovery: { enabled: false },
      } satisfies OboraRuntimeConfig,
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
      scope: "project:test",
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
      validationFailed: 0,
      validationPassed: 0,
      repairStarted: 2,
      repairCompleted: 0,
      repairNoProgress: 0,
      backEdgeTriggered: 0,
      backEdgeExhausted: 0,
      lastRepairStep: "step1",
      recentValidationFailures: [],
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
      (c[2] as { code?: string } | undefined)?.code === "DLQ_ENTRY_CREATED"
    )).toBe(true);
  });

  it("handles DLQ append failure gracefully", async () => {
    const { controller, runner, dlqStore } = createController();
    
    vi.mocked(runner.executeRun).mockRejectedValue(new Error("step failed"));
    vi.mocked(dlqStore.append).mockRejectedValue(new Error("dlq full"));

    const workflow = createWorkflowDef();
    const workflows = new Map([["test", workflow]]);
    const handle = await controller.start("test", workflow, {}, new Map(), workflows);

    // Should not throw even when DLQ fails
    await expect(handle.wait()).rejects.toThrow("step failed");
    expect(dlqStore.append).toHaveBeenCalled();
  });

  it("skips DLQ and rollback for budget exceeded", async () => {
    const { controller, runner, tkgService, dlqStore } = createController();
    
    vi.mocked(runner.executeRun).mockRejectedValue(new BudgetExceededError("budget exceeded"));

    const workflow = createWorkflowDef();
    const workflows = new Map([["test", workflow]]);
    const handle = await controller.start("test", workflow, {}, new Map(), workflows);

    await expect(handle.wait()).rejects.toThrow("budget exceeded");

    expect(tkgService.rollbackTKGOnExecutionFailure).not.toHaveBeenCalled();
    expect(dlqStore.append).not.toHaveBeenCalled();
  });
});

describe("ExecutionController - Auto-recovery", () => {
  it("attempts auto-recovery on failure and succeeds", async () => {
    const { controller, runner, eventBus, persistenceManager } = createController({
      config: {
        logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
        config: {},
        autoRecovery: { enabled: true, maxRetries: 2, delayMs: 10 },
      } satisfies OboraRuntimeConfig,
    });
    
    vi.mocked(runner.executeRun).mockRejectedValue(new Error("step failed"));
    vi.mocked(runner.executeResume).mockResolvedValue(createRuntimeExecution("completed"));

    const mockAdapter = {
      getRun: vi.fn().mockResolvedValue({ id: "run-1", status: "failed", workflowName: "test", input: {} }),
      getSteps: vi.fn().mockResolvedValue([]),
      saveRun: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(persistenceManager.getStorageAdapter).mockResolvedValue(mockAdapter as unknown as StorageAdapter);

    mockCheckpointManager.getLatestCheckpoint.mockResolvedValue({
      id: "cp-1",
      runId: "run-1",
      completedSteps: [],
      policyHash: "abc",
    });
    mockCheckpointManager.detectDrift.mockReturnValue({ drifted: false });
    mockCheckpointManager.resolveStepPolicies.mockReturnValue([
      { stepName: "step1", action: "restore" },
    ]);

    const workflow = createWorkflowDef();
    const workflows = new Map([["test", workflow]]);
    const handle = await controller.start("test", workflow, {}, new Map(), workflows);

    // Auto-recovery succeeds, so wait resolves
    const result = await handle.wait();
    expect(result.status).toBe("completed");

    expect(eventBus.emit).toHaveBeenCalledWith("warning", expect.any(String), expect.objectContaining({
      code: "AUTO_RECOVERY_ATTEMPT",
    }));
  });

  it("attempts auto-recovery and fails after max retries", async () => {
    const { controller, runner, eventBus, persistenceManager } = createController({
      config: {
        logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
        config: {},
        autoRecovery: { enabled: true, maxRetries: 1, delayMs: 10 },
      } satisfies OboraRuntimeConfig,
    });
    
    vi.mocked(runner.executeRun).mockRejectedValue(new Error("step failed"));
    vi.mocked(runner.executeResume).mockRejectedValue(new Error("resume failed"));

    const mockAdapter = {
      getRun: vi.fn().mockResolvedValue({ id: "run-1", status: "failed", workflowName: "test", input: {} }),
      getSteps: vi.fn().mockResolvedValue([]),
      saveRun: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(persistenceManager.getStorageAdapter).mockResolvedValue(mockAdapter as unknown as StorageAdapter);

    mockCheckpointManager.getLatestCheckpoint.mockResolvedValue({
      id: "cp-1",
      runId: "run-1",
      completedSteps: [],
      policyHash: "abc",
    });
    mockCheckpointManager.detectDrift.mockReturnValue({ drifted: false });
    mockCheckpointManager.resolveStepPolicies.mockReturnValue([
      { stepName: "step1", action: "rerun" },
    ]);

    const workflow = createWorkflowDef();
    const workflows = new Map([["test", workflow]]);
    const handle = await controller.start("test", workflow, {}, new Map(), workflows);

    await expect(handle.wait()).rejects.toThrow("step failed");

    expect(eventBus.emit).toHaveBeenCalledWith("warning", expect.any(String), expect.objectContaining({
      code: "AUTO_RECOVERY_FAILED",
    }));
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
    vi.mocked(runner.executeRun).mockReturnValue(runPromise);

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
    vi.mocked(runner.executeRun).mockReturnValue(runPromise);

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
    const policy: PolicyDefinition = { version: "test-policy" };
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
    vi.mocked(persistenceManager.getStorageAdapter).mockResolvedValue(mockAdapter as unknown as StorageAdapter);

    await expect(controller.resume("missing", {}, new Map())).rejects.toThrow(OboraError);
  });

  it("throws when checkpoint not found", async () => {
    const { controller, persistenceManager } = createController();
    
    const mockAdapter = {
      getRun: vi.fn().mockResolvedValue({ id: "run-1", status: "failed", workflowName: "test" }),
    };
    vi.mocked(persistenceManager.getStorageAdapter).mockResolvedValue(mockAdapter as unknown as StorageAdapter);

    mockCheckpointManager.getLatestCheckpoint.mockResolvedValue(null);

    await expect(controller.resume("run-1", {}, new Map())).rejects.toThrow(OboraError);
  });

  it("throws when run status is invalid", async () => {
    const { controller, persistenceManager } = createController();
    
    const mockAdapter = {
      getRun: vi.fn().mockResolvedValue({ id: "run-1", status: "running", workflowName: "test" }),
      getSteps: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(persistenceManager.getStorageAdapter).mockResolvedValue(mockAdapter as unknown as StorageAdapter);

    mockCheckpointManager.getLatestCheckpoint.mockResolvedValue({
      id: "cp-1",
      runId: "run-1",
      completedSteps: [],
      policyHash: "abc",
    });

    await expect(controller.resume("run-1", {}, new Map())).rejects.toThrow(OboraError);
  });

  it("throws on policy drift when driftPolicy is reject", async () => {
    const { controller, persistenceManager } = createController();
    
    const mockAdapter = {
      getRun: vi.fn().mockResolvedValue({ id: "run-1", status: "failed", workflowName: "test" }),
      getSteps: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(persistenceManager.getStorageAdapter).mockResolvedValue(mockAdapter as unknown as StorageAdapter);

    mockCheckpointManager.getLatestCheckpoint.mockResolvedValue({
      id: "cp-1",
      runId: "run-1",
      completedSteps: [],
      policyHash: "old",
    });
    mockCheckpointManager.detectDrift.mockReturnValue({
      drifted: true,
      oldHash: "old",
      newHash: "new",
    });

    await expect(
      controller.resume("run-1", { driftPolicy: "reject" }, new Map())
    ).rejects.toThrow(OboraError);
  });

  it("throws when workflow not found and rerunSteps exist", async () => {
    const { controller, persistenceManager } = createController();
    
    const mockAdapter = {
      getRun: vi.fn().mockResolvedValue({ id: "run-1", status: "failed", workflowName: "missing" }),
      getSteps: vi.fn().mockResolvedValue([
        { stepName: "step1", status: "completed" },
      ]),
      saveRun: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(persistenceManager.getStorageAdapter).mockResolvedValue(mockAdapter as unknown as StorageAdapter);

    mockCheckpointManager.getLatestCheckpoint.mockResolvedValue({
      id: "cp-1",
      runId: "run-1",
      completedSteps: ["step1"],
      policyHash: "abc",
    });
    mockCheckpointManager.detectDrift.mockReturnValue({ drifted: false });
    mockCheckpointManager.resolveStepPolicies.mockReturnValue([
      { stepName: "step1", action: "rerun" },
    ]);

    await expect(controller.resume("run-1", {}, new Map())).rejects.toThrow(OboraError);
  });

  it("returns completed when no rerun steps", async () => {
    const { controller, persistenceManager } = createController();
    
    const mockAdapter = {
      getRun: vi.fn().mockResolvedValue({ id: "run-1", status: "failed", workflowName: "test" }),
      getSteps: vi.fn().mockResolvedValue([
        { stepName: "step1", status: "completed" },
      ]),
      saveRun: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(persistenceManager.getStorageAdapter).mockResolvedValue(mockAdapter as unknown as StorageAdapter);

    mockCheckpointManager.getLatestCheckpoint.mockResolvedValue({
      id: "cp-1",
      runId: "run-1",
      completedSteps: ["step1"],
      policyHash: "abc",
    });
    mockCheckpointManager.detectDrift.mockReturnValue({ drifted: false });
    mockCheckpointManager.resolveStepPolicies.mockReturnValue([
      { stepName: "step1", action: "restore" },
    ]);

    const result = await controller.resume("run-1", {}, new Map());

    expect(result.execution.status).toBe("completed");
    expect(result.rerunSteps).toHaveLength(0);
    expect(result.restoredSteps).toContain("step1");
    expect(mockAdapter.saveRun).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });

  it("throws when fromStep is invalid", async () => {
    const { controller, persistenceManager } = createController();
    
    const mockAdapter = {
      getRun: vi.fn().mockResolvedValue({ id: "run-1", status: "failed", workflowName: "test" }),
      getSteps: vi.fn().mockResolvedValue([
        { stepName: "step1", status: "completed" },
      ]),
    };
    vi.mocked(persistenceManager.getStorageAdapter).mockResolvedValue(mockAdapter as unknown as StorageAdapter);

    mockCheckpointManager.getLatestCheckpoint.mockResolvedValue({
      id: "cp-1",
      runId: "run-1",
      completedSteps: ["step1"],
      policyHash: "abc",
    });
    mockCheckpointManager.detectDrift.mockReturnValue({ drifted: false });

    const workflow = createWorkflowDef();
    const workflows = new Map([["test", workflow]]);

    await expect(
      controller.resume("run-1", { fromStep: "nonexistent" }, workflows)
    ).rejects.toThrow(OboraError);
  });

  it("executes resume with rerun steps", async () => {
    const { controller, runner, persistenceManager, executions } = createController();
    
    const mockAdapter = {
      getRun: vi.fn().mockResolvedValue({ id: "run-1", status: "failed", workflowName: "test", input: {} }),
      getSteps: vi.fn().mockResolvedValue([
        { stepName: "step1", status: "completed" },
        { stepName: "step2", status: "failed" },
      ]),
      saveRun: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(persistenceManager.getStorageAdapter).mockResolvedValue(mockAdapter as unknown as StorageAdapter);
    vi.mocked(runner.executeResume).mockResolvedValue(createRuntimeExecution("completed"));

    mockCheckpointManager.getLatestCheckpoint.mockResolvedValue({
      id: "cp-1",
      runId: "run-1",
      completedSteps: ["step1"],
      policyHash: "abc",
    });
    mockCheckpointManager.detectDrift.mockReturnValue({ drifted: false });
    mockCheckpointManager.resolveStepPolicies.mockReturnValue([
      { stepName: "step1", action: "restore", output: "restored" },
      { stepName: "step2", action: "rerun" },
    ]);

    const workflow = createWorkflowDef();
    const workflows = new Map([["test", workflow]]);

    const result = await controller.resume("run-1", {}, workflows);

    expect(result.execution.status).toBe("completed");
    expect(result.restoredSteps).toContain("step1");
    expect(result.rerunSteps).toContain("step2");
    expect(runner.executeResume).toHaveBeenCalled();
    expect(executions.get("run-1")).toBeDefined();
  });

  it("warns on policy drift when driftPolicy is warn", async () => {
    const { controller, persistenceManager } = createController();
    
    const mockAdapter = {
      getRun: vi.fn().mockResolvedValue({ id: "run-1", status: "failed", workflowName: "test" }),
      getSteps: vi.fn().mockResolvedValue([
        { stepName: "step1", status: "completed" },
      ]),
      saveRun: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(persistenceManager.getStorageAdapter).mockResolvedValue(mockAdapter as unknown as StorageAdapter);

    mockCheckpointManager.getLatestCheckpoint.mockResolvedValue({
      id: "cp-1",
      runId: "run-1",
      completedSteps: ["step1"],
      policyHash: "old",
    });
    mockCheckpointManager.detectDrift.mockReturnValue({
      drifted: true,
      oldHash: "old",
      newHash: "new",
    });
    mockCheckpointManager.resolveStepPolicies.mockReturnValue([
      { stepName: "step1", action: "restore" },
    ]);

    const result = await controller.resume("run-1", { driftPolicy: "warn" }, new Map());

    expect(result.driftDetected).toBe(true);
    expect(result.execution.status).toBe("completed");
  });
});
