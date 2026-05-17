import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NodeChange } from "@xyflow/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  App,
  canvasPositionPatchFromChange,
  canvasPositionPatchesFromChanges,
  edgeConnectionInputFromCanvas,
  edgeIdsFromDeletedCanvasEdges,
  nodeColorForCanvasNode,
  workflowEdgeToCanvasEdge,
  workflowNodeToCanvasNode,
  type WorkflowCanvasNodeType,
} from "../App";
import { initialOpsState, type WorkflowEdge, type WorkflowNode } from "../ops-model";

afterEach(() => {
  cleanup();
});

const renderApp = () => render(<App />);

const requireNode = (nodeId: string): WorkflowNode => {
  const node = initialOpsState.nodes.find((candidate) => candidate.id === nodeId);

  if (node === undefined) {
    throw new Error(`missing test node ${nodeId}`);
  }

  return node;
};

const requireEdge = (edgeId: string): WorkflowEdge => {
  const edge = initialOpsState.edges.find((candidate) => candidate.id === edgeId);

  if (edge === undefined) {
    throw new Error(`missing test edge ${edgeId}`);
  }

  return edge;
};

describe("App", () => {
  it("renders the graph workbench with nodes, metrics, and compiled output", () => {
    renderApp();

    expect(screen.getByRole("heading", { name: "Workflow Operations" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Workflow infinite canvas" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Validate input" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zoom In" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Mini Map" })).toBeTruthy();
    expect(screen.getByLabelText("Compiled workflow").textContent).toContain(
      'name: "intake-to-decision"'
    );
    expect(screen.getAllByText("Nodes")).toHaveLength(2);
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(1);
  });

  it("edits the selected graph node", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Review contract");
    await user.selectOptions(screen.getByLabelText("Kind"), "decision");
    await user.clear(screen.getByLabelText("Agent"));
    await user.type(screen.getByLabelText("Agent"), "risk-reviewer");
    await user.clear(screen.getByLabelText("Model"));
    await user.type(screen.getByLabelText("Model"), "gpt-5.5");
    await user.clear(screen.getByLabelText("Policy"));
    await user.type(screen.getByLabelText("Policy"), "approval-required");
    await user.selectOptions(screen.getByLabelText("State"), "blocked");
    await user.clear(screen.getByLabelText("Step System Prompt"));
    await user.type(screen.getByLabelText("Step System Prompt"), "Review as a system instruction.");

    expect(screen.getByRole("button", { name: "Open Review contract" })).toBeTruthy();
    expect(screen.getByLabelText("Compiled workflow").textContent).toContain(
      'title: "Review contract"'
    );
    expect(screen.getByLabelText("Compiled workflow").textContent).toContain('kind: "decision"');
    expect(screen.getByLabelText("Compiled workflow").textContent).toContain(
      'agent: "risk-reviewer"'
    );
    expect(screen.getByLabelText("Compiled workflow").textContent).toContain('model: "gpt-5.5"');
    expect(screen.getByLabelText("Compiled workflow").textContent).toContain(
      'policy: "approval-required"'
    );
    expect(screen.getByLabelText("Compiled workflow").textContent).toContain('status: "blocked"');
    expect(screen.getByLabelText("Compiled workflow").textContent).toContain(
      "Review as a system instruction."
    );
  });

  it("adds a graph node and selects it", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Add step" }));

    expect(screen.getByRole("button", { name: "Open Agent step 5" })).toBeTruthy();
    expect(screen.getByLabelText("Compiled workflow").textContent).toContain('id: "agent-step-5"');
  });

  it("connects a manually selected edge between workflow steps", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Add step" }));
    await user.selectOptions(screen.getByLabelText("From"), "route-policy");
    await user.selectOptions(screen.getByLabelText("To"), "agent-step-5");
    await user.clear(screen.getByLabelText("Edge label"));
    await user.type(screen.getByLabelText("Edge label"), "manual");
    await user.click(screen.getByRole("button", { name: "Connect edge" }));

    expect(
      screen.getByRole("button", { name: "Open edge Route policy to Agent step 5" })
    ).toBeTruthy();
    expect(screen.getByLabelText("Compiled workflow").textContent).toContain(
      'from: "route-policy"'
    );
    expect(screen.getByLabelText("Compiled workflow").textContent).toContain('to: "agent-step-5"');
    expect(screen.getByLabelText("Compiled workflow").textContent).toContain('label: "manual"');
  });

  it("maps workflow records into canvas nodes, edges, and position patches", () => {
    const selectedNode = workflowNodeToCanvasNode(requireNode("validate-input"), "validate-input");
    const idleNode = workflowNodeToCanvasNode(requireNode("route-policy"), "validate-input");
    const edge = workflowEdgeToCanvasEdge(requireEdge("ingest-request-to-validate-input"));
    const readyColor = nodeColorForCanvasNode(initialOpsState.nodes, selectedNode);
    const draftColor = nodeColorForCanvasNode(initialOpsState.nodes, idleNode);
    const missingColor = nodeColorForCanvasNode(initialOpsState.nodes, {
      ...idleNode,
      id: "missing-node",
    });
    const positionChange: NodeChange<WorkflowCanvasNodeType> = {
      id: "route-policy",
      type: "position",
      position: { x: 720, y: 320 },
    };
    const selectionChange: NodeChange<WorkflowCanvasNodeType> = {
      id: "route-policy",
      type: "select",
      selected: true,
    };

    expect(selectedNode).toMatchObject({
      id: "validate-input",
      selected: true,
      ariaLabel: "Select Validate input",
      position: { x: 340, y: 120 },
    });
    expect(idleNode.selected).toBe(false);
    expect(edge).toMatchObject({
      id: "ingest-request-to-validate-input",
      source: "ingest-request",
      target: "validate-input",
      type: "smoothstep",
      label: "payload",
    });
    expect(readyColor).toBe("#1f7a64");
    expect(draftColor).toBe("#b98925");
    expect(missingColor).toBe("#b98925");
    expect(canvasPositionPatchFromChange(positionChange)).toEqual([
      { id: "route-policy", position: { x: 720, y: 320 } },
    ]);
    expect(canvasPositionPatchFromChange(selectionChange)).toEqual([]);
    expect(canvasPositionPatchesFromChanges([positionChange, selectionChange])).toEqual([
      { id: "route-policy", position: { x: 720, y: 320 } },
    ]);
    expect(
      edgeConnectionInputFromCanvas({
        source: "route-policy",
        sourceHandle: "next",
        target: "agent-step-5",
        targetHandle: "input",
      })
    ).toEqual({
        source: "route-policy",
        target: "agent-step-5",
        label: "next",
      });
    expect(edgeIdsFromDeletedCanvasEdges([edge])).toEqual(["ingest-request-to-validate-input"]);
  });

  it("selects nodes from the infinite canvas surface", () => {
    const { container } = renderApp();
    const routeNode = container.querySelector('.react-flow__node[data-id="route-policy"]');

    expect(routeNode).toBeTruthy();

    fireEvent.click(routeNode as Element);

    expect(screen.getByDisplayValue("Route policy")).toBeTruthy();
  });

  it("disconnects existing workflow edges", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(
      screen.getByRole("button", { name: "Disconnect Validate input to Route policy" })
    );

    expect(screen.getByLabelText("Compiled workflow").textContent).not.toContain(
      'from: "validate-input"\n      to: "route-policy"'
    );
  });

  it("edits the workflow system prompt surface", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Prompt" }));
    await user.clear(screen.getByLabelText("Workflow System Prompt"));
    await user.type(
      screen.getByLabelText("Workflow System Prompt"),
      "Escalate risky workflow changes."
    );

    expect(screen.getByLabelText("Prompt compile preview").textContent).toContain(
      "Escalate risky workflow changes."
    );
  });

  it("switches to run history and selects a failed run", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Runs" }));
    await user.click(screen.getByRole("button", { name: /repair-loop-triage/ }));
    await user.click(screen.getByText("Trace"));

    expect(screen.getAllByText("run-2026-05-15-b")).toHaveLength(2);
    expect(screen.getByText("Generate patch plan")).toBeTruthy();
    expect(screen.getByText("Heuristic trace enrichment over repair-loop failures")).toBeTruthy();
    expect(screen.getByText("Previous validation history may be too large for the prompt")).toBeTruthy();
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(1);
  });

  it("returns to graph mode when a node is selected from another mode", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Runs" }));
    await user.click(screen.getByRole("button", { name: "Open Route policy" }));

    expect(screen.getByLabelText("Node inspector")).toBeTruthy();
    expect(screen.getByDisplayValue("Route policy")).toBeTruthy();
  });
});
