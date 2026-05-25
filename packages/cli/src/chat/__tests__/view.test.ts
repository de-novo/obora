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
        workflowChoices: [
          locator,
          {
            ...locator,
            id: "project:review",
            name: "code-review",
            displayPath: ".obora/workflows/code-review.yaml",
          },
        ],
        status: "ready",
        lastRunCommand: "obora run .obora/workflows/release-readiness.yaml",
        lastRunTask: "perform the release check",
        lastRunWorkflowLocator: locator,
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
    expect(plain).not.toContain("run details");
    expect(plain).not.toContain("id exec-chat-1");
    expect(plain).not.toContain("open /details exec-chat-1");
    expect(plain).not.toContain("viewing run exec-chat-1");
    expect(plain).toContain("last result completed 2/2");
    expect(plain).toContain("retry release-readiness -> perform the release check");
    expect(plain).toContain("#1 release-readiness");
    expect(plain).toContain("#2 code-review");
    expect(plain).toContain("collect, handoff");
    expect(plain).not.toContain("file_read, file_write");
    expect(plain).not.toContain("release-notes.md");
    expect(plain).not.toContain("why Use release notes");
    expect(plain).not.toContain("rationale The notes are the requested artifact.");
    expect(plain).not.toContain("depends collect");
    expect(plain).toContain("steps 4");
    expect(plain).toContain("› release-readiness ready · type task or /run");
    expect(plain).toContain("/details  /retry  /run <task>  /runs");
    expect(plain).toContain("/workflows  /session  /project  /help");
    expect(output).not.toContain("+---");
  });

  it("renders numbered chat session choices as a picker panel", () => {
    const output = renderedText(
      renderChatView(
        {
          ...createInitialChatState({
            sessionId: "session-a",
            cwd: "/repo",
            projectRoot: "/repo/project-a",
            dryRun: true,
          }),
          sessionChoices: [
            {
              sessionId: "session-a",
              status: "ready",
              cwd: "/repo",
              projectRoot: "/repo/project-a",
              tags: ["release"],
              workflowTarget: "release-readiness",
              lastRunTask: "perform the release check",
              lastRunWorkflowName: "release-readiness",
              messageCount: 5,
              updatedAt: "2026-05-24T10:11:12.000Z",
            },
            {
              sessionId: "session-b",
              status: "idle",
              cwd: "/repo",
              projectRoot: "/repo/project-b",
              tags: [],
              messageCount: 2,
              updatedAt: "2026-05-23T10:11:12.000Z",
            },
          ],
        },
        { columns: 120 }
      )
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("sessions");
    expect(plain).toContain("/session 1");
    expect(plain).toContain("/session rename 1 <id>");
    expect(plain).toContain("/session delete 1");
    expect(plain).toContain("/sessions here");
    expect(plain).toContain("close /clear");
    expect(plain).toContain("● #1 session-a ready release-readiness");
    expect(plain).toContain("○ #2 session-b idle no workflow");
    expect(plain).toContain("project /repo/project-a");
    expect(plain).toContain("tags release");
    expect(plain).toContain("retry release-readiness");
    expect(plain).toContain("retry none");
    expect(plain).toContain("updated 2026-05-24 10:11");
  });

  it("renders numbered workflow choices as a picker panel", () => {
    const output = renderedText(
      renderChatView(
        {
          ...createInitialChatState({
            sessionId: "session-a",
            cwd: "/repo",
            dryRun: true,
          }),
          workflowLocator: locator,
          workflowChoices: [
            {
              ...locator,
              description: "Release readiness workflow",
            },
            {
              ...locator,
              id: "global:review",
              scope: "global",
              name: "code-review",
              displayPath: "~/.obora/workflows/code-review.yaml",
              editable: false,
              stepCount: 2,
              description: "Review repository changes",
            },
          ],
        },
        { columns: 120 }
      )
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("workflows");
    expect(plain).toContain("/workflow 1");
    expect(plain).toContain("/run #1 <task>");
    expect(plain).toContain("/workflows [scope]");
    expect(plain).toContain("close /clear");
    expect(plain).toContain("● #1 release-readiness ready project steps 4");
    expect(plain).toContain("○ #2 code-review idle global steps 2");
    expect(plain).toContain("editable yes");
    expect(plain).toContain("editable no");
    expect(plain).toContain("about Release readiness");
    expect(plain).toContain("Review repository changes");
    expect(plain).toContain("› release-readiness ready · type task or /run");
    expect(plain).toContain("/run <task>  /runs  /workflows");
    expect(plain).toContain("/session  /project  /tags  /help");
  });

  it("renders numbered run choices as a history panel", () => {
    const output = renderedText(
      renderChatView(
        {
          ...createInitialChatState({
            sessionId: "session-a",
            cwd: "/repo",
            dryRun: false,
          }),
          inspectedRunSummary: runSummary,
          tags: ["release"],
          runChoices: [
            {
              runSummary,
              sessionId: "session-a",
              source: "session",
            },
            {
              runSummary: {
                ...runSummary,
                executionId: "exec-chat-2",
                workflowName: "code-review",
                completedStepCount: 1,
                totalStepCount: 2,
              },
              sessionId: "history-session",
              messageId: "assistant:run",
              source: "persisted",
            },
          ],
        },
        { columns: 120 }
      )
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("runs");
    expect(plain).toContain("select 1");
    expect(plain).toContain("/details <runId>");
    expect(plain).toContain("close /clear");
    expect(plain).toContain("/runs --project");
    expect(plain).toContain("/runs --tag release");
    expect(plain).toContain("/runs failed");
    expect(plain).toContain("● #1 exec-chat-1 completed release-readiness steps 2/2");
    expect(plain).toContain("○ #2 exec-chat-2 completed code-review steps 1/2");
    expect(plain).toContain("session session-a");
    expect(plain).toContain("session history-session");
    expect(plain).toContain("switch /session history-session");
    expect(plain).toContain("open /details exec-chat-1");
    expect(plain).toContain("viewing run exec-chat-1");
    expect(plain).toContain("/clear  1  /details <runId>");
    expect(plain).toContain("/runs  /session  /project  /help");
  });

  it("renders run choices without source sessions as current-session runs", () => {
    const output = renderedText(
      renderChatView(
        {
          ...createInitialChatState({
            sessionId: "session-a",
            cwd: "/repo",
            dryRun: false,
          }),
          runChoices: [
            {
              runSummary,
            },
          ],
        },
        { columns: 120 }
      )
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("session current");
    expect(plain).toContain("/details 1  /retry 1  /details <runId>");
    expect(plain).toContain("/runs --tag <tag>");
    expect(plain).not.toContain("switch /session");
  });

  it("renders run choices from the active source session as current-session runs", () => {
    const output = renderedText(
      renderChatView(
        {
          ...createInitialChatState({
            sessionId: "history-session",
            cwd: "/repo",
            dryRun: false,
          }),
          runChoices: [
            {
              runSummary,
              sessionId: "history-session",
              source: "persisted",
            },
          ],
        },
        { columns: 120 }
      )
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("session current");
    expect(plain).not.toContain("switch /session history-session");
  });

  it("renders legacy run details with missing optional step arrays", () => {
    const legacySummary = JSON.parse(
      JSON.stringify({
        ...runSummary,
        steps: [
          {
            name: "legacy",
            status: "completed",
            outputPreview: "legacy output",
            startedAt: "2026-05-21T00:00:00.000Z",
            endedAt: "2026-05-21T00:00:01.000Z",
          },
        ],
      })
    ) as WorkflowRunSummary;
    const output = renderedText(
      renderChatView(
        {
          ...createInitialChatState({
            sessionId: "session-a",
            cwd: "/repo",
            dryRun: false,
          }),
          inspectedRunSummary: legacySummary,
        },
        { columns: 120 }
      )
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("legacy output");
    expect(plain).toContain("run details");
  });

  it("prompts users to choose or run once when workflow choices exist", () => {
    const output = renderedText(
      renderChatView(
        {
          ...createInitialChatState({
            sessionId: "session-a",
            cwd: "/repo",
            dryRun: true,
          }),
          workflowChoices: [locator],
        },
        { columns: 120 }
      )
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("› Choose /workflow 1 or run once with /run #1 <task>");
    expect(plain).toContain("/workflow 1  /workflow <name>  /run #1 <task>");
    expect(plain).toContain("/workflows [scope]  /project  /clear");
  });

  it("renders grouped help as a dedicated panel", () => {
    const output = renderedText(
      renderChatView(
        {
          ...createInitialChatState({
            sessionId: "session-a",
            cwd: "/repo",
            dryRun: true,
          }),
          showHelpPanel: true,
        },
        { columns: 120 }
      )
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("help");
    expect(plain).toContain("Workflow");
    expect(plain).toContain("/workflow <name-or-path> selects a reusable workflow");
    expect(plain).toContain("Run History");
    expect(plain).toContain("/runs lists workflow runs in this chat");
    expect(plain).toContain("Details");
    expect(plain).toContain("/clear or /details clear closes the current panel");
    expect(plain).toContain("/clear  /workflow <name>  /runs");
  });

  it("renders the inspected run instead of the latest run", () => {
    const inspectedSummary: WorkflowRunSummary = {
      ...runSummary,
      executionId: "exec-inspected",
      workflowName: "code-review",
      message: "Workflow completed: 1/1 steps completed.",
      completedStepCount: 1,
      totalStepCount: 1,
      steps: [
        {
          name: "review",
          status: "completed",
          outputPreview: "Reviewed repository changes.",
          outputFormat: "text",
          toolsUsed: ["file_read"],
          artifacts: ["review.md"],
          methodology: "Direct repository inspection",
          decisions: ["Inspect changed files"],
          issues: [],
          dependencies: [],
        },
      ],
    };
    const output = renderedText(
      renderChatView(
        {
          ...createInitialChatState({
            sessionId: "session-a",
            cwd: "/repo",
            dryRun: false,
          }),
          lastRunSummary: runSummary,
          inspectedRunSummary: inspectedSummary,
          runChoices: [
            {
              runSummary: inspectedSummary,
              sessionId: "session-a",
              messageId: "assistant:inspected",
              source: "persisted",
              runTask: "summarize the current diff and explain risk",
              runWorkflowLocator: {
                ...locator,
                name: "code-review",
                displayPath: ".obora/workflows/code-review.yaml",
              },
            },
          ],
        },
        { columns: 120 }
      )
    );
    const plain = stripAnsi(output);

    expect(plain).toContain("id exec-inspected");
    expect(plain).toContain("workflow code-review");
    expect(plain).toContain("task summarize the current diff and explain risk");
    expect(plain).toContain("retry code-review");
    expect(plain).toContain("project /repo");
    expect(plain).toContain("path .obora/workflows/code-review.yaml");
    expect(plain).toContain("viewing run exec-inspected");
    expect(plain).toContain("viewing run exec-inspected  ·  /details exec-inspected");
    expect(plain).toContain("/clear  1  /details <runId>");
    expect(plain).toContain("#1 review completed");
    expect(plain).toContain("format text");
    expect(plain).toContain("method Direct repository inspection");
    expect(plain).toContain("artifacts review.md");
    expect(plain).not.toContain("id exec-chat-1");
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
    expect(plain).toContain("/workflow <name-or-path>");
    expect(plain).toContain("/project [path]");
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
          inspectedRunSummary: failedSummary,
          lastError: "Provider returned error",
        },
        { columns: 120 }
      )
    );

    const plain = stripAnsi(output);
    expect(plain).toContain("Workflow failed: 0/1 steps completed.");
    expect(plain).toContain("run details");
    expect(plain).toContain("id exec-failed");
    expect(plain).toContain("status failed");
    expect(plain).toContain("duration -");
    expect(plain).toContain("error Provider returned error");
    expect(plain).toContain("attention #1 collect missing");
    expect(plain).toContain("cause Provider returned error");
    expect(plain).toContain("hint No output recorded.");
    expect(plain).toContain("next /retry after fixing inputs");
    expect(plain).toContain("#1 collect missing");
    expect(plain).toContain("issues Provider returned error");
  });

  it("renders run history retry availability", () => {
    const output = renderedText(
      renderChatView(
        {
          ...createInitialChatState({
            sessionId: "session-runs",
            cwd: "/repo",
            dryRun: true,
          }),
          runChoices: [
            {
              runSummary,
              sessionId: "session-runs",
              messageId: "assistant:run",
              source: "persisted",
              runTask: "perform the release check",
              runWorkflowLocator: locator,
            },
            {
              runSummary: {
                ...runSummary,
                executionId: "exec-chat-2",
                workflowName: "code-review",
              },
              sessionId: "session-other",
              messageId: "assistant:other",
              source: "persisted",
            },
          ],
        },
        { columns: 140 }
      )
    );

    const plain = stripAnsi(output);
    expect(plain).toContain("runs");
    expect(plain).toContain("#1 exec-chat-1 completed release-readiness");
    expect(plain).toContain("task perform the release check");
    expect(plain).toContain("retry release-readiness");
    expect(plain).toContain("#2 exec-chat-2 completed code-review");
    expect(plain).toContain("task -");
    expect(plain).toContain("retry none");
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
