import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { NodeChange } from "@xyflow/react";
import { afterEach, describe, expect, it, vi } from "vitest";

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
  window.location.hash = "";
});

const renderApp = () => render(<App />);

const renderBuilder = async () => {
  const user = userEvent.setup();
  const view = renderApp();

  await user.click(screen.getByRole("button", { name: "Edit workflow Employee Onboarding" }));

  return { user, ...view };
};

const openConnectionsPanel = async (user: ReturnType<typeof userEvent.setup>): Promise<void> => {
  await user.click(screen.getByText("Connections", { selector: "summary" }));
};

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
  it("renders the workflow list page with selectable edit actions", () => {
    renderApp();

    expect(screen.getByRole("heading", { name: "Workflow Builder" })).toBeTruthy();
    expect(screen.getByText("OpsFlow")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Workflow list page" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select workflow Employee Onboarding" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit workflow Employee Onboarding" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run workflow" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open workflow menu Employee Onboarding" })
    ).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Workflow filters" })).toBeTruthy();
    expect(screen.getByRole("complementary", { name: "Selected workflow review" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "All Workflows128" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filter workflows" })).toHaveProperty(
      "disabled",
      true
    );
    expect(screen.getByRole("region", { name: "Next workflow action" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select workflow Vendor Invoice Processing" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select workflow IT Access Provisioning" })).toBeTruthy();
    expect(screen.getByText("Showing 1 to 10 of 128 workflows")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Workflow infinite canvas" })).toBeNull();
  });

  it("opens workflow pages through hash routes", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Select workflow IT Access Provisioning" }));
    await user.click(screen.getByRole("button", { name: "Edit workflow IT Access Provisioning" }));

    expect(window.location.hash).toBe("#/workflows/workflow-release-readiness/builder");
    expect(screen.getByRole("region", { name: "Workflow infinite canvas" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Connections" }).getAttribute("aria-current")).toBe(
      "page"
    );

    await user.click(screen.getByRole("button", { name: "Workflows" }));

    expect(window.location.hash).toBe("#/workflows/workflow-release-readiness");
    expect(screen.getByRole("region", { name: "Workflow list page" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Select workflow Vendor Invoice Processing" }));
    await user.click(screen.getByRole("button", { name: "Run workflow" }));

    expect(window.location.hash).toBe("#/workflows/workflow-repair-loop-triage/runs");
    expect(screen.getByLabelText("Execution history")).toBeTruthy();
  });

  it("loads a workflow page directly from the hash route", async () => {
    window.location.hash = "#/workflows/workflow-release-readiness/instructions";

    renderApp();

    expect(await screen.findByDisplayValue(/release readiness operator/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Workflow instructions page" })).toBeTruthy();
  });

  it("opens the selected workflow in the graph workbench", async () => {
    await renderBuilder();

    expect(screen.getByRole("region", { name: "Workflow infinite canvas" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open Validate input" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zoom In" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Mini Map" })).toBeTruthy();
    expect(screen.queryByLabelText("Compiled workflow")).toBeNull();
    expect(screen.getByRole("heading", { name: "Steps" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Workflow readiness" })).toBeTruthy();
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(1);
    expect(screen.getByRole("region", { name: "Workflow diagnostics" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open diagnostic Handoff result is blocked" })
    ).toBeTruthy();
  });

  it("selects an existing workflow from the list page and edits it", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Select workflow IT Access Provisioning" }));

    const reviewPanel = screen.getByRole("complementary", { name: "Selected workflow review" });

    expect(
      screen
        .getByRole("button", { name: "Select workflow IT Access Provisioning" })
        .getAttribute("aria-pressed")
    ).toBe("true");
    expect(within(reviewPanel).getByRole("heading", { name: "IT Access Provisioning" })).toBeTruthy();
    expect(within(reviewPanel).getAllByText("Failed").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Edit workflow IT Access Provisioning" }));

    expect(screen.getByRole("button", { name: "Open Evaluate smoke" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Open Validate input" })).toBeNull();
    expect(screen.getByLabelText("Step name")).toHaveProperty("value", "Evaluate smoke");
  });

  it("filters workflow records and edits workflow settings", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText("Search"), "access");

    expect(screen.getByRole("button", { name: "Select workflow IT Access Provisioning" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Select workflow Vendor Invoice Processing" })
    ).toBeNull();
    expect(screen.getByText("Selected workflow is outside this filtered list.")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Select workflow IT Access Provisioning" }));
    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(window.location.hash).toBe("#/workflows/workflow-release-readiness/settings");
    expect(screen.getByRole("region", { name: "Workflow settings page" })).toBeTruthy();

    await user.clear(screen.getByLabelText("Workflow name"));
    await user.type(screen.getByLabelText("Workflow name"), "release-readiness-v2");

    expect(screen.getByDisplayValue("release-readiness-v2")).toBeTruthy();
  });

  it("filters workflow records from the directory search", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText("Search"), "finance");

    expect(screen.getByRole("button", { name: "Select workflow Vendor Invoice Processing" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select workflow Monthly Revenue Report" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Select workflow IT Access Provisioning" })
    ).toBeNull();

    await user.clear(screen.getByLabelText("Search"));
    await user.type(screen.getByLabelText("Search"), "Jordan");

    expect(screen.getByRole("button", { name: "Select workflow IT Access Provisioning" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select workflow Data Backup Verification" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Select workflow Employee Onboarding" })
    ).toBeNull();
  });

  it("clears workflow list filters from an empty or hidden selection state", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByLabelText("Search"), "missing workflow");

    expect(screen.getByText("No workflows match this view.")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Select workflow Employee Onboarding" })
    ).toBeNull();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    expect(screen.getByRole("button", { name: "Select workflow Employee Onboarding" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Filter workflows" })).toHaveProperty(
      "disabled",
      true
    );
  });

  it("creates a new workflow draft from the workflow list", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "New workflow" }));

    expect(screen.getByLabelText("Step name")).toHaveProperty("value", "Start request");

    await user.click(screen.getByRole("button", { name: "Add next step" }));
    await openConnectionsPanel(user);

    expect(screen.getByRole("button", { name: "Open Agent step 2" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open edge Start request to Agent step 2" })
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Workflows" }));

    const reviewPanel = screen.getByRole("complementary", { name: "Selected workflow review" });

    expect(screen.getByRole("button", { name: "Select workflow draft-workflow-4" })).toBeTruthy();
    expect(within(reviewPanel).getByRole("heading", { name: "draft-workflow-4" })).toBeTruthy();
    expect(within(reviewPanel).getAllByText("Never run").length).toBeGreaterThan(0);
  });

  it("edits the selected graph node", async () => {
    const { user } = await renderBuilder();

    await user.clear(screen.getByLabelText("Step name"));
    await user.type(screen.getByLabelText("Step name"), "Review contract");
    await user.selectOptions(screen.getByLabelText("Type"), "decision");
    await user.selectOptions(screen.getByLabelText("State"), "blocked");
    await user.click(screen.getByText("Advanced setup"));
    await user.clear(screen.getByLabelText("Agent"));
    await user.type(screen.getByLabelText("Agent"), "risk-reviewer");
    await user.clear(screen.getByLabelText("Model"));
    await user.type(screen.getByLabelText("Model"), "gpt-5.5");
    await user.clear(screen.getByLabelText("Policy"));
    await user.type(screen.getByLabelText("Policy"), "approval-required");
    await user.clear(screen.getByLabelText("Step instructions"));
    await user.type(screen.getByLabelText("Step instructions"), "Review as a system instruction.");

    expect(screen.getByRole("button", { name: "Open Review contract" })).toBeTruthy();
    expect(screen.getByLabelText("Step name")).toHaveProperty("value", "Review contract");
    expect(screen.getByDisplayValue("risk-reviewer")).toBeTruthy();
    expect(screen.getByDisplayValue("gpt-5.5")).toBeTruthy();
    expect(screen.getByDisplayValue("approval-required")).toBeTruthy();
    expect(screen.getByDisplayValue("Review as a system instruction.")).toBeTruthy();
  });

  it("adds the next graph node and connects it automatically", async () => {
    const { user } = await renderBuilder();

    await user.click(screen.getByRole("button", { name: "Add next step" }));
    await openConnectionsPanel(user);

    expect(screen.getByRole("button", { name: "Open Agent step 5" })).toBeTruthy();
    expect(screen.getByLabelText("Step name")).toHaveProperty("value", "Agent step 5");
    expect(
      screen.getByRole("button", { name: "Open edge Validate input to Agent step 5" })
    ).toBeTruthy();
  });

  it("keeps new steps editable after automatic connection", async () => {
    const { user } = await renderBuilder();

    await user.click(screen.getByRole("button", { name: "Add next step" }));
    await user.clear(screen.getByLabelText("Step name"));
    await user.type(screen.getByLabelText("Step name"), "Check approval");

    expect(screen.getByRole("button", { name: "Open Check approval" })).toBeTruthy();
    expect(screen.getByLabelText("Step name")).toHaveProperty("value", "Check approval");
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

  it("selects nodes from the infinite canvas surface", async () => {
    const { container } = await renderBuilder();
    const routeNode = container.querySelector('.react-flow__node[data-id="route-policy"]');

    expect(routeNode).toBeTruthy();

    fireEvent.click(routeNode as Element);

    expect(screen.getByDisplayValue("Route policy")).toBeTruthy();
  });

  it("disconnects existing workflow edges", async () => {
    const { user } = await renderBuilder();

    await openConnectionsPanel(user);
    await user.click(
      screen.getByRole("button", { name: "Disconnect Validate input to Route policy" })
    );

    expect(
      screen.queryByRole("button", { name: "Open edge Validate input to Route policy" })
    ).toBeNull();
  });

  it("opens a diagnostic target in the graph inspector", async () => {
    const { user } = await renderBuilder();

    await user.click(
      screen.getByRole("button", { name: "Open diagnostic Handoff result is blocked" })
    );

    expect(screen.getByLabelText("Node inspector")).toBeTruthy();
    expect(screen.getByDisplayValue("Handoff result")).toBeTruthy();
  });

  it("edits the workflow system prompt surface", async () => {
    const { user } = await renderBuilder();

    await user.click(screen.getByRole("button", { name: "Instructions" }));
    await user.clear(screen.getByRole("textbox", { name: "Instructions" }));
    await user.type(
      screen.getByRole("textbox", { name: "Instructions" }),
      "Escalate risky workflow changes."
    );

    expect(screen.getByDisplayValue("Escalate risky workflow changes.")).toBeTruthy();
    expect(screen.queryByLabelText("Prompt compile preview")).toBeNull();
  });

  it("switches to run history and selects a failed run", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    renderApp();

    await user.click(screen.getByRole("button", { name: "Select workflow Vendor Invoice Processing" }));
    await user.click(screen.getByRole("button", { name: "Run workflow" }));
    await user.click(screen.getByRole("button", { name: /run-2026-05-15-b/ }));
    await user.selectOptions(screen.getByLabelText("Trace filter"), "critical");
    await user.click(screen.getByText("Trace"));
    await user.click(screen.getByText("Raw"));
    await user.click(screen.getByRole("button", { name: "Copy raw" }));
    const runPanel = screen.getByLabelText("Execution history");
    const exportLink = screen.getByRole("link", { name: "Export raw" });

    expect(screen.getAllByText("run-2026-05-15-b")).toHaveLength(2);
    expect(within(runPanel).getByText("Generate patch plan")).toBeTruthy();
    expect(within(runPanel).queryByText("Collect artifacts")).toBeNull();
    expect(screen.getByText("Critical")).toBeTruthy();
    expect(screen.getByText("Heuristic trace enrichment over repair-loop failures")).toBeTruthy();
    expect(
      screen.getByText("Previous validation history may be too large for the prompt")
    ).toBeTruthy();
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        '"methodology": "Heuristic trace enrichment over repair-loop failures"'
      )
    );
    expect(exportLink.getAttribute("download")).toBe(
      "run-2026-05-15-b-generate-patch-plan-trace.json"
    );
    expect(screen.getAllByText("Failed").length).toBeGreaterThan(1);
  });

  it("creates a workflow run from an operator request prompt", async () => {
    const { user } = await renderBuilder();

    await user.click(screen.getByRole("button", { name: "Run test" }));

    expect(screen.getByRole("region", { name: "Execution history" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run workflow" })).toHaveProperty("disabled", true);

    await user.type(
      screen.getByRole("textbox", { name: "Operator request" }),
      "Review whether the refund request should be approved."
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Context payload" }), {
      target: { value: '{"ticket":"OPS-42"}' },
    });
    await user.click(screen.getByRole("button", { name: "Run workflow" }));

    expect(screen.getAllByText("run-intake-to-decision-002").length).toBeGreaterThan(1);
    expect(screen.getByLabelText("Selected run request").textContent).toContain(
      "Review whether the refund request should be approved."
    );
    expect(screen.getByLabelText("Selected run request").textContent).toContain(
      '{"ticket":"OPS-42"}'
    );
    expect(screen.getByRole("button", { name: "Open Ingest request" })).toBeTruthy();
  });

  it("returns to graph mode when a node is selected from another mode", async () => {
    const { user } = await renderBuilder();

    await user.click(screen.getByRole("button", { name: "Runs" }));
    await user.click(screen.getByRole("button", { name: "Open Route policy" }));

    expect(screen.getByLabelText("Node inspector")).toBeTruthy();
    expect(screen.getByDisplayValue("Route policy")).toBeTruthy();
  });
});
