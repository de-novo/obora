import { describe, expect, it, vi } from "vitest";

import { EventBus, type Event } from "../../../events";
import { createAgentId, createNodeId } from "../../../types";
import type { TemporalNode } from "../../../types";
import { InMemoryProductionTKG, InMemoryStagingTKG } from "../InMemoryTKG";
import {
  TKGObserver,
  TKGReflector,
  type ReflectorPersistedState,
  type ReflectorStateStore,
} from "../ObserverReflector";

const agentId = createAgentId("agent-tkg");
const timestamp = new Date("2026-02-01T00:00:00.000Z");

function event(overrides: Partial<Event> & { payload?: unknown } = {}): Event {
  return {
    id: overrides.id ?? "evt-1",
    type: overrides.type ?? "task.completed",
    source: overrides.source ?? agentId,
    timestamp: overrides.timestamp ?? timestamp,
    payload: overrides.payload ?? {},
    ...overrides,
  } as unknown as Event;
}

function node(id: string, overrides: Partial<TemporalNode> = {}): TemporalNode {
  return {
    id: createNodeId(id),
    type: "fact",
    valid_from: timestamp,
    observed_at: timestamp,
    updated_at: timestamp,
    confidence: 0.8,
    source: agentId,
    version: 1,
    tags: ["release"],
    data: {
      statement: "same statement",
      verified: true,
    },
    ...overrides,
  };
}

class MemoryStateStore implements ReflectorStateStore {
  public state: ReflectorPersistedState | null = null;
  public saves = 0;

  load(): ReflectorPersistedState | null {
    return this.state;
  }

  save(state: ReflectorPersistedState): void {
    this.saves += 1;
    this.state = state;
  }
}

describe("TKGObserver", () => {
  it("maps accepted events into staging nodes and emits observer audit events", () => {
    const staging = new InMemoryStagingTKG();
    const bus = new EventBus();
    const emitted: Event[] = [];
    bus.subscribe("*", (captured) => emitted.push(captured));

    const observed = new TKGObserver(staging, bus).observe(
      event({
        id: "evt-release",
        payload: { statement: "release passed", confidence: 1.7 },
      }),
    );

    expect(observed).toMatchObject({
      id: "tkg-evt-release",
      confidence: 1,
      source: agentId,
      tags: ["task.completed"],
      data: {
        statement: "release passed",
        verified: false,
        context: "{\"statement\":\"release passed\",\"confidence\":1.7}",
      },
    });
    expect(staging.nodes.get(createNodeId("tkg-evt-release"))).toBe(observed);
    expect(emitted.at(-1)?.type).toBe("tkg.observer.node.added");
  });

  it("rejects events below the staging threshold and preserves unserializable context", () => {
    const staging = new InMemoryStagingTKG();
    const bus = new EventBus();
    const emitted: Event[] = [];
    bus.subscribe("*", (captured) => emitted.push(captured));
    const payload: Record<string, unknown> = { statement: "too weak", confidence: -1 };
    payload.self = payload;

    const observed = new TKGObserver(staging, bus, { stagingThreshold: 0.2 }).observe(
      event({
        id: "evt-low",
        source: "system",
        payload,
      }),
    );

    expect(observed).toBeNull();
    expect(staging.nodes.size).toBe(0);
    expect(emitted.at(-1)).toMatchObject({
      type: "tkg.observer.validation.failed",
      payload: { nodeId: "tkg-evt-low", confidence: 0 },
    });
  });

  it("subscribes to source events, skips tkg events, and can stop subscription", () => {
    const staging = new InMemoryStagingTKG();
    const bus = new EventBus();
    const observer = new TKGObserver(staging, bus);

    observer.subscribeTo("*");
    bus.emit(event({ id: "evt-source", type: "agent.status.changed", payload: "ready" }));
    bus.emit(event({ id: "evt-tkg", type: "tkg.internal", payload: { confidence: 1 } }));
    observer.stopSubscription();
    bus.emit(event({ id: "evt-after-stop", type: "agent.status.changed", payload: { confidence: 1 } }));

    expect(Array.from(staging.nodes.keys())).toEqual([createNodeId("tkg-evt-source")]);
  });
});

describe("TKGReflector", () => {
  it("promotes eligible nodes and queues manual, deferred, and automatic conflict resolutions", () => {
    const staging = new InMemoryStagingTKG();
    const production = new InMemoryProductionTKG();
    const bus = new EventBus();
    const emitted: Event[] = [];
    bus.subscribe("*", (captured) => emitted.push(captured));
    const store = new MemoryStateStore();

    const verified = node("verified", { confidence: 0.9, data: { statement: "same statement", verified: true } });
    const unverified = node("unverified", { confidence: 0.88, data: { statement: "same statement", verified: false } });
    const olderVersion = node("older-version", { version: 1, data: { statement: "versioned", verified: true } });
    const newerVersion = node("newer-version", { version: 2, data: { statement: "versioned", verified: true } });
    const lowConfidence = node("low-confidence", {
      confidence: 0.1,
      data: { statement: "weak", verified: true },
    });
    const winner = node("confidence-winner", {
      confidence: 0.95,
      data: { statement: "confidence", verified: true },
    });
    const loser = node("confidence-loser", {
      confidence: 0.5,
      data: { statement: "confidence", verified: true },
    });

    [verified, unverified, olderVersion, newerVersion, lowConfidence, winner, loser].forEach((item) => {
      staging.addNode(item);
    });

    const reflector = new TKGReflector(bus, {
      minConfidence: 0.7,
      autoResolveConfidenceGap: 0.2,
      conflictPolicy: {
        contradiction: "manual",
        version: "defer",
        confidence: "auto",
      },
      stateStore: store,
    });
    const merge = reflector.reflect(staging, production);

    expect(merge.nodesPromoted).toBe(1);
    expect(Array.from(production.nodes.keys())).toEqual([winner.id]);
    expect(reflector.getManualReviewQueue()).toHaveLength(1);
    expect(reflector.getDeferredQueue()).toHaveLength(1);
    expect(reflector.getOperationalMetrics()).toMatchObject({
      totalMerges: 1,
      totalConflicts: 3,
      autoResolved: 1,
      deferred: 1,
      manualReview: 1,
      rollbacks: 0,
    });
    expect(reflector.getLastReport()).toMatchObject({
      mergeId: merge.mergeId,
      promoted: 1,
      blockedByConflict: 5,
      conflictSummary: { contradiction: 1, version: 1, confidence: 1 },
      policySummary: { auto: 1, manual: 1, defer: 1 },
    });
    expect(emitted.map((captured) => captured.type)).toContain("tkg.reflector.merge.started");
    expect(emitted.map((captured) => captured.type)).toContain("tkg.reflector.merge.completed");
    expect(store.saves).toBeGreaterThan(0);
  });

  it("resolves queues, exports/imports operational state, and rolls back staging snapshots", () => {
    const staging = new InMemoryStagingTKG();
    const production = new InMemoryProductionTKG();
    const first = node("manual-a", { data: { statement: "manual", verified: true } });
    const second = node("manual-b", { data: { statement: "manual", verified: false } });
    staging.addNode(first);
    staging.addNode(second);

    const reflector = new TKGReflector(undefined, {
      conflictPolicy: { contradiction: "manual" },
      rollbackSnapshotDepth: 1,
      reportHistoryDepth: 1,
    });
    const merge = reflector.reflect(staging, production);
    const reviewItem = reflector.getManualReviewQueue()[0];

    expect(reflector.resolveManualReview("missing")).toBe(false);
    expect(reflector.resolveManualReview(first.id)).toBe(true);
    expect(reflector.resolveManualReviewById(reviewItem.id)).toBe(false);

    const deferredReflector = new TKGReflector(undefined, { conflictPolicy: { contradiction: "defer" } });
    deferredReflector.reflect(staging, production);
    const deferredItem = deferredReflector.getDeferredQueue()[0];
    expect(deferredReflector.resolveDeferred("missing")).toBe(false);
    expect(deferredReflector.resolveDeferredById(deferredItem.id)).toBe(true);

    const exported = reflector.exportOperationalState();
    const imported = new TKGReflector();
    imported.importOperationalState(exported);
    expect(imported.getReportHistory()).toHaveLength(1);
    expect(imported.getLastReport()?.mergeId).toBe(merge.mergeId);

    staging.clearNodes();
    expect(reflector.rollback(staging, "missing")).toMatchObject({ mergeResultId: "missing", rolledBack: 0 });
    expect(reflector.rollback(staging, merge.mergeId)).toMatchObject({
      mergeResultId: merge.mergeId,
      rolledBack: 2,
    });
    expect(staging.nodes.size).toBe(2);
    expect(reflector.rollback(staging)).toMatchObject({ rolledBack: 2 });
    expect(staging.nodes.size).toBe(0);
    expect(reflector.getOperationalMetrics().rollbacks).toBe(2);
  });

  it("loads persisted state from the configured state store", () => {
    const store = new MemoryStateStore();
    const savedAt = new Date("2026-02-01T01:00:00.000Z");
    store.state = {
      metrics: {
        totalMerges: 1,
        totalConflicts: 1,
        autoResolved: 0,
        deferred: 0,
        manualReview: 1,
        rollbacks: 0,
      },
      manualReviewQueue: [
        {
          id: "review-1",
          conflictType: "contradiction",
          nodeIds: ["a", "b"],
          queuedAt: savedAt,
        },
      ],
      deferredQueue: [],
      reportHistory: [
        {
          generatedAt: savedAt,
          mergeId: "merge-1",
          promoted: 0,
          blockedByConflict: 2,
          conflictSummary: { contradiction: 1, version: 0, confidence: 0 },
          policySummary: { auto: 0, manual: 1, defer: 0 },
        },
      ],
      rollbackSnapshots: [{ mergeId: "merge-1", nodes: [node("rollback")] }],
    };

    const reflector = new TKGReflector(undefined, { stateStore: store });

    expect(reflector.getOperationalMetrics()).toMatchObject({ totalMerges: 1, manualReview: 1 });
    expect(reflector.getManualReviewQueue()[0]).toMatchObject({ id: "review-1", queuedAt: savedAt });
    expect(reflector.getLastReport()?.mergeId).toBe("merge-1");
  });

  it("detects conflicts without treating unrelated statements as conflicting", () => {
    const reflector = new TKGReflector();

    expect(
      reflector.detectConflicts([
        node("same-a", { data: { statement: "same", verified: true } }),
        node("same-b", { data: { statement: "same", verified: false } }),
        node("different", { data: { statement: "different", verified: false } }),
      ]),
    ).toEqual([
      expect.objectContaining({
        type: "contradiction",
        left: expect.objectContaining({ id: "same-a" }),
        right: expect.objectContaining({ id: "same-b" }),
      }),
    ]);
  });
});
