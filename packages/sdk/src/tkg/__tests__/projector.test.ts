import { describe, expect, it } from "vitest";

import { EventBus } from "../../events/event-bus.js";
import { TKGProjector, projectAuditEventToTemporalNode } from "../projector.js";
import type { StagingTKGSnapshot, StagingTKGStore } from "../store.js";
import type { MemoryScope } from "../../shared-memory/store.js";

function createInMemoryStore(): StagingTKGStore {
  const data = new Map<string, StagingTKGSnapshot>();

  return {
    async load(scope: MemoryScope) {
      return data.get(`${scope.level}:${scope.key}`) ?? null;
    },
    async save(scope: MemoryScope, snapshot: StagingTKGSnapshot) {
      data.set(`${scope.level}:${scope.key}`, snapshot);
    },
    async append(scope: MemoryScope, nodes) {
      const key = `${scope.level}:${scope.key}`;
      const existing = data.get(key) ?? { nodes: [] };
      data.set(key, { nodes: [...existing.nodes, ...nodes] });
    },
  };
}

describe("TKGProjector", () => {
  it("projects validation events into temporal nodes", () => {
    const node = projectAuditEventToTemporalNode(
      {
        id: "evt-1",
        executionId: "exec-1",
        timestamp: new Date("2026-03-21T11:00:00.000Z"),
        type: "workflow.validation_failed",
        data: {
          stepName: "validate",
          summary: "TS errors remain",
        },
      },
      "demo-workflow",
    );

    expect(node.workflowName).toBe("demo-workflow");
    expect(node.eventType).toBe("workflow.validation_failed");
    expect(node.stepName).toBe("validate");
    expect(node.summary).toContain("TS errors remain");
    expect(node.relations).toContainEqual({ type: "step", target: "validate" });
  });

  it("persists projected nodes for subscribed execution events", async () => {
    const eventBus = new EventBus();
    const store = createInMemoryStore();
    const projector = new TKGProjector(eventBus, store, {
      workflowName: "demo-workflow",
      scopes: [{ level: "project", key: "obora-kit" }],
    });

    projector.observe("exec-1");

    await eventBus.emit("workflow.validation_failed", "exec-1", {
      stepName: "validate",
      summary: "TS errors remain",
    });
    await eventBus.emit("workflow.repair_started", "exec-1", {
      stepName: "build",
      attempt: 2,
    });
    await eventBus.emit("workflow.validation_passed", "other-exec", {
      stepName: "validate",
      summary: "ignored",
    });

    const snapshot = await store.load({ level: "project", key: "obora-kit" });
    const summary = projector.getSummary();
    projector.dispose();

    expect(snapshot?.nodes).toHaveLength(2);
    expect(snapshot?.nodes.map((node) => node.eventType)).toEqual([
      "workflow.validation_failed",
      "workflow.repair_started",
    ]);
    expect(snapshot?.nodes[0]?.summary).toContain("TS errors remain");
    expect(snapshot?.nodes[1]?.summary).toContain("attempt 2");
    expect(snapshot?.nodes[1]?.relations).toContainEqual({
      type: "caused_by",
      target: snapshot!.nodes[0]!.id,
    });
    expect(summary).toEqual({
      projectedNodeCount: 2,
      projectedScopes: ["project:obora-kit"],
      eventTypes: ["workflow.validation_failed", "workflow.repair_started"],
    });
  });

  it("connects validation and repair lifecycle nodes with graph relations", async () => {
    const eventBus = new EventBus();
    const store = createInMemoryStore();
    const projector = new TKGProjector(eventBus, store, {
      workflowName: "demo-workflow",
      scopes: [{ level: "project", key: "obora-kit" }],
    });

    projector.observe("exec-graph");

    await eventBus.emit("workflow.validation_failed", "exec-graph", {
      stepName: "validate",
      summary: "TS errors remain",
    });
    await eventBus.emit("workflow.back_edge_triggered", "exec-graph", {
      sourceStep: "validate",
      targetStep: "build",
    });
    await eventBus.emit("workflow.repair_started", "exec-graph", {
      stepName: "build",
      attempt: 2,
    });
    await eventBus.emit("workflow.repair_completed", "exec-graph", {
      stepName: "build",
      attempt: 2,
    });
    await eventBus.emit("workflow.validation_passed", "exec-graph", {
      stepName: "validate",
      summary: "All green",
    });

    const snapshot = await store.load({ level: "project", key: "obora-kit" });
    projector.dispose();

    expect(snapshot?.nodes).toHaveLength(5);
    const [validationFailed, backEdge, repairStarted, repairCompleted, validationPassed] = snapshot!.nodes;

    expect(backEdge!.relations).toContainEqual({ type: "triggered_by", target: validationFailed!.id });
    expect(repairStarted!.relations).toContainEqual({ type: "caused_by", target: validationFailed!.id });
    expect(repairCompleted!.relations).toContainEqual({ type: "completes", target: repairStarted!.id });
    expect(validationPassed!.relations).toContainEqual({ type: "resolves", target: validationFailed!.id });
  });
});
