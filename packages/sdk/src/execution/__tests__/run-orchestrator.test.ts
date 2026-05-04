import { describe, it, expect, vi } from "vitest";
import { RunOrchestrator } from "../run-orchestrator.js";
import type { WorkflowDef } from "../../workflow.js";
import type { RuntimeExecution } from "../../runtime-types.js";
import type { EventBus } from "../../events/event-bus.js";
import type { PersistenceManager } from "../../persistence/persistence-manager.js";
import type { TKGService } from "../tkg-service.js";
import type { TKGPromotionEngine } from "../tkg-promotion-engine.js";
import type { EngineBuilder } from "../engine-builder.js";
import type { StepExecutionEngine } from "../step-execution-engine.js";
import type { RepairLoopTracker } from "../repair-loop-tracker.js";

function createMockDeps() {
  const eventBus: EventBus = {
    emit: vi.fn().mockResolvedValue(undefined),
    on: vi.fn().mockReturnValue(() => {}),
  } as any;

  const persistenceManager: PersistenceManager = {
    getStorageAdapter: vi.fn().mockResolvedValue({
      saveRun: vi.fn().mockResolvedValue(undefined),
      saveStep: vi.fn().mockResolvedValue(undefined),
      getRun: vi.fn().mockResolvedValue(null),
      getSteps: vi.fn().mockResolvedValue([]),
      saveAuditEvent: vi.fn().mockResolvedValue(undefined),
    }),
  } as any;

  const tkgService: TKGService = {
    resolveTKGProjectionConfig: vi.fn().mockReturnValue({}),
    resolveSharedMemoryStore: vi.fn().mockResolvedValue(undefined),
    resolveSharedMemoryScopes: vi.fn().mockReturnValue([]),
    resolveStagingTKGStore: vi.fn().mockReturnValue(undefined),
    resolveTKGProjectionScopes: vi.fn().mockReturnValue([]),
    resolveTKGPromotionApplyScopes: vi.fn().mockReturnValue([]),
    resolveTKGPromotionTriggers: vi.fn().mockReturnValue([]),
    resolveTKGRollbackStore: vi.fn().mockReturnValue(undefined),
    resolveTKGReviewQueueStore: vi.fn().mockReturnValue(undefined),
  } as any;

  const tkgPromotionEngine: TKGPromotionEngine = {
    flushTKGPromotionCheckpoint: vi.fn().mockResolvedValue(undefined),
    persistSharedMemory: vi.fn().mockResolvedValue(undefined),
  } as any;

  const engineBuilder: EngineBuilder = {
    build: vi.fn().mockResolvedValue({
      stepExecutor: undefined,
      costTracker: undefined,
    }),
  } as any;

  const stepExecutionEngine: StepExecutionEngine = {
    executeStepLoop: vi.fn().mockResolvedValue(undefined),
    executeParallelStepLoop: vi.fn().mockResolvedValue(undefined),
    extractFailurePatterns: vi.fn().mockReturnValue([]),
    summarizeBlackboardSnapshot: vi.fn().mockReturnValue({}),
    runStepHook: vi.fn().mockResolvedValue(undefined),
  } as any;

  const repairLoopTracker: RepairLoopTracker = {
    recordRepairStarted: vi.fn(),
    recordRepairCompleted: vi.fn(),
    recordRepairNoProgress: vi.fn(),
    recordValidationPass: vi.fn(),
    recordValidationFailure: vi.fn(),
    recordBackEdgeTriggered: vi.fn(),
    recordBackEdgeExhausted: vi.fn(),
    getSummary: vi.fn().mockReturnValue(undefined),
    clearSummary: vi.fn(),
  } as any;

  return {
    deps: {
      deps: {
        eventBus,
        persistenceManager,
        config: {
          logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
          config: {},
        },
      },
      tkgService,
      tkgPromotionEngine,
      stepExecutionEngine,
      engineBuilder,
      repairLoopTracker,
    },
    eventBus,
    persistenceManager,
    tkgService,
    tkgPromotionEngine,
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
    ],
  };
}

function createExecution(): RuntimeExecution {
  return {
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
}

describe("RunOrchestrator - executeRun", () => {
  it("executes a basic run", async () => {
    const mockDeps = createMockDeps();
    const orchestrator = new RunOrchestrator(mockDeps.deps);
    const workflow = createWorkflowDef();
    const execution = createExecution();

    vi.mocked(mockDeps.stepExecutionEngine.executeStepLoop).mockResolvedValue(undefined);

    await orchestrator.executeRun(
      "exec-1", "test", workflow, execution, {}, () => false
    );

    expect(mockDeps.eventBus.emit).toHaveBeenCalledWith("execution_start", "exec-1", expect.any(Object));
    expect(mockDeps.stepExecutionEngine.executeStepLoop).toHaveBeenCalled();
    expect(execution.status).toBe("completed");
  });

  it("returns early when already settled", async () => {
    const mockDeps = createMockDeps();
    const orchestrator = new RunOrchestrator(mockDeps.deps);
    const workflow = createWorkflowDef();
    const execution = createExecution();

    await orchestrator.executeRun(
      "exec-1", "test", workflow, execution, {}, () => true
    );

    expect(mockDeps.stepExecutionEngine.executeStepLoop).not.toHaveBeenCalled();
  });

  it("handles execution with persistence enabled", async () => {
    const mockDeps = createMockDeps();
    mockDeps.deps.deps.config.persistence = { enabled: true };
    const orchestrator = new RunOrchestrator(mockDeps.deps);
    const workflow = createWorkflowDef();
    const execution = createExecution();

    vi.mocked(mockDeps.stepExecutionEngine.executeStepLoop).mockResolvedValue(undefined);
    const saveRun = vi.fn().mockResolvedValue(undefined);
    vi.mocked(mockDeps.persistenceManager.getStorageAdapter).mockResolvedValue({
      saveRun,
      saveAuditEvent: vi.fn().mockResolvedValue(undefined),
    } as any);

    await orchestrator.executeRun(
      "exec-1", "test", workflow, execution, {}, () => false
    );

    expect(execution.status).toBe("completed");
    expect(saveRun).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
  });
});

describe("RunOrchestrator - importSharedMemory", () => {
  it("imports shared memory scopes", async () => {
    const mockDeps = createMockDeps();
    const orchestrator = new RunOrchestrator(mockDeps.deps);
    const execution = createExecution();

    const store = {
      load: vi.fn().mockResolvedValue({
        knowledge: { facts: [{ id: "fact-1", content: "test" }] },
        decisions: { history: [] },
        context: {},
      }),
    };

    const blackboard = {
      recordSharedMemorySnapshot: vi.fn(),
      importPersistentSnapshot: vi.fn(),
      exportPersistentSnapshot: vi.fn().mockReturnValue({}),
    };

    const result = await (orchestrator as any).importSharedMemory(
      store,
      [{ level: "workflow", key: "test" }],
      blackboard,
      execution
    );

    expect(result.importedScopes).toContain("workflow:test");
    expect(execution.outputs.__shared_memory__).toBeDefined();
    expect(store.load).toHaveBeenCalled();
  });

  it("returns empty when no store", async () => {
    const mockDeps = createMockDeps();
    const orchestrator = new RunOrchestrator(mockDeps.deps);
    const execution = createExecution();
    const blackboard = {};

    const result = await (orchestrator as any).importSharedMemory(
      undefined,
      [],
      blackboard,
      execution
    );

    expect(result.importedScopes).toHaveLength(0);
    expect(result.mergedSnapshot).toBeNull();
  });
});
