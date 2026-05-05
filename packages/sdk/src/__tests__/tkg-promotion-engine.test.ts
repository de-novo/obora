import { describe, expect, it, vi } from "vitest";
import { TKGPromotionEngine } from "../execution/tkg-promotion-engine.js";
import type { EventBus } from "../events/event-bus.js";
import type {
  MemoryScope,
  SharedMemoryFact,
  SharedMemorySnapshot,
  SharedMemoryStore,
} from "../shared-memory/store.js";
import type { StagingTKGStore, TemporalNode } from "../tkg/store.js";
import type { TKGRollbackStore } from "../tkg/rollback.js";
import type { TKGReviewQueueStore } from "../tkg/review-queue.js";
import type { AuditEvent, RuntimeExecution } from "../runtime-types.js";

describe("TKGPromotionEngine", () => {
  const createFact = (id: string): SharedMemoryFact => ({
    id,
    content: id,
    category: "test",
    tags: [],
    confidence: 1,
    createdAt: new Date(0).toISOString(),
  });

  const createSharedMemorySnapshot = (facts: SharedMemoryFact[] = []): SharedMemorySnapshot => ({
    knowledge: { facts },
    decisions: { history: [] },
    context: { projectFacts: {} },
  });

  const createTemporalNode = (overrides: Partial<TemporalNode> = {}): TemporalNode => ({
    id: "node-1",
    eventType: "workflow.validation_passed",
    executionId: "exec-1",
    workflowName: "wf-1",
    stepName: "validate",
    timestamp: new Date(0).toISOString(),
    summary: "Validation passed",
    attributes: {},
    relations: [],
    ...overrides,
  });

  const createMockEventBus = (): EventBus =>
    ({
      emit: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockReturnValue(() => {}),
    }) as unknown as EventBus;

  const createBaseExecution = (): RuntimeExecution => ({
    id: "exec-1",
    workflowName: "wf-1",
    status: "running",
    input: {},
    startedAt: new Date(),
    stepOrder: [],
    completedSteps: [],
    stepRecords: {},
    outputs: {},
  });

  describe("buildDeterministicTKGId", () => {
    it("returns consistent hash for same input", () => {
      const engine = new TKGPromotionEngine({ eventBus: createMockEventBus() });
      const id1 = engine.buildDeterministicTKGId(["a", 1, { key: "value" }]);
      const id2 = engine.buildDeterministicTKGId(["a", 1, { key: "value" }]);
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^[a-f0-9]{40}$/);
    });

    it("returns different hash for different input", () => {
      const engine = new TKGPromotionEngine({ eventBus: createMockEventBus() });
      const id1 = engine.buildDeterministicTKGId(["a"]);
      const id2 = engine.buildDeterministicTKGId(["b"]);
      expect(id1).not.toBe(id2);
    });
  });

  describe("persistSharedMemory", () => {
    it("does nothing when store is undefined", async () => {
      const engine = new TKGPromotionEngine({ eventBus: createMockEventBus() });
      await expect(
        engine.persistSharedMemory(undefined, [], { knowledge: { facts: [] }, decisions: { history: [] }, context: { projectFacts: {} } }, "exec-1")
      ).resolves.toBeUndefined();
    });

    it("does nothing when scopes are empty", async () => {
      const store = { merge: vi.fn(), save: vi.fn() } as unknown as SharedMemoryStore;
      const engine = new TKGPromotionEngine({ eventBus: createMockEventBus() });
      await engine.persistSharedMemory(store, [], { knowledge: { facts: [] }, decisions: { history: [] }, context: { projectFacts: {} } }, "exec-1");
      expect(store.merge).not.toHaveBeenCalled();
      expect(store.save).not.toHaveBeenCalled();
    });

    it("uses merge when available", async () => {
      const merge = vi.fn().mockResolvedValue(undefined);
      const store = { merge, save: vi.fn() } as unknown as SharedMemoryStore;
      const engine = new TKGPromotionEngine({ eventBus: createMockEventBus() });
      const snapshot = { knowledge: { facts: [createFact("f1")] }, decisions: { history: [] }, context: { projectFacts: {} } };
      const scope: MemoryScope = { level: "project", key: "test" };

      await engine.persistSharedMemory(store, [scope], snapshot, "exec-1");

      expect(merge).toHaveBeenCalledTimes(1);
      expect(merge).toHaveBeenCalledWith(scope, snapshot);
    });

    it("falls back to save when merge is unavailable", async () => {
      const save = vi.fn().mockResolvedValue(undefined);
      const store = { save } as unknown as SharedMemoryStore;
      const engine = new TKGPromotionEngine({ eventBus: createMockEventBus() });
      const snapshot = { knowledge: { facts: [createFact("f1")] }, decisions: { history: [] }, context: { projectFacts: {} } };
      const scope: MemoryScope = { level: "project", key: "test" };

      await engine.persistSharedMemory(store, [scope], snapshot, "exec-1");

      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith(scope, snapshot);
    });
  });

  describe("flushTKGPromotionCheckpoint", () => {
    it("does nothing when staging store is undefined", async () => {
      const engine = new TKGPromotionEngine({ eventBus: createMockEventBus() });
      const execution = createBaseExecution();

      await engine.flushTKGPromotionCheckpoint({
        trigger: "execution_end",
        execution,
        executionId: "exec-1",
        workflowName: "wf-1",
        tkgProjectionConfig: undefined,
        sharedMemoryStore: undefined,
        sharedMemoryScopes: [],
        stagingTKGStore: undefined,
        tkgProjectionScopes: [],
        tkgPromotionApplyScopes: [],
        tkgRollbackStore: undefined,
        tkgReviewQueueStore: undefined,
      });

      expect(execution.outputs.__tkg_promotion__).toBeUndefined();
    });

    it("does nothing when projection scopes are empty", async () => {
      const engine = new TKGPromotionEngine({ eventBus: createMockEventBus() });
      const execution = createBaseExecution();
      const stagingStore = { load: vi.fn().mockResolvedValue(undefined) } as unknown as StagingTKGStore;

      await engine.flushTKGPromotionCheckpoint({
        trigger: "execution_end",
        execution,
        executionId: "exec-1",
        workflowName: "wf-1",
        tkgProjectionConfig: undefined,
        sharedMemoryStore: undefined,
        sharedMemoryScopes: [],
        stagingTKGStore: stagingStore,
        tkgProjectionScopes: [],
        tkgPromotionApplyScopes: [],
        tkgRollbackStore: undefined,
        tkgReviewQueueStore: undefined,
      });

      expect(stagingStore.load).not.toHaveBeenCalled();
      expect(execution.outputs.__tkg_promotion__).toBeUndefined();
    });

    it("stores promotion summary on execution output when staging snapshot exists", async () => {
      const eventBus = createMockEventBus();
      const engine = new TKGPromotionEngine({ eventBus });
      const execution = createBaseExecution();
      const scope: MemoryScope = { level: "project", key: "test" };
      const stagingStore = {
        load: vi.fn().mockResolvedValue({
          nodes: [
            { id: "n1", eventType: "workflow.validation_passed", attributes: { confidence: 0.95 }, timestamp: new Date().toISOString(), workflowName: "wf-1" },
          ],
        }),
      } as unknown as StagingTKGStore;

      await engine.flushTKGPromotionCheckpoint({
        trigger: "execution_end",
        execution,
        executionId: "exec-1",
        workflowName: "wf-1",
        tkgProjectionConfig: {
          enabled: true,
          promotion: { enabled: true, minConfidence: 0.8 },
        },
        sharedMemoryStore: undefined,
        sharedMemoryScopes: [],
        stagingTKGStore: stagingStore,
        tkgProjectionScopes: [scope],
        tkgPromotionApplyScopes: [],
        tkgRollbackStore: undefined,
        tkgReviewQueueStore: undefined,
      });

      expect(stagingStore.load).toHaveBeenCalledWith(scope);
      expect(execution.outputs.__tkg_promotion__).toBeDefined();
      expect(execution.outputs.__tkg_promotion__).toMatchObject({
        trigger: "execution_end",
        scope: "project:test",
        minConfidence: 0.8,
      });
    });

    it("evaluates a pending event when no staging snapshot exists", async () => {
      const engine = new TKGPromotionEngine({ eventBus: createMockEventBus() });
      const execution = createBaseExecution();
      const scope: MemoryScope = { level: "project", key: "test" };
      const stagingStore: StagingTKGStore = {
        load: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue(undefined),
      };
      const pendingEvent = {
        id: "event-1",
        executionId: "exec-1",
        timestamp: new Date(0),
        type: "workflow.validation_passed",
        data: { stepName: "validate", summary: "green" },
      } satisfies AuditEvent & { type: "workflow.validation_passed" };

      await engine.flushTKGPromotionCheckpoint({
        trigger: "workflow.validation_passed",
        execution,
        executionId: "exec-1",
        workflowName: "wf-1",
        tkgProjectionConfig: undefined,
        sharedMemoryStore: undefined,
        sharedMemoryScopes: [],
        stagingTKGStore: stagingStore,
        tkgProjectionScopes: [scope],
        tkgPromotionApplyScopes: [],
        tkgRollbackStore: undefined,
        tkgReviewQueueStore: undefined,
        pendingEvent,
      });

      expect(execution.outputs.__tkg_promotion__).toMatchObject({
        trigger: "workflow.validation_passed",
        candidateCount: 1,
        promotableCount: 1,
      });
    });

    it("captures rollback entries and emits debug events while applying promoted facts", async () => {
      const previousDebug = process.env.OBORA_DEBUG;
      process.env.OBORA_DEBUG = "1";
      try {
        const eventBus = createMockEventBus();
        const engine = new TKGPromotionEngine({ eventBus });
        const execution = createBaseExecution();
        const scope: MemoryScope = { level: "project", key: "test" };
        const stagingStore: StagingTKGStore = {
          load: vi.fn().mockResolvedValue({ nodes: [createTemporalNode()] }),
          save: vi.fn().mockResolvedValue(undefined),
        };
        const merge = vi.fn().mockResolvedValue(undefined);
        const sharedMemoryStore: SharedMemoryStore = {
          load: vi.fn().mockResolvedValue(createSharedMemorySnapshot([createFact("existing")])),
          save: vi.fn().mockResolvedValue(undefined),
          merge,
        };
        const append = vi.fn().mockResolvedValue(undefined);
        const tkgRollbackStore: TKGRollbackStore = {
          load: vi.fn().mockResolvedValue(null),
          save: vi.fn().mockResolvedValue(undefined),
          append,
        };

        await engine.flushTKGPromotionCheckpoint({
          trigger: "execution_end",
          execution,
          executionId: "exec-1",
          workflowName: "wf-1",
          tkgProjectionConfig: { enabled: true, promotion: { enabled: true } },
          sharedMemoryStore,
          sharedMemoryScopes: [scope],
          stagingTKGStore: stagingStore,
          tkgProjectionScopes: [scope],
          tkgPromotionApplyScopes: [],
          tkgRollbackStore,
          tkgReviewQueueStore: undefined,
        });

        expect(merge).toHaveBeenCalledWith(
          scope,
          expect.objectContaining({
            knowledge: { facts: [expect.objectContaining({ id: "tkg-promotion:node-1" })] },
          })
        );
        expect(append).toHaveBeenCalledWith(scope, expect.objectContaining({ scope: "project:test" }));
        expect(execution.outputs.__tkg_promotion_apply__).toMatchObject({ appliedFactCount: 1 });
        expect(execution.outputs.__tkg_promotion_rollback__).toMatchObject({ capturedSnapshots: 1 });
        expect(eventBus.emit).toHaveBeenCalledWith("tkg.checkpoint", "exec-1", expect.any(Object));
        expect(eventBus.emit).toHaveBeenCalledWith("tkg.apply", "exec-1", expect.any(Object));
        expect(eventBus.emit).toHaveBeenCalledWith("tkg.rollback", "exec-1", expect.any(Object));
      } finally {
        if (previousDebug === undefined) {
          delete process.env.OBORA_DEBUG;
        } else {
          process.env.OBORA_DEBUG = previousDebug;
        }
      }
    });

    it("falls back to save when shared memory and rollback helpers are absent", async () => {
      const engine = new TKGPromotionEngine({ eventBus: createMockEventBus() });
      const execution = createBaseExecution();
      const scope: MemoryScope = { level: "project", key: "test" };
      const stagingStore: StagingTKGStore = {
        load: vi.fn().mockResolvedValue({ nodes: [createTemporalNode()] }),
        save: vi.fn().mockResolvedValue(undefined),
      };
      const sharedMemorySave = vi.fn().mockResolvedValue(undefined);
      const sharedMemoryStore: SharedMemoryStore = {
        load: vi.fn().mockResolvedValue(createSharedMemorySnapshot()),
        save: sharedMemorySave,
      };
      const rollbackSave = vi.fn().mockResolvedValue(undefined);
      const tkgRollbackStore: TKGRollbackStore = {
        load: vi.fn().mockResolvedValue({ entries: [] }),
        save: rollbackSave,
      };

      await engine.flushTKGPromotionCheckpoint({
        trigger: "execution_end",
        execution,
        executionId: "exec-1",
        workflowName: "wf-1",
        tkgProjectionConfig: { enabled: true, promotion: { enabled: true } },
        sharedMemoryStore,
        sharedMemoryScopes: [],
        stagingTKGStore: stagingStore,
        tkgProjectionScopes: [scope],
        tkgPromotionApplyScopes: [scope],
        tkgRollbackStore,
        tkgReviewQueueStore: undefined,
      });

      expect(sharedMemorySave).toHaveBeenCalledWith(scope, expect.any(Object));
      expect(rollbackSave).toHaveBeenCalledWith(scope, {
        entries: [expect.objectContaining({ reason: "pre-tkg-promotion-apply" })],
      });
    });

    it("persists review queue conflicts through the store fallback", async () => {
      const engine = new TKGPromotionEngine({ eventBus: createMockEventBus() });
      const execution = createBaseExecution();
      const scope: MemoryScope = { level: "project", key: "test" };
      const stagingStore: StagingTKGStore = {
        load: vi.fn().mockResolvedValue({
          nodes: [
            createTemporalNode({ id: "node-1", summary: "Validation passed v1" }),
            createTemporalNode({ id: "node-2", summary: "Validation passed v2" }),
          ],
        }),
        save: vi.fn().mockResolvedValue(undefined),
      };
      const reviewQueueSave = vi.fn().mockResolvedValue(undefined);
      const tkgReviewQueueStore: TKGReviewQueueStore = {
        load: vi.fn().mockResolvedValue({ items: [] }),
        save: reviewQueueSave,
      };

      await engine.flushTKGPromotionCheckpoint({
        trigger: "execution_end",
        execution,
        executionId: "exec-1",
        workflowName: "wf-1",
        tkgProjectionConfig: { enabled: true, promotion: { enabled: true } },
        sharedMemoryStore: undefined,
        sharedMemoryScopes: [],
        stagingTKGStore: stagingStore,
        tkgProjectionScopes: [scope],
        tkgPromotionApplyScopes: [],
        tkgRollbackStore: undefined,
        tkgReviewQueueStore,
      });

      expect(reviewQueueSave).toHaveBeenCalledWith(scope, {
        items: [expect.objectContaining({ status: "open", candidateNodeIds: ["node-1", "node-2"] })],
      });
      expect(execution.outputs.__tkg_review_queue__).toMatchObject({
        trigger: "execution_end",
        scope: "project:test",
        queuedItems: 1,
      });
    });
  });
});
