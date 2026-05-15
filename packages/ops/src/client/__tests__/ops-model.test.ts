import { describe, expect, it } from "vitest";

import {
  addAgentNode,
  compileWorkflowYaml,
  getSelectedNode,
  getSelectedRun,
  initialOpsState,
  parseWorkflowNodeKind,
  parseWorkflowNodeStatus,
  resolveGraphEdges,
  selectNode,
  selectRun,
  summarizeOpsState,
  updateSelectedNode,
  updateWorkflowPrompt,
  type OpsWorkbenchState,
} from "../ops-model";

const emptyState: OpsWorkbenchState = {
  workflowName: "empty",
  systemPrompt: "",
  selectedNodeId: undefined,
  selectedRunId: undefined,
  nodes: [],
  edges: [],
  runs: [],
};

describe("ops-model", () => {
  it("summarizes the initial operations state", () => {
    expect(summarizeOpsState(initialOpsState)).toEqual({
      nodeCount: 4,
      readyCount: 2,
      activeRuns: 1,
      failedRuns: 1,
    });
  });

  it("selects valid nodes and ignores unknown node ids", () => {
    const selected = selectNode(initialOpsState, "route-policy");
    const unchanged = selectNode(selected, "missing-node");

    expect(getSelectedNode(selected).id).toBe("route-policy");
    expect(getSelectedNode(unchanged).id).toBe("route-policy");
  });

  it("selects valid runs and ignores unknown run ids", () => {
    const selected = selectRun(initialOpsState, "run-2026-05-15-b");
    const unchanged = selectRun(selected, "missing-run");

    expect(getSelectedRun(selected).id).toBe("run-2026-05-15-b");
    expect(getSelectedRun(unchanged).id).toBe("run-2026-05-15-b");
  });

  it("falls back when node or run collections are empty", () => {
    expect(getSelectedNode(emptyState).id).toBe("empty-node");
    expect(getSelectedRun(emptyState).id).toBe("empty-run");
    expect(updateSelectedNode(emptyState, { title: "No-op" })).toBe(emptyState);
  });

  it("updates the selected node without mutating the original state", () => {
    const updated = updateSelectedNode(initialOpsState, {
      title: "Review contract",
      kind: "decision",
      status: "blocked",
    });

    expect(getSelectedNode(updated)).toMatchObject({
      id: "validate-input",
      title: "Review contract",
      kind: "decision",
      status: "blocked",
    });
    expect(getSelectedNode(initialOpsState).title).toBe("Validate input");
  });

  it("updates the system prompt", () => {
    const updated = updateWorkflowPrompt(initialOpsState, "Keep every decision auditable.");

    expect(updated.systemPrompt).toBe("Keep every decision auditable.");
    expect(initialOpsState.systemPrompt).toContain("workflow operator");
  });

  it("adds an agent node and connects it to the previous graph tail", () => {
    const updated = addAgentNode(initialOpsState);
    const node = getSelectedNode(updated);
    const edge = updated.edges.at(-1);

    expect(node).toMatchObject({
      id: "agent-step-5",
      title: "Agent step 5",
      status: "draft",
    });
    expect(edge).toMatchObject({
      source: "handoff-result",
      target: "agent-step-5",
      label: "next",
    });
  });

  it("adds the first node without creating an edge", () => {
    const updated = addAgentNode(emptyState);

    expect(updated.nodes).toHaveLength(1);
    expect(updated.edges).toHaveLength(0);
    expect(updated.selectedNodeId).toBe("agent-step-1");
  });

  it("resolves only graph edges with existing endpoints", () => {
    const resolved = resolveGraphEdges(initialOpsState.nodes, [
      ...initialOpsState.edges,
      {
        id: "missing",
        source: "missing",
        target: "validate-input",
        label: "ignored",
      },
    ]);

    expect(resolved).toHaveLength(initialOpsState.edges.length);
    expect(resolved.map((edge) => edge.id)).not.toContain("missing");
  });

  it("parses supported select values and defaults unknown values", () => {
    expect(parseWorkflowNodeKind("tool")).toBe("tool");
    expect(parseWorkflowNodeKind("unknown")).toBe("agent");
    expect(parseWorkflowNodeStatus("ready")).toBe("ready");
    expect(parseWorkflowNodeStatus("unknown")).toBe("draft");
  });

  it("compiles a graph workflow draft into yaml-like text", () => {
    const compiled = compileWorkflowYaml(initialOpsState);

    expect(compiled).toContain('name: "intake-to-decision"');
    expect(compiled).toContain("systemPrompt: |");
    expect(compiled).toContain('id: "validate-input"');
    expect(compiled).toContain('from: "validate-input"');
  });

  it("compiles an empty graph with an explicit empty edge list", () => {
    expect(compileWorkflowYaml(emptyState)).toContain("  edges:\n    []");
  });
});
