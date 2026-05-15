import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "../App";

afterEach(() => {
  cleanup();
});

const renderApp = () => render(<App />);

describe("App", () => {
  it("renders the graph workbench with nodes, metrics, and compiled output", () => {
    renderApp();

    expect(screen.getByRole("heading", { name: "Workflow Operations" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Select Validate input" })).toBeTruthy();
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

    expect(screen.getByRole("button", { name: "Select Review contract" })).toBeTruthy();
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

    expect(screen.getByRole("button", { name: "Select Agent step 5" })).toBeTruthy();
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

    expect(screen.getAllByText("run-2026-05-15-b")).toHaveLength(2);
    expect(screen.getByText("Generate patch plan")).toBeTruthy();
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
