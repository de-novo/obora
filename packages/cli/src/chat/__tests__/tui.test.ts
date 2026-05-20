import type { WorkflowLocator } from "@obora/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { appendChatMessage, createChatMessage, createInitialChatState } from "../state.js";
import { ChatTuiController } from "../tui.js";
import { stripAnsi } from "./ansi-test-utils.js";

const originalStdoutIsTTY = process.stdout.isTTY;

const setStdoutTTY = (value: boolean): void => {
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value,
  });
};

const locator: WorkflowLocator = {
  id: "project:abc",
  scope: "project",
  name: "release-readiness",
  path: "/repo/.obora/workflows/release-readiness.yaml",
  displayPath: ".obora/workflows/release-readiness.yaml",
  editable: true,
  sourceDir: "/repo/.obora/workflows",
  stepCount: 1,
  projectRoot: "/repo",
};

describe("ChatTuiController", () => {
  afterEach(() => {
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: originalStdoutIsTTY,
    });
    vi.restoreAllMocks();
  });

  it("does not render when stdout is not a TTY", async () => {
    setStdoutTTY(false);
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const controller = new ChatTuiController(
      createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true })
    );

    await controller.start();
    await controller.stop();

    expect(write).not.toHaveBeenCalled();
  });

  it("renders selected workflow, messages, run command, and errors in TTY mode", async () => {
    setStdoutTTY(true);
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const base = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: false,
      workflowTarget: "release-readiness",
    });
    const state = appendChatMessage(
      {
        ...base,
        status: "failed",
        workflowLocator: locator,
        lastRunCommand: "obora run .obora/workflows/release-readiness.yaml",
        lastError: "boom",
      },
      createChatMessage("user", "ship it")
    );
    const controller = new ChatTuiController(state);

    await controller.start();
    await controller.stop();

    const output = write.mock.calls.map((call) => String(call[0])).join("");
    const plain = stripAnsi(output);
    expect(plain).toContain("obora workflow chat");
    expect(plain).toContain("mode live");
    expect(plain).toContain("Workflow release-readiness (project)");
    expect(plain).toContain("last run obora run .obora/workflows/release-readiness.yaml");
    expect(plain).toContain("error boom");
    expect(plain).toContain("conversation");
    expect(plain).toContain("workflow");
    expect(plain).toContain("@earendil-works/pi-tui differential rendering");
    expect(plain).toContain("you");
    expect(plain).toContain("ship it");
    expect(output).not.toContain("+---");
  });

  it("marks abort requested on SIGINT", async () => {
    setStdoutTTY(true);
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const controller = new ChatTuiController(
      createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true })
    );

    await controller.start();
    process.emit("SIGINT");

    expect(controller.isAbortRequested()).toBe(true);

    await controller.stop();
  });
});
