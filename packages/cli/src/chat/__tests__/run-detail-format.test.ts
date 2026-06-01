import { describe, expect, it } from "vitest";

import {
  formatChatRunAuditBundle,
  formatChatRunDetail,
  formatChatRunDiffPreview,
} from "../run-detail-format.js";
import type { ChatRunDetail } from "../store.js";

const fullDetail: ChatRunDetail = {
  sessionId: "session-a",
  projectRoot: "/repo/source-project",
  messageId: "assistant:run",
  messageCreatedAt: "2026-05-24T00:00:01.000Z",
  workflowTarget: "release-readiness",
  runTask: "prepare release",
  runOptions: {
    provider: "openrouter",
    model: "openrouter/owl-alpha",
    config: "/repo/.obora/config.yaml",
    agents: "/repo/agents.yaml",
    policy: "/repo/policy.yaml",
    timeout: 2500,
  },
  runWorkflowLocator: {
    id: "project:release-readiness",
    scope: "project",
    name: "release-readiness",
    path: "/repo/.obora/workflows/release-readiness.yaml",
    displayPath: ".obora/workflows/release-readiness.yaml",
    editable: true,
    sourceDir: "/repo/.obora/workflows",
    stepCount: 1,
    projectRoot: "/repo/source-project",
  },
  runSummary: {
    executionId: "exec-123",
    workflowName: "release-readiness",
    status: "completed",
    startedAt: "2026-05-24T00:00:00.000Z",
    endedAt: "2026-05-24T00:00:01.000Z",
    durationMs: 1000,
    completedStepCount: 1,
    totalStepCount: 1,
    message: "Workflow completed: 1/1 steps completed.",
    repositoryChanges: {
      root: "/repo/source-project",
      files: [
        {
          status: "M",
          path: "README.md",
          additions: 3,
          deletions: 1,
          diffPreview: ["@@ -1,2 +1,4 @@", "-old line", "+new line"],
        },
      ],
      summary: "1 file changed: modified README.md (+3/-1)",
    },
    steps: [
      {
        name: "collect",
        status: "completed",
        agent: "developer",
        model: "openrouter/owl-alpha",
        task: "Collect context",
        outputPreview: "Collected repository context.",
        outputFormat: "text",
        methodology: "Inspect persisted session",
        rationale: "The release needs audit context.",
        toolsUsed: ["file_read"],
        artifacts: ["README.md"],
        decisions: ["Use saved chat run"],
        dependencies: ["bootstrap"],
        issues: ["none"],
      },
    ],
  },
};

describe("formatChatRunDetail", () => {
  it("renders run metadata and full step audit fields", () => {
    const text = formatChatRunDetail(fullDetail);

    expect(text).toContain("Run exec-123");
    expect(text).toContain("Session: session-a");
    expect(text).toContain("Project: /repo/source-project");
    expect(text).toContain("Task: prepare release");
    expect(text).toContain(
      "Run options: provider openrouter · model openrouter/owl-alpha · config /repo/.obora/config.yaml · agents /repo/agents.yaml · policy /repo/policy.yaml · timeout 2500ms"
    );
    expect(text).toContain("Workflow target: release-readiness");
    expect(text).toContain("Retry: release-readiness");
    expect(text).toContain("Workflow locator: release-readiness (.obora/workflows/release-readiness.yaml)");
    expect(text).toContain("Repository changes: 1 file changed: modified README.md (+3/-1)");
    expect(text).toContain("Repository root: /repo/source-project");
    expect(text).toContain("Repository diff preview:");
    expect(text).toContain("1. M README.md");
    expect(text).toContain("@@ -1,2 +1,4 @@");
    expect(text).toContain("-old line");
    expect(text).toContain("+new line");
    expect(text).toContain("Step details:");
    expect(text).toContain("1. collect [completed] agent=developer model=openrouter/owl-alpha");
    expect(text).toContain("task: Collect context");
    expect(text).toContain("output: Collected repository context.");
    expect(text).toContain("method: Inspect persisted session");
    expect(text).toContain("rationale: The release needs audit context.");
    expect(text).toContain("tools: file_read");
    expect(text).toContain("artifacts: README.md");
    expect(text).toContain("decisions: Use saved chat run");
    expect(text).toContain("dependencies: bootstrap");
    expect(text).toContain("issues: none");
  });

  it("formats repository diff previews as a standalone document", () => {
    const text = formatChatRunDiffPreview(fullDetail);

    expect(text).toContain("# Chat Run Diff Preview");
    expect(text).toContain("Execution: exec-123");
    expect(text).toContain("Session: session-a");
    expect(text).toContain("Project: /repo/source-project");
    expect(text).toContain("Repository root: /repo/source-project");
    expect(text).toContain("Summary: 1 file changed: modified README.md (+3/-1)");
    expect(text).toContain("```diff");
    expect(text).toContain("1. M README.md");
    expect(text).toContain("+new line");
  });

  it("formats an audit bundle with step outputs, tools, artifacts, and raw detail", () => {
    const text = formatChatRunAuditBundle(fullDetail);

    expect(text).toContain("# Chat Run Audit Bundle");
    expect(text).toContain("Execution: exec-123");
    expect(text).toContain("Session: session-a");
    expect(text).toContain("Task: prepare release");
    expect(text).toContain(
      "Run options: provider openrouter · model openrouter/owl-alpha · config /repo/.obora/config.yaml · agents /repo/agents.yaml · policy /repo/policy.yaml · timeout 2500ms"
    );
    expect(text).toContain("## Step Audit");
    expect(text).toContain("### 1. collect");
    expect(text).toContain("- Status: completed");
    expect(text).toContain("- Output: Collected repository context.");
    expect(text).toContain("- Tools: file_read");
    expect(text).toContain("- Artifacts: README.md");
    expect(text).toContain("- Decisions: Use saved chat run");
    expect(text).toContain("- Dependencies: bootstrap");
    expect(text).toContain("- Issues: none");
    expect(text).toContain("## Repository Changes");
    expect(text).toContain("1. M README.md");
    expect(text).toContain("## Raw Detail");
    expect(text).toContain('"executionId": "exec-123"');
  });

  it("formats an audit bundle for legacy runs without optional metadata", () => {
    const text = formatChatRunAuditBundle({
      sessionId: "legacy-session",
      messageId: "assistant:legacy",
      messageCreatedAt: "2026-05-24T00:00:01.000Z",
      runSummary: {
        executionId: "exec-legacy",
        workflowName: "legacy-workflow",
        status: "completed",
        startedAt: "2026-05-24T00:00:00.000Z",
        completedStepCount: 0,
        totalStepCount: 0,
        message: "Workflow completed: 0/0 steps completed.",
        steps: [],
      },
    });

    expect(text).toContain("# Chat Run Audit Bundle");
    expect(text).toContain("Retry: not available");
    expect(text).toContain("No steps recorded.");
    expect(text).toContain("## Raw Detail");
    expect(text).not.toContain("Project:");
    expect(text).not.toContain("Task:");
    expect(text).not.toContain("Run options:");
    expect(text).not.toContain("Repository Changes");
  });

  it("formats an audit bundle step with missing audit lists as none", () => {
    const text = formatChatRunAuditBundle({
      ...fullDetail,
      runSummary: {
        ...fullDetail.runSummary,
        steps: [
          {
            name: "minimal",
            status: "completed",
            outputPreview: "done",
            outputFormat: "text",
          },
        ],
      },
    });

    expect(text).toContain("### 1. minimal");
    expect(text).toContain("- Tools: None");
    expect(text).toContain("- Artifacts: None");
    expect(text).toContain("- Decisions: None");
    expect(text).toContain("- Dependencies: None");
    expect(text).toContain("- Issues: None");
    expect(text).not.toContain("- Agent:");
    expect(text).not.toContain("- Task:");
  });

  it("does not format a standalone diff document without repository changes", () => {
    expect(
      formatChatRunDiffPreview({
        ...fullDetail,
        runSummary: {
          ...fullDetail.runSummary,
          repositoryChanges: undefined,
        },
      })
    ).toBeUndefined();
  });

  it("formats standalone diff documents when a file has no diff preview", () => {
    const text = formatChatRunDiffPreview({
      ...fullDetail,
      runSummary: {
        ...fullDetail.runSummary,
        repositoryChanges: {
          root: "/repo/source-project",
          files: [{ status: "A", path: "notes.md" }],
          summary: "1 file changed: added notes.md",
        },
      },
    });

    expect(text).toContain("1. A notes.md");
    expect(text).toContain("No diff preview recorded.");
  });

  it("renders legacy non-retryable runs without optional metadata", () => {
    const text = formatChatRunDetail({
      sessionId: "legacy-session",
      messageId: "assistant:legacy",
      messageCreatedAt: "2026-05-24T00:00:01.000Z",
      runSummary: {
        executionId: "exec-legacy",
        workflowName: "legacy-workflow",
        status: "completed",
        startedAt: "2026-05-24T00:00:00.000Z",
        completedStepCount: 0,
        totalStepCount: 0,
        message: "Workflow completed: 0/0 steps completed.",
        steps: [],
      },
    });

    expect(text).toContain("Run exec-legacy");
    expect(text).toContain("Retry: not available");
    expect(text).toContain("Step details:");
    expect(text).toContain("No steps recorded.");
    expect(text).not.toContain("Project:");
    expect(text).not.toContain("Task:");
    expect(text).not.toContain("Run options:");
    expect(text).not.toContain("Workflow locator:");
  });

  it("renders repository changed files without a diff preview", () => {
    const text = formatChatRunDetail({
      ...fullDetail,
      runSummary: {
        ...fullDetail.runSummary,
        repositoryChanges: {
          root: "/repo/source-project",
          files: [{ status: "R", path: "old.md -> new.md" }],
          summary: "1 file changed: renamed old.md -> new.md",
        },
      },
    });

    expect(text).toContain("Repository diff preview:");
    expect(text).toContain("1. R old.md -> new.md");
    expect(text).toContain("No diff preview recorded.");
  });

  it("bounds long step audit fields for terminal output", () => {
    const longText = "x".repeat(220);
    const text = formatChatRunDetail({
      ...fullDetail,
      runSummary: {
        ...fullDetail.runSummary,
        steps: [
          {
            ...fullDetail.runSummary.steps[0],
            task: longText,
            outputPreview: longText,
            methodology: longText,
            rationale: longText,
            decisions: [longText],
            issues: [longText],
          },
        ],
      },
    });

    const bounded = `${"x".repeat(157)}...`;

    expect(text).toContain(`task: ${bounded}`);
    expect(text).toContain(`output: ${bounded}`);
    expect(text).toContain(`method: ${bounded}`);
    expect(text).toContain(`rationale: ${bounded}`);
    expect(text).toContain(`decisions: ${bounded}`);
    expect(text).toContain(`issues: ${bounded}`);
    expect(text).not.toContain(longText);
  });
});
