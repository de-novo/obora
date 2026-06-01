import type { WorkflowLocator, WorkflowRunSummary } from "@obora/sdk";
import { describe, expect, it } from "vitest";

import { formatChatSessionDetail } from "../session-detail-format.js";
import type { ChatMessage, ChatSessionState } from "../types.js";

const locator: WorkflowLocator = {
  id: "project:release-readiness",
  scope: "project",
  name: "release-readiness",
  path: "/repo/.obora/workflows/release-readiness.yaml",
  displayPath: ".obora/workflows/release-readiness.yaml",
  editable: true,
  sourceDir: "/repo/.obora/workflows",
  stepCount: 1,
  projectRoot: "/repo/source-project",
};

const runSummary: WorkflowRunSummary = {
  executionId: "exec-session",
  workflowName: "release-readiness",
  status: "completed",
  startedAt: "2026-05-24T00:00:00.000Z",
  endedAt: "2026-05-24T00:00:01.000Z",
  durationMs: 1000,
  completedStepCount: 1,
  totalStepCount: 1,
  message: "Workflow completed: 1/1 steps completed.",
  steps: [],
};

const message = (id: string, role: ChatMessage["role"], content: string): ChatMessage => ({
  id,
  role,
  content,
  createdAt: `2026-05-24T00:00:0${id}.000Z`,
});

describe("formatChatSessionDetail", () => {
  it("renders retry metadata and a bounded recent message preview", () => {
    const longMessage = "x".repeat(120);
    const state: ChatSessionState = {
      sessionId: "release-session",
      status: "ready",
      cwd: "/repo",
      projectRoot: "/repo/current-project",
      tags: ["release", "qa"],
      dryRun: false,
      providerName: "openrouter",
      modelName: "openrouter/owl-alpha",
      workflowLocator: locator,
      messages: [
        message("0", "user", "oldest hidden"),
        message("1", "assistant", "selected workflow"),
        message("2", "user", "prepare\nrelease\tcheck"),
        message("3", "assistant", "running workflow"),
        message("4", "user", longMessage),
        message("5", "assistant", "Workflow completed."),
      ],
      lastRunTask: "prepare release check",
      lastRunProjectRoot: "/repo/source-project",
      lastRunWorkflowLocator: locator,
      lastRunOptions: {
        provider: "openrouter",
        model: "openrouter/owl-alpha",
        timeout: 2500,
      },
      lastRunSummary: runSummary,
    };

    const detail = formatChatSessionDetail(state);

    expect(detail).toContain("Session release-session");
    expect(detail).toContain("Project: /repo/current-project");
    expect(detail).toContain("Tags: release, qa");
    expect(detail).toContain("Workflow: release-readiness (project)");
    expect(detail).toContain("Provider: openrouter");
    expect(detail).toContain("Model: openrouter/owl-alpha");
    expect(detail).toContain("Messages: 6");
    expect(detail).toContain("User turns: 3");
    expect(detail).toContain("Retry: release-readiness -> prepare release check");
    expect(detail).toContain("Retry command: obora run .obora/workflows/release-readiness.yaml");
    expect(detail).toContain("Retry project: /repo/source-project");
    expect(detail).toContain("Retry options: provider openrouter · model openrouter/owl-alpha · timeout 2500ms");
    expect(detail).toContain("Last result: completed 1/1");
    expect(detail).toContain("Details: /details exec-session");
    expect(detail).toContain("prepare release check");
    expect(detail).toContain(`${"x".repeat(93)}...`);
    expect(detail).not.toContain("oldest hidden");
    expect(detail).not.toContain(longMessage);
  });
});
