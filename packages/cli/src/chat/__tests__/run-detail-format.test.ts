import { describe, expect, it } from "vitest";

import { formatChatRunDetail } from "../run-detail-format.js";
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
});
