import { describe, expect, it } from "vitest";
import type { WorkflowRunSummary } from "@obora/sdk";

import {
  chatCommandHelpSections,
  chatHelp,
  chatPromptCommandRows,
  isClearRunDetailsCommand,
} from "../commands.js";
import { createInitialChatState } from "../state.js";

const runSummary: WorkflowRunSummary = {
  executionId: "exec-chat-1",
  workflowName: "release-readiness",
  status: "completed",
  startedAt: "2026-05-21T00:00:00.000Z",
  endedAt: "2026-05-21T00:00:01.000Z",
  durationMs: 1000,
  completedStepCount: 1,
  totalStepCount: 1,
  message: "Workflow completed: 1/1 steps completed.",
  steps: [
    {
      name: "collect",
      status: "completed",
      outputPreview: "Collected release notes.",
      outputFormat: "text",
      toolsUsed: [],
      artifacts: [],
      decisions: [],
      issues: [],
      dependencies: [],
    },
  ],
};

describe("chat command metadata", () => {
  it("uses shared metadata for help and prompt hints", () => {
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    expect(chatHelp).toContain("Workflow:\n");
    expect(chatHelp).toContain("Run History:\n");
    expect(chatHelp).toContain("Details:\n");
    expect(chatHelp).toContain("Session:\n");
    expect(chatHelp).toContain("System:\n");
    expect(chatHelp).toContain("/workflow <name-or-path>");
    expect(chatHelp).toContain(
      "  /details [executionId-or-number] - shows latest or selected step results"
    );
    expect(chatHelp).toContain("  /clear or /details clear - closes the current panel");
    expect(chatCommandHelpSections.map((section) => section.title)).toEqual([
      "Workflow",
      "Run History",
      "Details",
      "Session",
      "System",
    ]);
    expect(chatPromptCommandRows(state)).toEqual([
      "/workflows  /workflow <name-or-path>  /project [path]",
      "/sessions  /tags  /help",
    ]);
    expect(chatPromptCommandRows({ ...state, showHelpPanel: true })).toEqual([
      "/clear  /workflow <name>  /runs",
      "/session  /project  /exit",
    ]);
    expect(
      chatPromptCommandRows({
        ...state,
        workflowLocator: {
          id: "project:release",
          scope: "project",
          name: "release-readiness",
          path: "/repo/.obora/workflows/release-readiness.yaml",
          displayPath: ".obora/workflows/release-readiness.yaml",
          editable: true,
          sourceDir: "/repo/.obora/workflows",
          stepCount: 1,
          projectRoot: "/repo",
        },
        lastRunSummary: runSummary,
      })
    ).toEqual([
      "/details  /retry  /run <task>  /runs",
      "/workflows  /session  /project  /help",
    ]);
    expect(
      chatPromptCommandRows({
        ...state,
        inspectedRunSummary: runSummary,
        runChoices: [{ runSummary, sessionId: "session-a" }],
      })
    ).toEqual(["/clear  1  /details <runId>", "/runs  /session  /project  /help"]);
  });

  it("keeps run detail clear aliases centralized", () => {
    expect(isClearRunDetailsCommand("/clear")).toBe(true);
    expect(isClearRunDetailsCommand("/details clear")).toBe(true);
    expect(isClearRunDetailsCommand("/details exec-1")).toBe(false);
  });
});
