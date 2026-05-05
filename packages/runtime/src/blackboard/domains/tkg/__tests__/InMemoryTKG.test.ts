import { describe, expect, it } from "vitest";
import { createAgentId, createEdgeId, createNodeId } from "../../../types";
import type { EdgeId, NodeId, TemporalEdge, TemporalNode } from "../../../types";
import { InMemoryProductionTKG, InMemoryStagingTKG } from "../InMemoryTKG";

const agentId = createAgentId("agent-1");
const past = new Date("2026-01-01T00:00:00.000Z");
const present = new Date("2026-01-01T00:10:00.000Z");
const future = new Date("2026-01-01T00:20:00.000Z");

function createNode(id: string, overrides: Partial<TemporalNode> = {}): TemporalNode {
  return {
    id: createNodeId(id),
    type: "fact",
    valid_from: past,
    observed_at: past,
    updated_at: past,
    confidence: 0.8,
    source: agentId,
    version: 1,
    tags: ["release"],
    data: {
      statement: `${id} statement`,
      verified: true,
    },
    ...overrides,
  };
}

function createEdge(
  id: string,
  from: NodeId,
  to: NodeId,
  overrides: Partial<TemporalEdge> = {}
): TemporalEdge {
  return {
    id: createEdgeId(id),
    from,
    to,
    type: "supports",
    valid_from: past,
    observed_at: past,
    confidence: 0.7,
    source: agentId,
    ...overrides,
  };
}

describe("InMemoryTKG", () => {
  it("stages nodes and edges with query filters and validation", () => {
    const staging = new InMemoryStagingTKG();
    const nodeA = createNode("node-a", { confidence: 0.9 });
    const nodeB = createNode("node-b", {
      type: "decision",
      tags: ["decision"],
      valid_to: present,
      confidence: 0.6,
      data: {
        agendaId: "agenda-1",
        outcome: "approve",
        reason: "green gates",
        participants: [agentId],
      },
    });
    const edge = createEdge("edge-a", nodeA.id, nodeB.id);

    expect(staging.addNode(nodeA)).toBe(nodeA.id);
    expect(staging.addNode(nodeB)).toBe(nodeB.id);
    expect(staging.addEdge(edge)).toBe(edge.id);

    expect(staging.queryCurrent({ nodeTypes: ["fact"], tags: ["release"] }).nodes).toEqual([
      nodeA,
    ]);
    expect(staging.queryAtTime({ nodeIds: [nodeB.id] }, future).nodes).toEqual([]);
    expect(staging.queryAtTime({ edgeTypes: ["supports"], from: nodeA.id, to: nodeB.id }, past).edges).toEqual([
      edge,
    ]);
    expect(staging.queryByConfidence({}, 0.85).metadata.confidenceRange).toEqual([0.9, 0.9]);
    expect(staging.queryTimeRange({}, past, future)).toHaveLength(2);

    expect(staging.validateNode(nodeA).valid).toBe(true);
    expect(staging.validateNode(createNode("bad", { confidence: 2 })).errors[0]).toMatchObject({
      field: "confidence",
    });
    expect(staging.validateEdge(createEdge("bad-edge", nodeA.id, nodeB.id, { confidence: -1 })).valid).toBe(
      false
    );

    staging.clearNodes();
    expect(staging.nodes.size).toBe(0);
    staging.restoreNodes([nodeA]);
    expect(staging.nodes.get(nodeA.id)).toBe(nodeA);
  });

  it("promotes production nodes and protects readonly map views", () => {
    const production = new InMemoryProductionTKG();
    const nodeA = createNode("node-a", { confidence: 0.95 });
    const nodeB = createNode("node-b");
    const edge = createEdge("edge-a", nodeA.id, nodeB.id);

    expect(production.promoteNode(nodeA).success).toBe(true);
    expect(production.promoteEdge(edge)).toMatchObject({ nodeId: nodeA.id, success: true });
    expect(production.getValidNodes(present)).toEqual([nodeA]);
    expect(production.getValidEdges(present)).toEqual([]);

    const merge = production.promoteBatch({ nodes: [nodeB], edges: [edge] });
    expect(merge).toMatchObject({
      nodesPromoted: 1,
      edgesPromoted: 1,
      nodesSkipped: 0,
      nodesFailed: 0,
      edgesSkipped: 0,
    });
    expect(production.getValidEdges(present)).toEqual([edge]);

    expect(() => {
      (production.nodes as Map<NodeId, TemporalNode>).set(createNodeId("blocked"), nodeA);
    }).toThrow("read-only");
    expect(() => {
      (production.edges as Map<EdgeId, TemporalEdge>).clear();
    }).toThrow("read-only");
  });
});
