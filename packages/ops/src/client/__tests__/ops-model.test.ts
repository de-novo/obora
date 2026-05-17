import { describe, expect, it } from "vitest";

import {
  addAgentNode,
  compileWorkflowYaml,
  connectNodes,
  disconnectEdge,
  filterRunStepsByTraceFilter,
  getSelectedNode,
  getSelectedRun,
  getTraceSeverity,
  initialOpsState,
  parseTraceFilter,
  parseWorkflowNodeKind,
  parseWorkflowNodeStatus,
  serializeTraceForInspection,
  resolveGraphEdges,
  selectNode,
  selectRun,
  summarizeOpsState,
  traceExportFilenameForStep,
  updateSelectedNode,
  updateNodePositions,
  updateWorkflowPrompt,
  type ExecutionStepTrace,
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

const highConfidenceTrace: ExecutionStepTrace = {
  task_summary: "Validated the workflow graph",
  methodology: "Direct inspection",
  key_decisions: [],
  assumptions: [],
  risks_identified: [],
  artifacts_created: [],
  confidence_level: "high",
  context_for_successors: "Continue with execution.",
};

describe("ops-model", () => {
  it("summarizes the initial operations state", () => {
    expect(summarizeOpsState(initialOpsState)).toEqual({
      nodeCount: 4,
      edgeCount: 3,
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
    expect(getSelectedRun(selected).steps[1]?.trace).toMatchObject({
      methodology: "Heuristic trace enrichment over repair-loop failures",
      confidence_level: "low",
    });
  });

  it("filters run steps by trace severity and serializes raw trace payloads", () => {
    const selected = getSelectedRun(selectRun(initialOpsState, "run-2026-05-15-b"));
    const tracedStep = selected.steps[1];

    if (tracedStep === undefined || tracedStep.trace === undefined) {
      throw new Error("missing traced step");
    }

    expect(filterRunStepsByTraceFilter(selected.steps, "all")).toHaveLength(2);
    expect(filterRunStepsByTraceFilter(selected.steps, "critical").map((step) => step.id)).toEqual([
      "run-b-step-2",
    ]);
    expect(filterRunStepsByTraceFilter(selected.steps, "with-risks").map((step) => step.id)).toEqual([
      "run-b-step-2",
    ]);
    expect(filterRunStepsByTraceFilter(selected.steps, "info")).toHaveLength(0);
    expect(getTraceSeverity(tracedStep.trace)).toBe("critical");
    expect(getTraceSeverity({ ...highConfidenceTrace, confidence_level: "medium" })).toBe(
      "warning"
    );
    expect(getTraceSeverity({ ...highConfidenceTrace, risks_identified: ["late signal"] })).toBe(
      "warning"
    );
    expect(getTraceSeverity(highConfidenceTrace)).toBe("info");
    expect(traceExportFilenameForStep(selected.id, tracedStep)).toBe(
      "run-2026-05-15-b-generate-patch-plan-trace.json"
    );
    expect(traceExportFilenameForStep("!!!", { ...tracedStep, title: "" })).toBe(
      "trace-trace-trace.json"
    );
    expect(serializeTraceForInspection(selected, tracedStep)).toContain(
      '"methodology": "Heuristic trace enrichment over repair-loop failures"'
    );
    expect(serializeTraceForInspection(selected, selected.steps[0] ?? tracedStep)).toContain(
      '"trace": null'
    );
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
      systemPrompt: "Review every field as system policy.",
      status: "blocked",
    });

    expect(getSelectedNode(updated)).toMatchObject({
      id: "validate-input",
      title: "Review contract",
      kind: "decision",
      systemPrompt: "Review every field as system policy.",
      status: "blocked",
    });
    expect(getSelectedNode(initialOpsState).title).toBe("Validate input");
  });

  it("updates the workflow system prompt", () => {
    const updated = updateWorkflowPrompt(initialOpsState, "Keep every decision auditable.");

    expect(updated.systemPrompt).toBe("Keep every decision auditable.");
    expect(initialOpsState.systemPrompt).toContain("workflow operator");
  });

  it("adds an agent node without creating implicit edges", () => {
    const updated = addAgentNode(initialOpsState);
    const node = getSelectedNode(updated);

    expect(node).toMatchObject({
      id: "agent-step-5",
      title: "Agent step 5",
      systemPrompt: "Describe the system behavior for this workflow step.",
      status: "draft",
    });
    expect(updated.edges).toHaveLength(initialOpsState.edges.length);
  });

  it("adds the first node without creating an edge", () => {
    const updated = addAgentNode(emptyState);
    const second = addAgentNode(updated);

    expect(updated.nodes).toHaveLength(1);
    expect(updated.edges).toHaveLength(0);
    expect(updated.selectedNodeId).toBe("agent-step-1");
    expect(getSelectedNode(second)).toMatchObject({
      id: "agent-step-2",
      y: 420,
    });
  });

  it("connects nodes with a manual edge", () => {
    const updated = connectNodes(addAgentNode(initialOpsState), {
      source: "route-policy",
      target: "agent-step-5",
      label: "approved",
    });

    expect(updated.edges.at(-1)).toMatchObject({
      id: "route-policy-to-agent-step-5",
      source: "route-policy",
      target: "agent-step-5",
      label: "approved",
    });
  });

  it("defaults blank manual edge labels to next", () => {
    const updated = connectNodes(addAgentNode(initialOpsState), {
      source: "route-policy",
      target: "agent-step-5",
      label: "  ",
    });

    expect(updated.edges.at(-1)).toMatchObject({
      label: "next",
    });
  });

  it("updates an existing manual edge instead of duplicating it", () => {
    const connected = connectNodes(initialOpsState, {
      source: "validate-input",
      target: "route-policy",
      label: "reviewed",
    });

    expect(connected.edges).toHaveLength(initialOpsState.edges.length);
    expect(
      connected.edges.find((edge) => edge.id === "validate-input-to-route-policy")
    ).toMatchObject({
      label: "reviewed",
    });
  });

  it("updates dragged node canvas positions without mutating other nodes", () => {
    const updated = updateNodePositions(initialOpsState, [
      { id: "route-policy", position: { x: 720.4, y: 318.5 } },
    ]);

    expect(getSelectedNode(selectNode(updated, "route-policy"))).toMatchObject({
      id: "route-policy",
      x: 720,
      y: 319,
    });
    expect(getSelectedNode(selectNode(updated, "validate-input"))).toMatchObject({
      id: "validate-input",
      x: 340,
      y: 120,
    });
  });

  it("ignores invalid edge connections", () => {
    expect(
      connectNodes(initialOpsState, {
        source: "validate-input",
        target: "validate-input",
        label: "self",
      })
    ).toBe(initialOpsState);
    expect(
      connectNodes(initialOpsState, {
        source: "missing",
        target: "validate-input",
        label: "missing",
      })
    ).toBe(initialOpsState);
  });

  it("disconnects edges by id", () => {
    const updated = disconnectEdge(initialOpsState, "validate-input-to-route-policy");

    expect(updated.edges.map((edge) => edge.id)).not.toContain("validate-input-to-route-policy");
    expect(disconnectEdge(initialOpsState, "missing-edge").edges).toHaveLength(
      initialOpsState.edges.length
    );
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
    expect(parseTraceFilter("warning")).toBe("warning");
    expect(parseTraceFilter("unknown")).toBe("all");
  });

  it("compiles a graph workflow draft into yaml-like text", () => {
    const compiled = compileWorkflowYaml(initialOpsState);

    expect(compiled).toContain('name: "intake-to-decision"');
    expect(compiled).toContain("systemPrompt: |");
    expect(compiled).toContain("Validate the request against the graph contract");
    expect(compiled).toContain('id: "validate-input"');
    expect(compiled).toContain('from: "validate-input"');
  });

  it("compiles an empty graph with an explicit empty edge list", () => {
    expect(compileWorkflowYaml(emptyState)).toContain("  edges:\n    []");
  });
});
