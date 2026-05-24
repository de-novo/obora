import type { WorkflowLocator, WorkflowRunSummary } from "@obora/sdk";
import { describe, expect, it } from "vitest";

import { appendChatMessage, createChatMessage, createInitialChatState } from "../state.js";
import { renderChatView } from "../view.js";
import { stripAnsi } from "./ansi-test-utils.js";
import type { ChatSessionStatus } from "../types.js";

const locator: WorkflowLocator = {
  id: "project:abc",
  scope: "project",
  name: "release-readiness",
  path: "/repo/.obora/workflows/release-readiness.yaml",
  displayPath: ".obora/workflows/release-readiness.yaml",
  editable: true,
  sourceDir: "/repo/.obora/workflows",
  stepCount: 4,
  projectRoot: "/repo",
};

const renderedText = (lines: ReadonlyArray<string>): string => lines.join("\n");

const runSummary: WorkflowRunSummary = {
  executionId: "exec-chat-1",
  workflowName: "release-readiness",
  status: "completed",
  startedAt: "2026-05-21T00:00:00.000Z",
  endedAt: "2026-05-21T00:00:02.000Z",
  durationMs: 2000,
  completedStepCount: 2,
  totalStepCount: 2,
  message: "Workflow completed: 2/2 steps completed.",
  steps: [
    {
      name: "collect",
      status: "completed",
      agent: "researcher",
      model: "openrouter/owl-alpha",
      outputPreview: "Collected release notes.",
      outputFormat: "text",
      toolsUsed: ["file_read", "file_write"],
      artifacts: ["release-notes.md"],
      task: "Collect release notes",
      methodology: "Standard agent execution",
      rationale: "The notes are the requested artifact.",
      decisions: ["Use release notes"],
      issues: [],
      dependencies: [],
    },
    {
      name: "handoff",
      status: "completed",
      agent: "dispatcher",
      model: "openrouter/owl-alpha",
      outputPreview: "Ready to publish.",
      outputFormat: "text",
      toolsUsed: [],
      artifacts: [],
      decisions: [],
      issues: [],
      dependencies: ["collect"],
    },
  ],
};

describe("renderChatView", () => {
  it("renders a modern keyboard-first workflow chat console for wide terminals", () => {
    const state = appendChatMessage(
      {
        ...createInitialChatState({
          sessionId: "session-a",
          cwd: "/repo",
          dryRun: true,
          providerName: "openrouter",
          modelName: "openrouter/owl-alpha",
          workflowTarget: "release-readiness",
        }),
        workflowLocator: locator,
        status: "ready",
        lastRunCommand: "obora run .obora/workflows/release-readiness.yaml",
        lastRunSummary: runSummary,
      },
      {
        ...createChatMessage(
          "assistant",
          "Workflow completed: 2/2 steps completed. > collect, handoff",
          () => new Date("2026-05-20T01:02:03Z")
        ),
        runSummary,
      }
    );

    const output = renderedText(
      renderChatView(state, {
        columns: 120,
        rendererLabel: "@earendil-works/pi-tui differential rendering",
      })
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("obora workflow chat");
    expect(plain).toContain("conversation");
    expect(plain).toContain("session");
    expect(plain).toContain("workflow");
    expect(plain).toContain("openrouter/owl-alpha");
    expect(plain).toContain("Workflow completed: 2/2 steps completed.");
    expect(plain).toContain("details /details exec-chat-1");
    expect(plain).toContain("last result completed 2/2");
    expect(plain).toContain("collect completed");
    expect(plain).toContain("file_read, file_write");
    expect(plain).toContain("release-notes.md");
    expect(plain).toContain("steps 4");
    expect(output).not.toContain("+---");
  });

  it("falls back to a stacked layout for narrow terminals", () => {
    const output = renderedText(
      renderChatView(
        createInitialChatState({
          sessionId: "session-a",
          cwd: "/repo",
          dryRun: false,
        }),
        { columns: 80, rendererLabel: "plain text fallback" }
      )
    );

    const plain = stripAnsi(output);
    expect(plain).toContain("session");
    expect(plain).toContain("› Select /workflow <name> first");
    expect(plain).toContain("/workflows");
    expect(plain).toContain("/details <runId>");
    expect(plain).toContain("plain text fallback");
    expect(plain.split("\n").every((line) => line.length <= 80)).toBe(true);
  });

  it("renders unresolved workflow targets, assistant messages, and clamped narrow widths", () => {
    const state = appendChatMessage(
      {
        ...createInitialChatState({
          sessionId: "session-b",
          cwd: "/repo/packages/cli/src/chat/with/a/very/long/project/path",
          dryRun: false,
          workflowTarget: "review-flow",
        }),
        status: "running",
      },
      createChatMessage(
        "assistant",
        "Working through the selected workflow.",
        () => new Date("2026-05-20T02:03:04Z")
      )
    );

    const output = renderedText(renderChatView(state, { columns: 20 }));
    const plain = stripAnsi(output);

    expect(plain).toContain("running");
    expect(plain).toContain("review-flow (unresolved)");
    expect(plain).toContain("obora");
    expect(plain).toContain("Working through the selected workflow.");
    expect(plain.split("\n").every((line) => line.length <= 78)).toBe(true);
  });

  it("renders failed run details with missing model, duration, issues, and errors", () => {
    const failedSummary: WorkflowRunSummary = {
      executionId: "exec-failed",
      workflowName: "release-readiness",
      status: "failed",
      startedAt: "2026-05-21T00:00:00.000Z",
      completedStepCount: 0,
      totalStepCount: 1,
      message: "Workflow failed: 0/1 steps completed.",
      error: "Provider returned error",
      steps: [
        {
          name: "collect",
          status: "missing",
          outputPreview: "No output recorded.",
          outputFormat: "none",
          toolsUsed: [],
          artifacts: [],
          decisions: [],
          issues: ["Provider returned error"],
          dependencies: [],
        },
      ],
    };
    const output = renderedText(
      renderChatView(
        {
          ...createInitialChatState({
            sessionId: "session-failed",
            cwd: "/repo",
            dryRun: false,
          }),
          status: "failed",
          workflowLocator: locator,
          lastRunSummary: failedSummary,
          lastError: "Provider returned error",
        },
        { columns: 120 }
      )
    );

    const plain = stripAnsi(output);
    expect(plain).toContain("Workflow failed: 0/1 steps completed.");
    expect(plain).toContain("duration -");
    expect(plain).toContain("error Provider returned error");
    expect(plain).toContain("collect missing");
    expect(plain).toContain("issues Provider returned error");
  });

  it.each([
    ["resolving", "resolving"],
    ["completed", "done"],
  ] as ReadonlyArray<readonly [ChatSessionStatus, string]>)(
    "renders %s status",
    (status, label) => {
      const output = renderedText(
        renderChatView(
          {
            ...createInitialChatState({
              sessionId: `session-${status}`,
              cwd: "/repo",
              dryRun: true,
            }),
            status,
            workflowLocator: { ...locator, editable: false },
          },
          { columns: 160 }
        )
      );
      const plain = stripAnsi(output);

      expect(plain).toContain(label);
      expect(plain).toContain("editable no");
    }
  );
});
