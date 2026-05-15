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
    await user.selectOptions(screen.getByLabelText("State"), "blocked");

    expect(screen.getByRole("button", { name: "Select Review contract" })).toBeTruthy();
    expect(screen.getByLabelText("Compiled workflow").textContent).toContain(
      'title: "Review contract"'
    );
    expect(screen.getByLabelText("Compiled workflow").textContent).toContain('kind: "decision"');
    expect(screen.getByLabelText("Compiled workflow").textContent).toContain('status: "blocked"');
  });

  it("adds a graph node and selects it", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Add step" }));

    expect(screen.getByRole("button", { name: "Select Agent step 5" })).toBeTruthy();
    expect(screen.getByDisplayValue("Agent step 5")).toBeTruthy();
    expect(screen.getByLabelText("Compiled workflow").textContent).toContain('id: "agent-step-5"');
  });

  it("edits the system prompt surface", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Prompt" }));
    await user.clear(screen.getByLabelText("Prompt"));
    await user.type(screen.getByLabelText("Prompt"), "Escalate risky workflow changes.");

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
