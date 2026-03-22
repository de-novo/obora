import { describe, expect, it } from "vitest";

import {
  applyApprovedTKGReviewQueueItemsToSharedMemory,
  buildSharedMemorySnapshotFromApprovedTKGReviewQueueItem,
  buildSharedMemorySnapshotFromApprovedTKGReviewQueueItems,
  buildSharedMemorySnapshotFromTKGPromotion,
  reapplyApprovedTKGReviewQueueItems,
  summarizeTKGPromotionApply,
} from "../apply.js";
import { evaluateTKGPromotion } from "../promotion.js";
import type { StagingTKGSnapshot } from "../store.js";
import {
  mergeSharedMemorySnapshots,
  type MemoryScope,
  type SharedMemorySnapshot,
  type SharedMemoryStore,
} from "../../shared-memory/store.js";

const snapshot: StagingTKGSnapshot = {
  nodes: [
    {
      id: "n1",
      eventType: "workflow.repair_completed",
      executionId: "exec-1",
      workflowName: "demo",
      stepName: "build",
      timestamp: new Date().toISOString(),
      summary: "Repair complete",
      attributes: {},
      relations: [],
    },
    {
      id: "n2",
      eventType: "workflow.validation_passed",
      executionId: "exec-1",
      workflowName: "demo",
      stepName: "validate",
      timestamp: new Date().toISOString(),
      summary: "Validation passed",
      attributes: {},
      relations: [],
    },
  ],
};

describe("TKG promotion apply", () => {
  it("builds shared-memory facts from approved review queue items", () => {
    const sharedMemorySnapshot = buildSharedMemorySnapshotFromApprovedTKGReviewQueueItem(
      snapshot,
      {
        id: "review-1",
        createdAt: new Date().toISOString(),
        scope: "project:obora-kit",
        workflowName: "demo",
        status: "approved",
        candidateNodeIds: ["n2"],
        conflicts: [],
        summary: {
          candidateCount: 2,
          promotableCount: 2,
          reviewCandidateCount: 1,
          conflictCount: 1,
          reviewQueueCount: 1,
        },
        resolution: {
          status: "approved",
          resolvedAt: new Date().toISOString(),
          actor: "cto",
        },
      },
      "exec-1",
    );

    expect(sharedMemorySnapshot.knowledge.facts.map((fact) => fact.id)).toEqual(["tkg-promotion:n2"]);
    expect(sharedMemorySnapshot.knowledge.facts[0]!.tags).toContain("review-approved");
    expect(sharedMemorySnapshot.decisions.history).toEqual([
      expect.objectContaining({
        id: "tkg-review-resolution:review-1:approved",
        summary: expect.stringContaining("Approved TKG review queue item review-1 by cto"),
      }),
    ]);
  });

  it("builds shared-memory facts from approved review queue item collections", () => {
    const sharedMemorySnapshot = buildSharedMemorySnapshotFromApprovedTKGReviewQueueItems(
      snapshot,
      {
        items: [
          {
            id: "review-1",
            createdAt: new Date().toISOString(),
            scope: "project:obora-kit",
            workflowName: "demo",
            status: "approved",
            candidateNodeIds: ["n2"],
            conflicts: [],
            summary: {
              candidateCount: 2,
              promotableCount: 2,
              reviewCandidateCount: 1,
              conflictCount: 1,
              reviewQueueCount: 1,
            },
            resolution: {
              status: "approved",
              resolvedAt: new Date().toISOString(),
            },
          },
        ],
      },
      "exec-1",
    );

    expect(sharedMemorySnapshot.knowledge.facts.map((fact) => fact.id)).toEqual(["tkg-promotion:n2"]);
  });

  it("builds shared-memory facts from promotable candidates", () => {
    const evaluation = evaluateTKGPromotion(snapshot);
    const sharedMemorySnapshot = buildSharedMemorySnapshotFromTKGPromotion(snapshot, evaluation, "exec-1");

    expect(sharedMemorySnapshot.knowledge.facts.map((fact) => fact.id)).toEqual([
      "tkg-promotion:n1",
      "tkg-promotion:n2",
    ]);
    expect(sharedMemorySnapshot.knowledge.facts[0]!.category).toBe("tkg-promotion");
    expect(sharedMemorySnapshot.knowledge.facts[0]!.sourceExecutionId).toBe("exec-1");
  });

  it("can apply approved review queue items directly to shared memory stores", async () => {
    const data = new Map<string, SharedMemorySnapshot>();
    const store: SharedMemoryStore = {
      async load(scope: MemoryScope) {
        return data.get(`${scope.level}:${scope.key}`) ?? null;
      },
      async save(scope: MemoryScope, snapshot: SharedMemorySnapshot) {
        data.set(`${scope.level}:${scope.key}`, snapshot);
      },
      async merge(scope: MemoryScope, snapshot: SharedMemorySnapshot) {
        const existing = await this.load(scope);
        await this.save(scope, {
          knowledge: { facts: [...(existing?.knowledge.facts ?? []), ...snapshot.knowledge.facts] },
          decisions: { history: [...(existing?.decisions.history ?? []), ...snapshot.decisions.history] },
          context: { projectFacts: { ...(existing?.context.projectFacts ?? {}), ...snapshot.context.projectFacts } },
        });
      },
    };

    const summary = await applyApprovedTKGReviewQueueItemsToSharedMemory(
      store,
      [{ level: "project", key: "obora-kit" }],
      snapshot,
      {
        items: [
          {
            id: "review-1",
            createdAt: new Date().toISOString(),
            scope: "project:obora-kit",
            workflowName: "demo",
            status: "approved",
            candidateNodeIds: ["n2"],
            conflicts: [],
            summary: {
              candidateCount: 2,
              promotableCount: 2,
              reviewCandidateCount: 1,
              conflictCount: 1,
              reviewQueueCount: 1,
            },
            resolution: {
              status: "approved",
              resolvedAt: new Date().toISOString(),
            },
          },
        ],
      },
      "exec-1",
      { allowedEventTypes: ["workflow.validation_passed"] },
    );

    const stored = await store.load({ level: "project", key: "obora-kit" });
    expect(stored?.knowledge.facts.map((fact) => fact.id)).toEqual(["tkg-promotion:n2"]);
    expect(stored?.decisions.history.map((decision) => decision.id)).toEqual([
      "tkg-review-resolution:review-1:approved",
    ]);
    expect(summary).toEqual({
      appliedFactCount: 1,
      appliedNodeIds: ["tkg-promotion:n2"],
      approvedItemCount: 1,
      approvedItemIds: ["review-1"],
      appliedDecisionCount: 1,
      scopes: ["project:obora-kit"],
    });
  });

  it("keeps approved review queue re-apply idempotent for facts and audit decisions", async () => {
    const data = new Map<string, SharedMemorySnapshot>();
    const store: SharedMemoryStore = {
      async load(scope: MemoryScope) {
        return data.get(`${scope.level}:${scope.key}`) ?? null;
      },
      async save(scope: MemoryScope, snapshot: SharedMemorySnapshot) {
        data.set(`${scope.level}:${scope.key}`, snapshot);
      },
      async merge(scope: MemoryScope, snapshot: SharedMemorySnapshot) {
        const existing = await this.load(scope);
        await this.save(scope, {
          knowledge: { facts: [...(existing?.knowledge.facts ?? []), ...snapshot.knowledge.facts] },
          decisions: { history: [...(existing?.decisions.history ?? []), ...snapshot.decisions.history] },
          context: { projectFacts: { ...(existing?.context.projectFacts ?? {}), ...snapshot.context.projectFacts } },
        });
      },
    };

    const reviewQueueSnapshot = {
      items: [
        {
          id: "review-1",
          createdAt: new Date().toISOString(),
          scope: "project:obora-kit",
          workflowName: "demo",
          status: "approved" as const,
          candidateNodeIds: ["n2"],
          conflicts: [],
          summary: {
            candidateCount: 2,
            promotableCount: 2,
            reviewCandidateCount: 1,
            conflictCount: 1,
            reviewQueueCount: 1,
          },
          resolution: {
            status: "approved" as const,
            resolvedAt: new Date().toISOString(),
            actor: "cto",
            note: "safe to promote",
          },
        },
      ],
    };

    await applyApprovedTKGReviewQueueItemsToSharedMemory(
      store,
      [{ level: "project", key: "obora-kit" }],
      snapshot,
      reviewQueueSnapshot,
      "exec-1",
      { allowedEventTypes: ["workflow.validation_passed"] },
    );
    await applyApprovedTKGReviewQueueItemsToSharedMemory(
      store,
      [{ level: "project", key: "obora-kit" }],
      snapshot,
      reviewQueueSnapshot,
      "exec-1",
      { allowedEventTypes: ["workflow.validation_passed"] },
    );

    const stored = await store.load({ level: "project", key: "obora-kit" });
    expect(stored?.knowledge.facts.map((fact) => fact.id)).toEqual(["tkg-promotion:n2"]);
    expect(stored?.decisions.history.map((decision) => decision.id)).toEqual([
      "tkg-review-resolution:review-1:approved",
    ]);
  });

  it("can reapply approved review queue items by loading queue/staging stores", async () => {
    const data = new Map<string, SharedMemorySnapshot>();
    const sharedMemoryStore: SharedMemoryStore = {
      async load(scope: MemoryScope) {
        return data.get(`${scope.level}:${scope.key}`) ?? null;
      },
      async save(scope: MemoryScope, snapshot: SharedMemorySnapshot) {
        data.set(`${scope.level}:${scope.key}`, snapshot);
      },
      async merge(scope: MemoryScope, snapshot: SharedMemorySnapshot) {
        const existing = await this.load(scope);
        await this.save(scope, mergeSharedMemorySnapshots(existing, snapshot));
      },
    };
    const stagingStore = {
      async load() {
        return snapshot;
      },
      async save() {},
    };
    const reviewQueueStore = {
      async load() {
        return {
          items: [
            {
              id: "review-1",
              createdAt: new Date().toISOString(),
              scope: "project:obora-kit",
              workflowName: "demo",
              status: "approved" as const,
              candidateNodeIds: ["n2"],
              conflicts: [],
              summary: {
                candidateCount: 2,
                promotableCount: 2,
                reviewCandidateCount: 1,
                conflictCount: 1,
                reviewQueueCount: 1,
              },
              resolution: {
                status: "approved" as const,
                resolvedAt: new Date().toISOString(),
              },
            },
          ],
        };
      },
      async save() {},
    };

    const summary = await reapplyApprovedTKGReviewQueueItems({
      sharedMemoryStore,
      stagingStore: stagingStore as any,
      reviewQueueStore: reviewQueueStore as any,
      queueScope: { level: "project", key: "obora-kit" },
      applyScopes: [{ level: "global", key: "global" }],
      sourceExecutionId: "exec-1",
      allowedEventTypes: ["workflow.validation_passed"],
    });

    const stored = await sharedMemoryStore.load({ level: "global", key: "global" });
    expect(stored?.knowledge.facts.map((fact) => fact.id)).toEqual(["tkg-promotion:n2"]);
    expect(stored?.decisions.history.map((decision) => decision.id)).toEqual([
      "tkg-review-resolution:review-1:approved",
    ]);
    expect(summary).toEqual({
      appliedFactCount: 1,
      appliedNodeIds: ["tkg-promotion:n2"],
      approvedItemCount: 1,
      approvedItemIds: ["review-1"],
      appliedDecisionCount: 1,
      scopes: ["global:global"],
    });
  });

  it("can filter applied facts by allowed event types", () => {
    const evaluation = evaluateTKGPromotion(snapshot);
    const sharedMemorySnapshot = buildSharedMemorySnapshotFromTKGPromotion(snapshot, evaluation, "exec-1", {
      allowedEventTypes: ["workflow.validation_passed"],
    });

    expect(sharedMemorySnapshot.knowledge.facts.map((fact) => fact.id)).toEqual(["tkg-promotion:n2"]);
  });

  it("summarizes applied promotion facts", () => {
    const evaluation = evaluateTKGPromotion(snapshot);
    const sharedMemorySnapshot = buildSharedMemorySnapshotFromTKGPromotion(snapshot, evaluation, "exec-1");

    expect(summarizeTKGPromotionApply(sharedMemorySnapshot)).toEqual({
      appliedFactCount: 2,
      appliedNodeIds: ["tkg-promotion:n1", "tkg-promotion:n2"],
    });
  });
});
