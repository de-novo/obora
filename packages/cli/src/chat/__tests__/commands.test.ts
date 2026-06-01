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

const runSummaryWithChanges: WorkflowRunSummary = {
  ...runSummary,
  repositoryChanges: {
    root: "/repo",
    files: [{ status: "M", path: "README.md", diffPreview: ["-old", "+new"] }],
    summary: "1 file changed: modified README.md",
  },
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
    expect(chatHelp).toContain("  /retry status - shows what /retry will rerun");
    expect(chatHelp).toContain(
      "  /workflow next, /workflow prev, or /workflow open - moves or opens the selected workflow choice"
    );
    expect(chatHelp).toContain(
      "  /retry 1 or /retry <executionId> - reruns a retryable run from history"
    );
    expect(chatHelp).toContain(
      "  /details next, /details prev, /details open, or /retry open - moves, opens, or retries the selected run choice"
    );
    expect(chatHelp).toContain(
      "  /details 1 or /details <executionId> - shows latest or selected step results"
    );
    expect(chatHelp).toContain(
      "  /diff 1, /diff next, /diff prev, /diff open, or /diff all - focuses or opens changed file diffs from run details"
    );
    expect(chatHelp).toContain(
      "  /runs --session 1 or /runs --session <id> - lists persisted runs for one session"
    );
    expect(chatHelp).toContain("  /runs failed, /runs --project [path]");
    expect(chatHelp).toContain("/runs --status <queued|running|waiting|suspended|completed|failed|aborted>");
    expect(chatHelp).toContain("  /sessions here or /sessions [tag]");
    expect(chatHelp).toContain(
      "  /session rename 1 or /session rename <id> <new-id> - renames a session"
    );
    expect(chatHelp).toContain(
      "  /session next, /session prev, or /session open - moves or opens the selected session choice"
    );
    expect(chatHelp).toContain(
      "  /session delete 1 or /session delete <id> - deletes a session"
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
    ).toEqual([
      "Enter open  Tab next  Esc close  Ctrl+R retry",
      "/clear  /details 1  /retry 1  /details <runId>",
      "/runs  /session  /project  /help",
    ]);
    expect(
      chatPromptCommandRows({
        ...state,
        inspectedRunSummary: runSummaryWithChanges,
        runChoices: [{ runSummary: runSummaryWithChanges, sessionId: "session-a" }],
      })
    ).toEqual([
      "Enter run  o open diff  Left/Right diff  Esc close  Ctrl+R retry",
      "/clear  /diff open  /diff all  /diff next  /retry 1",
      "/runs  /session  /project  /help",
    ]);
    expect(
      chatPromptCommandRows({
        ...state,
        runChoices: [{ runSummary, sessionId: "session-a" }],
      })
    ).toEqual([
      "Enter open  Tab next  Esc close  Ctrl+R retry",
      "/details open  /details next  /details prev  /retry open",
      "/details 1  /retry 1  /details <runId>",
      "/runs --project  /runs --tag <tag>  /runs failed",
    ]);
    expect(
      chatPromptCommandRows({
        ...state,
        sessionChoices: [
          {
            sessionId: "session-a",
            status: "ready",
            cwd: "/repo",
            tags: [],
            messageCount: 1,
            updatedAt: "2026-05-24T00:00:00.000Z",
          },
        ],
      })
    ).toEqual([
      "Enter open  Tab next  Esc close",
      "/session open  /session next  /session prev",
      "/session 1  /session <id>  /session rename 1 <id>",
      "/session delete 1  /sessions here  /clear",
    ]);
    expect(
      chatPromptCommandRows({
        ...state,
        workflowChoices: [
          {
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
        ],
      })
    ).toEqual([
      "Enter open  Tab next  Esc close",
      "/workflow open  /workflow next  /workflow prev",
      "/workflow 1  /workflow <name>  /run #1 <task>",
      "/workflows [scope]  /project  /clear",
    ]);
  });

  it("keeps run detail clear aliases centralized", () => {
    expect(isClearRunDetailsCommand("/clear")).toBe(true);
    expect(isClearRunDetailsCommand("/details clear")).toBe(true);
    expect(isClearRunDetailsCommand("/details exec-1")).toBe(false);
  });
});
