import { PassThrough } from "node:stream";
import type { WorkflowLocator, WorkflowRunSummary } from "@obora/sdk";
import { describe, expect, it } from "vitest";

import { commandForChatTuiKey } from "../keymap.js";
import { installChatTuiKeybindings } from "../session.js";
import { createInitialChatState } from "../state.js";
import type { ChatSessionSummary } from "../store.js";
import type { ChatRunChoice } from "../types.js";

const workflowLocator: WorkflowLocator = {
  id: "project:release",
  scope: "project",
  name: "release-readiness",
  path: "/repo/.obora/workflows/release-readiness.yaml",
  displayPath: ".obora/workflows/release-readiness.yaml",
  editable: true,
  sourceDir: "/repo/.obora/workflows",
  stepCount: 1,
  projectRoot: "/repo",
};

const runSummary: WorkflowRunSummary = {
  executionId: "exec-chat-1",
  workflowName: "release-readiness",
  status: "completed",
  startedAt: "2026-05-26T00:00:00.000Z",
  completedStepCount: 0,
  totalStepCount: 0,
  message: "Workflow completed.",
  steps: [],
};

const runSummaryWithChanges: WorkflowRunSummary = {
  ...runSummary,
  repositoryChanges: {
    root: "/repo",
    files: [
      { status: "M", path: "README.md", diffPreview: ["-old", "+new"] },
      { status: "??", path: "src/generated.js", diffPreview: ["+generated"] },
    ],
    summary: "2 files changed",
  },
};

const runChoice: ChatRunChoice = {
  runSummary,
  sessionId: "session-a",
};

const sessionChoice: ChatSessionSummary = {
  sessionId: "session-a",
  status: "ready",
  cwd: "/repo",
  tags: [],
  messageCount: 1,
  updatedAt: "2026-05-26T00:00:00.000Z",
};

const baseState = createInitialChatState({
  sessionId: "session-a",
  cwd: "/repo",
  dryRun: true,
});

describe("commandForChatTuiKey", () => {
  it("maps arrow and enter keys for the active run picker first", () => {
    const state = {
      ...baseState,
      runChoices: [runChoice],
      sessionChoices: [sessionChoice],
      workflowChoices: [workflowLocator],
    };

    expect(commandForChatTuiKey(state, { name: "down" })).toBe("/details next");
    expect(commandForChatTuiKey(state, { name: "up" })).toBe("/details prev");
    expect(commandForChatTuiKey(state, { name: "tab" })).toBe("/details next");
    expect(commandForChatTuiKey(state, { name: "tab", shift: true })).toBe("/details prev");
    expect(commandForChatTuiKey(state, { name: "return" })).toBe("/details open");
    expect(commandForChatTuiKey(state, { name: "r", ctrl: true })).toBe("/retry open");
    expect(commandForChatTuiKey(state, { name: "escape" })).toBe("/clear");
  });

  it("maps keys for session and workflow pickers", () => {
    expect(
      commandForChatTuiKey({ ...baseState, sessionChoices: [sessionChoice] }, { name: "down" })
    ).toBe("/session next");
    expect(
      commandForChatTuiKey({ ...baseState, sessionChoices: [sessionChoice] }, { name: "enter" })
    ).toBe("/session open");
    expect(
      commandForChatTuiKey({ ...baseState, workflowChoices: [workflowLocator] }, { name: "up" })
    ).toBe("/workflow prev");
    expect(
      commandForChatTuiKey({ ...baseState, workflowChoices: [workflowLocator] }, { name: "return" })
    ).toBe("/workflow open");
    expect(
      commandForChatTuiKey({ ...baseState, workflowChoices: [workflowLocator] }, { value: "\r" })
    ).toBe("/workflow open");
  });

  it("ignores non-picker states and unrelated keys", () => {
    expect(commandForChatTuiKey(baseState, { name: "down" })).toBeUndefined();
    expect(commandForChatTuiKey(baseState, { name: "escape" })).toBeUndefined();
    expect(commandForChatTuiKey(baseState, { name: "r", ctrl: true })).toBeUndefined();
    expect(
      commandForChatTuiKey({ ...baseState, sessionChoices: [sessionChoice] }, { name: "x" })
    ).toBeUndefined();
  });

  it("maps panel shortcuts without requiring a picker", () => {
    expect(
      commandForChatTuiKey(
        { ...baseState, inspectedRunSummary: runSummary, lastRunTask: "ship release" },
        { name: "r", ctrl: true }
      )
    ).toBe("/retry");
    expect(
      commandForChatTuiKey({ ...baseState, inspectedRunSummary: runSummary }, { name: "escape" })
    ).toBe("/clear");
  });

  it("maps left and right keys to focused run diff navigation", () => {
    const state = {
      ...baseState,
      inspectedRunSummary: runSummaryWithChanges,
      runChoices: [{ ...runChoice, runSummary: runSummaryWithChanges }],
    };

    expect(commandForChatTuiKey(state, { name: "right" })).toBe("/diff next");
    expect(commandForChatTuiKey(state, { name: "left" })).toBe("/diff prev");
    expect(commandForChatTuiKey(state, { name: "o" })).toBe("/diff open");
    expect(commandForChatTuiKey({ ...baseState, inspectedRunSummary: runSummary }, { name: "right" }))
      .toBeUndefined();
    expect(commandForChatTuiKey({ ...baseState, inspectedRunSummary: runSummary }, { name: "o" }))
      .toBeUndefined();
  });

  it("runs mapped picker commands through the keybinding callback", () => {
    const commands: Array<string> = [];
    const input = new PassThrough() as PassThrough & {
      readonly isTTY?: boolean;
      readonly setRawMode?: (mode: boolean) => void;
    };
    Object.defineProperty(input, "isTTY", {
      configurable: true,
      value: true,
    });
    Object.defineProperty(input, "setRawMode", {
      configurable: true,
      value: () => undefined,
    });
    const uninstall = installChatTuiKeybindings({
      input,
      tui: {
        snapshot: () => ({ ...baseState, workflowChoices: [workflowLocator] }),
      },
      onCommand: (command) => {
        commands.push(command);
      },
    });

    input.emit("keypress", "", { name: "down" });
    input.emit("keypress", "\r", {});
    input.emit("keypress", "", { name: "x" });
    uninstall();
    input.emit("keypress", "", { name: "up" });

    expect(commands).toEqual(["/workflow next", "/workflow open"]);
  });
});
