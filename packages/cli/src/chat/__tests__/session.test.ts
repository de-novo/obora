import { buildWorkflowRunSummary } from "@obora/sdk";
import type { RuntimeExecution, WorkflowLocator } from "@obora/sdk";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import { createInitialChatState } from "../state.js";
import { handleChatInput, runChatSession } from "../session.js";
import { saveChatSessionState } from "../store.js";
import { chatRunChoicesFromSummaries } from "../run-choices.js";

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

const codeReviewLocator: WorkflowLocator = {
  id: "project:review",
  scope: "project",
  name: "code-review",
  path: "/repo/.obora/workflows/code-review.yaml",
  displayPath: ".obora/workflows/code-review.yaml",
  editable: true,
  sourceDir: "/repo/.obora/workflows",
  stepCount: 2,
  projectRoot: "/repo",
};

const createStream = (isTTY: boolean): PassThrough & { readonly isTTY?: boolean } => {
  const stream = new PassThrough() as PassThrough & { readonly isTTY?: boolean };
  Object.defineProperty(stream, "isTTY", {
    configurable: true,
    value: isTTY,
  });
  return stream;
};

const runWorkflow = vi.fn(
  async (_workflow: string, _options: Record<string, unknown>) => undefined
);
const resolveWorkflow = vi.fn(async (target: string) =>
  target === "code-review" ? codeReviewLocator : locator
);

const executionResult: RuntimeExecution = {
  id: "exec-chat-1",
  workflowName: "release-readiness",
  status: "completed",
  input: { message: "perform the release check" },
  startedAt: new Date("2026-05-21T00:00:00.000Z"),
  endedAt: new Date("2026-05-21T00:00:02.000Z"),
  stepOrder: ["collect", "handoff"],
  completedSteps: ["collect", "handoff"],
  outputs: {
    collect: "Collected release notes.",
    handoff: "Ready to publish.",
  },
  traces: {
    collect: {
      step: "collect",
      agent: "researcher",
      timestamp: "2026-05-21T00:00:00.000Z",
      version: "1.0",
      task_summary: "Collect release notes",
      methodology: "Standard agent execution",
      tools_used: ["file_read"],
      key_decisions: ["Use release notes"],
      decision_rationale: "The notes are the requested artifact.",
      alternatives_considered: [],
      assumptions: [],
      constraints: [],
      risks_identified: [],
      inputs_processed: [],
      dependencies_used: [],
      output_summary: "Collected release notes.",
      output_format: "text",
      artifacts_created: ["release-notes.md"],
      issues_encountered: [],
      workarounds_applied: [],
      confidence_level: "high",
      known_limitations: [],
      implications_for_next: [],
      recommended_next: [],
      open_questions: [],
      context_for_successors: "Step 'collect' completed by researcher.",
    },
  },
  stepRecords: {
    collect: { raw: { model: "openrouter/owl-alpha" } },
    handoff: { raw: { model: "openrouter/owl-alpha" } },
  },
};

describe("chat session", () => {
  it("handles help, workflow selection, and chat run turns", async () => {
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const help = await handleChatInput({
      input: "/help",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });
    expect(help.state.showHelpPanel).toBe(true);
    expect(help.state.messages.at(-1)?.content).toBe("Opened help panel.");

    const selected = await handleChatInput({
      input: "/workflow release-readiness",
      state: help.state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });
    expect(selected.state.workflowLocator).toBe(locator);

    const ran = await handleChatInput({
      input: "summarize this project",
      state: selected.state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true, model: "openrouter/owl-alpha" },
    });

    expect(runWorkflow).toHaveBeenCalledWith(
      locator.path,
      expect.objectContaining({
        dryRun: true,
        quiet: true,
        model: "openrouter/owl-alpha",
        input: expect.stringContaining("summarize this project"),
      })
    );
    expect(ran.state.status).toBe("ready");
    expect(ran.state.messages.at(-1)?.content).toContain("Dry-run completed");
  });

  it("opens help as the active panel and clears stale panel context", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      inspectedRunSummary: runSummary,
      runChoices: [
        {
          runSummary,
          sessionId: "session-a",
          messageId: "assistant:run",
          source: "persisted" as const,
        },
      ],
      workflowChoices: [locator],
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["ops"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
    };

    const help = await handleChatInput({
      input: "/help",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(help.state.showHelpPanel).toBe(true);
    expect(help.state.inspectedRunSummary).toBeUndefined();
    expect(help.state.runChoices).toBeUndefined();
    expect(help.state.workflowChoices).toBeUndefined();
    expect(help.state.sessionChoices).toBeUndefined();
    expect(help.state.messages.at(-1)?.content).toBe("Opened help panel.");
  });

  it("handles exit commands", async () => {
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/quit",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(result.exit).toBe(true);
    expect(result.state.status).toBe("completed");
    expect(result.state.messages.at(-1)?.content).toContain("closed");
  });

  it("ignores empty input turns", async () => {
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "   ",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(result).toEqual({ state, exit: false });
  });

  it("passes live run options for explicit /run commands", async () => {
    vi.clearAllMocks();
    const selected = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: false,
      }),
      workflowLocator: locator,
      status: "ready" as const,
    };

    const result = await handleChatInput({
      input: "/run perform the release check",
      state: selected,
      resolveWorkflow,
      runWorkflow,
      commandOptions: {
        provider: "openrouter",
        model: "openrouter/owl-alpha",
        config: "/repo/.obora/config.yaml",
        agents: "/repo/agents.yaml",
        policy: "/repo/policy.yaml",
        timeout: "2500",
      },
    });

    expect(runWorkflow).toHaveBeenCalledWith(
      locator.path,
      expect.objectContaining({
        dryRun: false,
        quiet: true,
        provider: "openrouter",
        model: "openrouter/owl-alpha",
        config: "/repo/.obora/config.yaml",
        agents: "/repo/agents.yaml",
        policy: "/repo/policy.yaml",
        timeout: 2500,
        input: expect.stringContaining("perform the release check"),
      })
    );
    expect(result.state.lastRunTask).toBe("perform the release check");
    expect(result.state.lastRunWorkflowLocator).toBe(locator);
    expect(result.state.messages.at(-1)?.content).toContain("Workflow run completed");
  });

  it("stores run option metadata and reuses it for retry", async () => {
    vi.clearAllMocks();
    const selected = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: false,
      }),
      workflowLocator: locator,
      status: "ready" as const,
    };
    const ran = await handleChatInput({
      input: "/run perform the release check",
      state: selected,
      resolveWorkflow,
      runWorkflow,
      commandOptions: {
        provider: "openrouter",
        model: "openrouter/owl-alpha",
        config: "/repo/.obora/config.yaml",
        agents: "/repo/agents.yaml",
        policy: "/repo/policy.yaml",
        timeout: "2500",
      },
    });

    expect(ran.state.messages.at(-1)).toMatchObject({
      runOptions: {
        provider: "openrouter",
        model: "openrouter/owl-alpha",
        config: "/repo/.obora/config.yaml",
        agents: "/repo/agents.yaml",
        policy: "/repo/policy.yaml",
        timeout: 2500,
      },
    });

    vi.clearAllMocks();
    await handleChatInput({
      input: "/retry",
      state: ran.state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(runWorkflow).toHaveBeenCalledWith(
      locator.path,
      expect.objectContaining({
        dryRun: true,
        provider: "openrouter",
        model: "openrouter/owl-alpha",
        config: "/repo/.obora/config.yaml",
        agents: "/repo/agents.yaml",
        policy: "/repo/policy.yaml",
        timeout: 2500,
        input: expect.stringContaining("perform the release check"),
      })
    );
  });

  it("retries the last chat task with the original workflow", async () => {
    vi.clearAllMocks();
    const selected = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      workflowLocator: codeReviewLocator,
      lastRunTask: "perform the release check",
      lastRunWorkflowLocator: locator,
      status: "failed" as const,
    };

    const result = await handleChatInput({
      input: "/retry",
      state: selected,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(runWorkflow).toHaveBeenCalledWith(
      locator.path,
      expect.objectContaining({
        input: expect.stringContaining("perform the release check"),
      })
    );
    expect(result.state.lastRunTask).toBe("perform the release check");
    expect(result.state.lastRunWorkflowLocator).toBe(locator);
    expect(result.state.messages.at(-2)?.content).toBe("perform the release check");
    expect(result.state.messages.at(-1)?.content).toContain("Dry-run completed");
  });

  it("retries old metadata by resolving the last run workflow name", async () => {
    vi.clearAllMocks();
    const runSummary = buildWorkflowRunSummary(executionResult);
    const selected = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        projectRoot: "/repo/project-a",
        dryRun: true,
      }),
      workflowLocator: codeReviewLocator,
      lastRunTask: "perform the release check",
      lastRunSummary: runSummary,
      status: "ready" as const,
    };

    const result = await handleChatInput({
      input: "/retry",
      state: selected,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(resolveWorkflow).toHaveBeenCalledWith("release-readiness", "/repo/project-a");
    expect(runWorkflow).toHaveBeenCalledWith(
      locator.path,
      expect.objectContaining({
        input: expect.stringContaining("perform the release check"),
      })
    );
    expect(result.state.lastRunWorkflowLocator).toBe(locator);
  });

  it("shows the current retry target without running it", async () => {
    vi.clearAllMocks();
    const selected = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      workflowLocator: codeReviewLocator,
      lastRunTask: "perform the release check",
      lastRunWorkflowLocator: locator,
      lastRunOptions: {
        provider: "openrouter",
        model: "openrouter/owl-alpha",
        config: "/repo/.obora/config.yaml",
        agents: "/repo/agents.yaml",
        policy: "/repo/policy.yaml",
        timeout: 2500,
      },
      status: "ready" as const,
    };

    const result = await handleChatInput({
      input: "/retry status",
      state: selected,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(runWorkflow).not.toHaveBeenCalled();
    expect(result.state.messages.at(-1)?.content).toContain("Retry target:");
    expect(result.state.messages.at(-1)?.content).toContain("Workflow: release-readiness (project)");
    expect(result.state.messages.at(-1)?.content).toContain("Task: perform the release check");
    expect(result.state.messages.at(-1)?.content).toContain(
      "Path: .obora/workflows/release-readiness.yaml"
    );
    expect(result.state.messages.at(-1)?.content).toContain(
      "Options: provider openrouter · model openrouter/owl-alpha · timeout 2500ms · files+3"
    );
    expect(result.state.messages.at(-1)?.content).toContain("Run /retry to execute it again.");
  });

  it("shows retry status for old run metadata without a resolved locator", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const selected = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        projectRoot: "/repo/current-project",
        dryRun: true,
      }),
      lastRunTask: "perform the release check",
      lastRunProjectRoot: "/repo/source-project",
      lastRunSummary: runSummary,
      status: "ready" as const,
    };

    const result = await handleChatInput({
      input: "/retry status",
      state: selected,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(runWorkflow).not.toHaveBeenCalled();
    expect(result.state.messages.at(-1)?.content).toContain("Retry target:");
    expect(result.state.messages.at(-1)?.content).toContain(
      "Workflow: release-readiness (resolved on retry)"
    );
    expect(result.state.messages.at(-1)?.content).toContain(
      "Retry project: /repo/source-project"
    );
    expect(result.state.messages.at(-1)?.content).toContain("Task: perform the release check");
    expect(result.state.messages.at(-1)?.content).toContain(
      "Command: obora run release-readiness"
    );
    expect(result.state.messages.at(-1)?.content).toContain("Run /retry to execute it again.");
  });

  it("retries a run by number from the run history", async () => {
    vi.clearAllMocks();
    const runSummary = buildWorkflowRunSummary(executionResult);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      runChoices: [
        {
          runSummary,
          sessionId: "session-a",
          messageId: "assistant:run",
          source: "persisted",
          runTask: "perform the release check",
          runWorkflowLocator: locator,
        },
      ],
    };

    const result = await handleChatInput({
      input: "/retry 1",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(runWorkflow).toHaveBeenCalledWith(
      locator.path,
      expect.objectContaining({
        input: expect.stringContaining("perform the release check"),
      })
    );
    expect(result.state.lastRunTask).toBe("perform the release check");
    expect(result.state.lastRunWorkflowLocator).toBe(locator);
  });

  it("retries a persisted run by execution id", async () => {
    vi.clearAllMocks();
    const runSummary = buildWorkflowRunSummary(executionResult);
    const findRun = vi.fn(async () => ({
      sessionId: "session-a",
      messageId: "assistant:run",
      messageCreatedAt: "2026-05-21T00:00:02.000Z",
      runTask: "perform the release check",
      runWorkflowLocator: locator,
      runSummary,
    }));
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/retry exec-chat-1",
      state,
      resolveWorkflow,
      runWorkflow,
      findRun,
      commandOptions: { dryRun: true },
    });

    expect(findRun).toHaveBeenCalledWith("exec-chat-1");
    expect(runWorkflow).toHaveBeenCalledWith(
      locator.path,
      expect.objectContaining({
        input: expect.stringContaining("perform the release check"),
      })
    );
    expect(result.state.lastRunCommand).toBe("obora run .obora/workflows/release-readiness.yaml");
  });

  it("retries a persisted run without locator by resolving the workflow name", async () => {
    vi.clearAllMocks();
    const runSummary = buildWorkflowRunSummary(executionResult);
    const findRun = vi.fn(async () => ({
      sessionId: "session-a",
      messageId: "assistant:run",
      messageCreatedAt: "2026-05-21T00:00:02.000Z",
      runTask: "perform the release check",
      runSummary,
    }));
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      projectRoot: "/repo",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/retry exec-chat-1",
      state,
      resolveWorkflow,
      runWorkflow,
      findRun,
      commandOptions: { dryRun: true },
    });

    expect(resolveWorkflow).toHaveBeenCalledWith("release-readiness", "/repo");
    expect(runWorkflow).toHaveBeenCalledWith(
      locator.path,
      expect.objectContaining({
        input: expect.stringContaining("perform the release check"),
      })
    );
    expect(result.state.lastRunTask).toBe("perform the release check");
    expect(result.state.lastRunWorkflowLocator).toBe(locator);
  });

  it("retries a persisted run without locator from its source project", async () => {
    vi.clearAllMocks();
    const runSummary = buildWorkflowRunSummary(executionResult);
    const findRun = vi.fn(async () => ({
      sessionId: "source-session",
      projectRoot: "/repo/source-project",
      messageId: "assistant:run",
      messageCreatedAt: "2026-05-21T00:00:02.000Z",
      runTask: "perform the release check",
      runSummary,
    }));
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      projectRoot: "/repo/current-project",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/retry exec-chat-1",
      state,
      resolveWorkflow,
      runWorkflow,
      findRun,
      commandOptions: { dryRun: true },
    });

    expect(resolveWorkflow).toHaveBeenCalledWith("release-readiness", "/repo/source-project");
    expect(runWorkflow).toHaveBeenCalledWith(
      locator.path,
      expect.objectContaining({
        input: expect.stringContaining("perform the release check"),
      })
    );
    expect(result.state.projectRoot).toBe("/repo/current-project");
    expect(result.state.lastRunTask).toBe("perform the release check");
  });

  it("retries a numbered run choice without locator by resolving the workflow name", async () => {
    vi.clearAllMocks();
    const runSummary = buildWorkflowRunSummary(executionResult);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        projectRoot: "/repo",
        dryRun: true,
      }),
      runChoices: [
        {
          runSummary,
          sessionId: "session-a",
          projectRoot: "/repo/source-project",
          messageId: "assistant:run",
          source: "persisted",
          runTask: "perform the release check",
        },
      ],
    };

    const result = await handleChatInput({
      input: "/retry 1",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(resolveWorkflow).toHaveBeenCalledWith("release-readiness", "/repo/source-project");
    expect(runWorkflow).toHaveBeenCalledWith(
      locator.path,
      expect.objectContaining({
        input: expect.stringContaining("perform the release check"),
      })
    );
    expect(result.state.lastRunWorkflowLocator).toBe(locator);
  });

  it("reports workflow resolve failures when retrying old metadata without locator", async () => {
    vi.clearAllMocks();
    const runSummary = buildWorkflowRunSummary(executionResult);
    const failingResolveWorkflow = vi.fn(async () => {
      throw new Error("workflow missing");
    });
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        projectRoot: "/repo",
        dryRun: true,
      }),
      lastRunOptions: {
        provider: "openrouter",
        model: "openrouter/owl-alpha",
        timeout: 2500,
      },
      runChoices: [
        {
          runSummary,
          sessionId: "session-a",
          messageId: "assistant:run",
          source: "persisted",
          runTask: "perform the release check",
        },
      ],
    };

    const result = await handleChatInput({
      input: "/retry 1",
      state,
      resolveWorkflow: failingResolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(failingResolveWorkflow).toHaveBeenCalledWith("release-readiness", "/repo");
    expect(runWorkflow).not.toHaveBeenCalled();
    expect(result.state.status).toBe("failed");
    expect(result.state.lastRunOptions).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain(
      "Workflow resolve failed: workflow missing"
    );
  });

  it("does not retry a run without retry metadata", async () => {
    vi.clearAllMocks();
    const runSummary = buildWorkflowRunSummary(executionResult);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      runChoices: [
        {
          runSummary,
          sessionId: "session-a",
          messageId: "assistant:run",
          source: "persisted",
        },
      ],
    };

    const result = await handleChatInput({
      input: "/retry 1",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(runWorkflow).not.toHaveBeenCalled();
    expect(result.state.messages.at(-1)?.content).toContain("Run is not retryable: 1.");
  });

  it("keeps listed run choices when a numbered retry choice is missing", async () => {
    vi.clearAllMocks();
    const runSummary = buildWorkflowRunSummary(executionResult);
    const findRun = vi.fn(async () => undefined);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      runChoices: [
        {
          runSummary,
          sessionId: "session-a",
          messageId: "assistant:run",
          source: "persisted",
          runTask: "perform the release check",
          runWorkflowLocator: locator,
        },
      ],
    };

    const result = await handleChatInput({
      input: "/retry 2",
      state,
      resolveWorkflow,
      runWorkflow,
      findRun,
      commandOptions: { dryRun: true },
    });

    expect(findRun).not.toHaveBeenCalled();
    expect(runWorkflow).not.toHaveBeenCalled();
    expect(result.state.runChoices?.map((choice) => choice.runSummary.executionId)).toEqual([
      "exec-chat-1",
    ]);
    expect(result.state.messages.at(-1)?.content).toContain("Run choice not found.");
  });

  it("explains retry when no previous chat task exists", async () => {
    vi.clearAllMocks();
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/retry",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(runWorkflow).not.toHaveBeenCalled();
    expect(result.state.messages.at(-1)?.content).toBe(
      "Nothing to retry yet. Run a workflow task first with /run <task>."
    );
  });

  it("explains retry status when no retry target exists", async () => {
    vi.clearAllMocks();
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/retry status",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(runWorkflow).not.toHaveBeenCalled();
    expect(result.state.messages.at(-1)?.content).toContain("No retry target is available.");
    expect(result.state.messages.at(-1)?.content).toContain(
      "open a retryable run with /details"
    );
  });

  it("runs a single chat task with an explicit workflow override", async () => {
    vi.clearAllMocks();
    const selected = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      workflowTarget: "release-readiness",
      workflowLocator: locator,
      status: "ready" as const,
    };

    const result = await handleChatInput({
      input: "/run --workflow code-review review the recent CLI changes",
      state: selected,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true, model: "openrouter/owl-alpha" },
    });

    expect(resolveWorkflow).toHaveBeenCalledWith("code-review", undefined);
    expect(runWorkflow).toHaveBeenCalledWith(
      codeReviewLocator.path,
      expect.objectContaining({
        dryRun: true,
        quiet: true,
        model: "openrouter/owl-alpha",
        input: expect.stringContaining("review the recent CLI changes"),
      })
    );
    expect(result.state.workflowLocator).toBe(locator);
    expect(result.state.workflowTarget).toBe("release-readiness");
    expect(result.state.lastRunCommand).toBe("obora run .obora/workflows/code-review.yaml");
    expect(result.state.lastRunWorkflowLocator).toBe(codeReviewLocator);
    expect(result.state.messages.at(-2)?.content).toBe("review the recent CLI changes");
  });

  it("clears stale run options when a new chat task has no run options", async () => {
    const runWorkflowWithResult = vi.fn(async () => executionResult);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: false,
      }),
      workflowLocator: locator,
      status: "ready" as const,
      lastRunOptions: {
        provider: "openrouter",
        model: "openrouter/owl-alpha",
        timeout: 2500,
      },
    };

    const ran = await handleChatInput({
      input: "perform the release check",
      state,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: {},
    });

    expect(ran.state.lastRunOptions).toBeUndefined();
    expect(ran.state.messages.at(-1)?.runOptions).toBeUndefined();
  });

  it("runs an explicit workflow override without a default workflow selected", async () => {
    vi.clearAllMocks();
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/run --workflow=code-review inspect docs",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(runWorkflow).toHaveBeenCalledWith(
      codeReviewLocator.path,
      expect.objectContaining({
        input: expect.stringContaining("inspect docs"),
      })
    );
    expect(result.state.workflowLocator).toBeUndefined();
    expect(result.state.status).toBe("ready");
  });

  it("keeps chat open when workflow override resolution fails", async () => {
    vi.clearAllMocks();
    const runSummary = buildWorkflowRunSummary(executionResult);
    const resolveWorkflowFailure = vi.fn(async () => {
      throw "provider lookup failed";
    });
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      inspectedRunSummary: runSummary,
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["triage"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      workflowChoices: [locator],
      showHelpPanel: true,
    };

    const result = await handleChatInput({
      input: "/run --workflow missing inspect docs",
      state,
      resolveWorkflow: resolveWorkflowFailure,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(resolveWorkflowFailure).toHaveBeenCalledWith("missing", undefined);
    expect(runWorkflow).not.toHaveBeenCalled();
    expect(result.exit).toBe(false);
    expect(result.state.status).toBe("failed");
    expect(result.state.lastError).toBe("provider lookup failed");
    expect(result.state.inspectedRunSummary).toBeUndefined();
    expect(result.state.runChoices).toBeUndefined();
    expect(result.state.sessionChoices).toBeUndefined();
    expect(result.state.workflowChoices).toBeUndefined();
    expect(result.state.showHelpPanel).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain(
      "Workflow resolve failed: provider lookup failed"
    );
  });

  it("stores returned workflow execution details as a one-message run summary", async () => {
    const runWorkflowWithResult = vi.fn(async () => executionResult);
    const selected = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: false,
      }),
      workflowLocator: locator,
      status: "ready" as const,
    };

    const result = await handleChatInput({
      input: "perform the release check",
      state: selected,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: { provider: "openrouter", model: "openrouter/owl-alpha" },
    });

    const lastMessage = result.state.messages.at(-1);
    expect(result.state.lastRunSummary).toMatchObject({
      executionId: "exec-chat-1",
      message: "Workflow completed: 2/2 steps completed.",
    });
    expect(result.state.inspectedRunSummary).toBeUndefined();
    expect(lastMessage?.content).toContain("Workflow completed: 2/2 steps completed.");
    expect(lastMessage).toMatchObject({
      workflowTarget: ".obora/workflows/release-readiness.yaml",
      runTask: "perform the release check",
      runWorkflowLocator: { name: "release-readiness" },
    });
    expect(lastMessage?.runSummary?.steps[0]).toMatchObject({
      name: "collect",
      model: "openrouter/owl-alpha",
      artifacts: ["release-notes.md"],
    });
  });

  it("opens step-level run details from the current chat session", async () => {
    const runWorkflowWithResult = vi.fn(async () => executionResult);
    const selected = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: false,
      }),
      workflowLocator: locator,
      status: "ready" as const,
    };
    const ran = await handleChatInput({
      input: "perform the release check",
      state: selected,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: { provider: "openrouter", model: "openrouter/owl-alpha" },
    });

    const result = await handleChatInput({
      input: "/details exec-chat-1",
      state: ran.state,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: { provider: "openrouter", model: "openrouter/owl-alpha" },
    });

    const content = result.state.messages.at(-1)?.content;
    expect(runWorkflowWithResult).toHaveBeenCalledOnce();
    expect(content).toContain("Opened run details exec-chat-1.");
    expect(result.state.inspectedRunSummary).toMatchObject({
      executionId: "exec-chat-1",
      workflowName: "release-readiness",
      completedStepCount: 2,
    });
    expect(result.state.inspectedRunSummary?.steps[0]).toMatchObject({
      name: "collect",
      toolsUsed: ["file_read"],
      artifacts: ["release-notes.md"],
      decisions: ["Use release notes"],
    });
  });

  it("opens the latest run details with a short details command", async () => {
    const runWorkflowWithResult = vi.fn(async () => executionResult);
    const selected = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: false,
      }),
      workflowLocator: locator,
      status: "ready" as const,
    };
    const ran = await handleChatInput({
      input: "perform the release check",
      state: selected,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: { provider: "openrouter", model: "openrouter/owl-alpha" },
    });

    const opened = await handleChatInput({
      input: "/details",
      state: ran.state,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: { provider: "openrouter", model: "openrouter/owl-alpha" },
    });

    expect(opened.state.inspectedRunSummary?.executionId).toBe("exec-chat-1");
    expect(opened.state.messages.at(-1)?.content).toBe("Opened run details exec-chat-1.");
  });

  it("reports when no latest run exists for the short details command", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      inspectedRunSummary: runSummary,
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["triage"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      workflowChoices: [locator],
      showHelpPanel: true,
    };

    const opened = await handleChatInput({
      input: "/details",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(opened.state.inspectedRunSummary).toBeUndefined();
    expect(opened.state.runChoices).toBeUndefined();
    expect(opened.state.sessionChoices).toBeUndefined();
    expect(opened.state.workflowChoices).toBeUndefined();
    expect(opened.state.showHelpPanel).toBeUndefined();
    expect(opened.state.messages.at(-1)?.content).toContain(
      "No run details are available yet."
    );
  });

  it("clears the inspected run details with a short command without deleting run history", async () => {
    const runWorkflowWithResult = vi.fn(async () => executionResult);
    const selected = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: false,
      }),
      workflowLocator: locator,
      status: "ready" as const,
    };
    const ran = await handleChatInput({
      input: "perform the release check",
      state: selected,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: { provider: "openrouter", model: "openrouter/owl-alpha" },
    });
    const opened = await handleChatInput({
      input: "/details exec-chat-1",
      state: ran.state,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: { provider: "openrouter", model: "openrouter/owl-alpha" },
    });

    const cleared = await handleChatInput({
      input: "/clear",
      state: opened.state,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: { provider: "openrouter", model: "openrouter/owl-alpha" },
    });

    expect(cleared.state.messages.at(-1)?.content).toBe("Closed run details view.");
    expect(cleared.state.inspectedRunSummary).toBeUndefined();
    expect(cleared.state.lastRunSummary?.executionId).toBe("exec-chat-1");
    expect(cleared.state.messages.some((message) => message.runSummary?.executionId === "exec-chat-1")).toBe(
      true
    );
  });

  it("closes run details without discarding the current run list", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const listedState = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      inspectedRunSummary: runSummary,
      runChoices: [
        {
          runSummary,
          sessionId: "history-session",
          messageId: "assistant:run",
          source: "persisted",
        },
      ],
    };

    const cleared = await handleChatInput({
      input: "/clear",
      state: listedState,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(cleared.state.inspectedRunSummary).toBeUndefined();
    expect(cleared.state.runChoices?.[0]).toMatchObject({
      sessionId: "history-session",
      runSummary: { executionId: "exec-chat-1" },
    });
    expect(cleared.state.messages.at(-1)?.content).toBe("Closed run details view.");
  });

  it("closes run details without preserving unrelated selection panels", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const listedState = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      inspectedRunSummary: runSummary,
      workflowChoices: [locator],
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "idle" as const,
          cwd: "/repo",
          tags: [],
          messageCount: 1,
          updatedAt: "2026-05-24T10:11:12.000Z",
        },
      ],
      runChoices: [
        {
          runSummary,
          sessionId: "history-session",
          messageId: "assistant:run",
          source: "persisted",
        },
      ],
    };

    const cleared = await handleChatInput({
      input: "/clear",
      state: listedState,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(cleared.state.inspectedRunSummary).toBeUndefined();
    expect(cleared.state.workflowChoices).toBeUndefined();
    expect(cleared.state.sessionChoices).toBeUndefined();
    expect(cleared.state.runChoices?.[0]).toMatchObject({
      sessionId: "history-session",
      runSummary: { executionId: "exec-chat-1" },
    });
    expect(cleared.state.messages.at(-1)?.content).toBe("Closed run details view.");
  });

  it("keeps the previous run detail clear command compatible", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const state = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      inspectedRunSummary: runSummary,
      lastRunSummary: runSummary,
    };
    const cleared = await handleChatInput({
      input: "/details clear",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(cleared.state.inspectedRunSummary).toBeUndefined();
    expect(cleared.state.lastRunSummary?.executionId).toBe("exec-chat-1");
    expect(cleared.state.messages.at(-1)?.content).toBe("Closed run details view.");
  });

  it("closes the help panel with the clear command", async () => {
    const state = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      showHelpPanel: true,
    };
    const cleared = await handleChatInput({
      input: "/clear",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(cleared.state.showHelpPanel).toBeUndefined();
    expect(cleared.state.messages.at(-1)?.content).toBe("Closed help panel.");
  });

  it("closes selection panels with the clear command", async () => {
    const state = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      workflowChoices: [locator],
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "idle" as const,
          cwd: "/repo",
          tags: [],
          messageCount: 1,
          updatedAt: "2026-05-24T10:11:12.000Z",
        },
      ],
      runChoices: [],
    };
    const cleared = await handleChatInput({
      input: "/clear",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(cleared.state.workflowChoices).toBeUndefined();
    expect(cleared.state.sessionChoices).toBeUndefined();
    expect(cleared.state.runChoices).toBeUndefined();
    expect(cleared.state.messages.at(-1)?.content).toBe("Closed selection panels.");
  });

  it("lists runs and opens run details by number", async () => {
    const runWorkflowWithResult = vi.fn(async () => executionResult);
    const selected = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: false,
      }),
      workflowLocator: locator,
      status: "ready" as const,
    };
    const ran = await handleChatInput({
      input: "perform the release check",
      state: selected,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: { provider: "openrouter", model: "openrouter/owl-alpha" },
    });
    const listed = await handleChatInput({
      input: "/runs",
      state: ran.state,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: { provider: "openrouter", model: "openrouter/owl-alpha" },
    });
    const opened = await handleChatInput({
      input: "/details 1",
      state: listed.state,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: { provider: "openrouter", model: "openrouter/owl-alpha" },
    });

    expect(listed.state.runChoices?.map((choice) => choice.runSummary.executionId)).toEqual([
      "exec-chat-1",
    ]);
    expect(listed.state.messages.at(-1)?.content).toContain("Recent workflow runs:");
    expect(listed.state.messages.at(-1)?.content).toContain("task perform the release check");
    expect(listed.state.messages.at(-1)?.content).toContain("retry release-readiness");
    expect(listed.state.messages.at(-1)?.content).toContain(
      "options provider openrouter · model openrouter/owl-alpha"
    );
    expect(listed.state.messages.at(-1)?.content).toContain("Type 1 to open a run");
    expect(opened.state.inspectedRunSummary?.executionId).toBe("exec-chat-1");
    expect(opened.state.messages.at(-1)?.content).toContain("Opened run details exec-chat-1.");
    expect(opened.state.messages.at(-1)?.content).not.toContain("Use /session session-a");
  });

  it("retries a current-session run directly from the numbered run list", async () => {
    const runWorkflowWithResult = vi.fn(async () => executionResult);
    const selected = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: false,
      }),
      workflowLocator: locator,
      status: "ready" as const,
    };
    const ran = await handleChatInput({
      input: "perform the release check",
      state: selected,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: { provider: "openrouter", model: "openrouter/owl-alpha" },
    });
    const listed = await handleChatInput({
      input: "/runs",
      state: ran.state,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: { provider: "openrouter", model: "openrouter/owl-alpha" },
    });

    vi.clearAllMocks();
    const retried = await handleChatInput({
      input: "/retry 1",
      state: listed.state,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: { dryRun: true },
    });

    expect(runWorkflowWithResult).toHaveBeenCalledWith(
      locator.path,
      expect.objectContaining({
        input: expect.stringContaining("perform the release check"),
      })
    );
    expect(retried.state.lastRunTask).toBe("perform the release check");
    expect(retried.state.lastRunWorkflowLocator).toBe(locator);
  });

  it("opens listed run details by typing the run number", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const listedState = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
    };
    const opened = await handleChatInput({
      input: "1",
      state: listedState,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(opened.state.inspectedRunSummary?.executionId).toBe("exec-chat-1");
    expect(opened.state.messages.at(-1)?.content).toContain("Opened run details exec-chat-1.");
  });

  it("opens run details as the active panel", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const listedState = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["triage"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      workflowChoices: [locator],
      showHelpPanel: true,
    };

    const opened = await handleChatInput({
      input: "1",
      state: listedState,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(opened.state.inspectedRunSummary?.executionId).toBe("exec-chat-1");
    expect(opened.state.runChoices?.[0]?.runSummary.executionId).toBe("exec-chat-1");
    expect(opened.state.sessionChoices).toBeUndefined();
    expect(opened.state.workflowChoices).toBeUndefined();
    expect(opened.state.showHelpPanel).toBeUndefined();
    expect(opened.state.messages.at(-1)?.content).toContain("Opened run details exec-chat-1.");
  });

  it("opens the first listed run with a short details command", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const listedState = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      runChoices: [
        {
          runSummary,
          sessionId: "history-session",
          messageId: "assistant:run",
          source: "persisted",
        },
      ],
    };

    const opened = await handleChatInput({
      input: "/details",
      state: listedState,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(opened.state.inspectedRunSummary?.executionId).toBe("exec-chat-1");
    expect(opened.state.messages.at(-1)?.content).toContain(
      "Use /session history-session to switch to the source session."
    );
  });

  it("opens the visible listed run before the previous latest run", async () => {
    const latestSummary = buildWorkflowRunSummary(executionResult);
    const listedSummary = {
      ...latestSummary,
      executionId: "exec-visible-1",
      workflowName: "code-review",
    };
    const listedState = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      lastRunSummary: latestSummary,
      runChoices: [
        {
          runSummary: listedSummary,
          sessionId: "history-session",
          messageId: "assistant:run",
          source: "persisted",
        },
      ],
    };

    const opened = await handleChatInput({
      input: "/details",
      state: listedState,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(opened.state.inspectedRunSummary).toMatchObject({
      executionId: "exec-visible-1",
      workflowName: "code-review",
    });
    expect(opened.state.messages.at(-1)?.content).toContain(
      "Use /session history-session to switch to the source session."
    );
  });

  it("lists persisted runs across sessions from chat", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const listRuns = vi.fn(async () => [
      {
        sessionId: "session-a",
        projectRoot: "/repo/source-project",
        messageId: "assistant:run",
        messageCreatedAt: "2026-05-21T00:00:02.000Z",
        runTask: "perform the release check",
        runWorkflowLocator: locator,
        runOptions: {
          provider: "openrouter",
          model: "openrouter/owl-alpha",
          config: "/repo/.obora/config.yaml",
          timeout: 2500,
        },
        runSummary,
      },
      {
        sessionId: "session-b",
        projectRoot: "/repo/legacy-project",
        messageId: "assistant:old-run",
        messageCreatedAt: "2026-05-20T00:00:02.000Z",
        runTask: "rerun from old metadata",
        runSummary: {
          ...runSummary,
          executionId: "exec-chat-old",
        },
      },
    ]);
    const state = createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true });

    const listed = await handleChatInput({
      input: "/runs --all",
      state,
      resolveWorkflow,
      runWorkflow,
      listRuns,
      commandOptions: { dryRun: true },
    });

    expect(listRuns).toHaveBeenCalledWith(undefined);
    expect(listed.state.runChoices?.map((choice) => choice.runSummary.executionId)).toEqual([
      "exec-chat-1",
      "exec-chat-old",
    ]);
    expect(listed.state.runChoices?.[0]?.sessionId).toBe("session-a");
    expect(listed.state.runChoices?.[0]?.projectRoot).toBe("/repo/source-project");
    expect(listed.state.runChoices?.[0]?.source).toBe("persisted");
    expect(listed.state.runChoices?.[0]?.runTask).toBe("perform the release check");
    expect(listed.state.runChoices?.[0]?.runWorkflowLocator).toBe(locator);
    expect(listed.state.runChoices?.[0]?.runOptions).toMatchObject({
      provider: "openrouter",
      model: "openrouter/owl-alpha",
      timeout: 2500,
    });
    expect(listed.state.runChoices?.[1]?.runTask).toBe("rerun from old metadata");
    expect(listed.state.runChoices?.[1]?.projectRoot).toBe("/repo/legacy-project");
    expect(listed.state.runChoices?.[1]?.runWorkflowLocator).toBeUndefined();
    expect(listed.state.messages.at(-1)?.content).toContain(
      "Persisted workflow runs (all sessions):"
    );
    expect(listed.state.messages.at(-1)?.content).toContain("exec-chat-1 · session-a");
    expect(listed.state.messages.at(-1)?.content).toContain("project /repo/source-project");
    expect(listed.state.messages.at(-1)?.content).toContain("exec-chat-old · session-b");
    expect(listed.state.messages.at(-1)?.content).toContain("project /repo/legacy-project");
    expect(listed.state.messages.at(-1)?.content).toContain("task perform the release check");
    expect(listed.state.messages.at(-1)?.content).toContain("task rerun from old metadata");
    expect(listed.state.messages.at(-1)?.content).toContain("retry release-readiness");
    expect(listed.state.messages.at(-1)?.content).toContain(
      "options provider openrouter · model openrouter/owl-alpha · timeout 2500ms · files+1"
    );
    expect(listed.state.messages.at(-1)?.content).toContain("options default");
    expect(listed.state.messages.at(-1)?.content).toContain(
      "Use /retry 1 to rerun directly, or /details 1 to inspect first."
    );
  });

  it("truncates long persisted run task text in chat run lists", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const listRuns = vi.fn(async () => [
      {
        sessionId: "session-a",
        messageId: "assistant:run",
        messageCreatedAt: "2026-05-21T00:00:02.000Z",
        runTask:
          "prepare release notes, update changelog, run checks, and hand off to operations",
        runSummary,
      },
      {
        sessionId: "session-b",
        messageId: "assistant:no-task",
        messageCreatedAt: "2026-05-20T00:00:02.000Z",
        runSummary: {
          ...runSummary,
          executionId: "exec-chat-no-task",
        },
      },
    ]);
    const state = createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true });

    const listed = await handleChatInput({
      input: "/runs --all",
      state,
      resolveWorkflow,
      runWorkflow,
      listRuns,
      commandOptions: { dryRun: true },
    });

    expect(listed.state.messages.at(-1)?.content).toContain(
      "task prepare release notes, update changelog, run ch…"
    );
    expect(listed.state.messages.at(-1)?.content).toContain("task -");
  });

  it("closes open run details when opening selection panels", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const detailed = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      lastRunSummary: runSummary,
      inspectedRunSummary: runSummary,
    };
    const listSessions = vi.fn(async () => [
      {
        sessionId: "session-b",
        status: "ready" as const,
        cwd: "/repo",
        projectRoot: "/repo",
        tags: ["ops"],
        workflowTarget: "release-readiness",
        messageCount: 4,
        updatedAt: "2026-05-22T00:00:00.000Z",
      },
    ]);
    const listWorkflowLocators = vi.fn(async () => [locator]);

    const runs = await handleChatInput({
      input: "/runs",
      state: detailed,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });
    const sessions = await handleChatInput({
      input: "/sessions",
      state: detailed,
      resolveWorkflow,
      runWorkflow,
      listSessions,
      commandOptions: { dryRun: true },
    });
    const workflows = await handleChatInput({
      input: "/workflows",
      state: detailed,
      resolveWorkflow,
      runWorkflow,
      listWorkflowLocators,
      commandOptions: { dryRun: true },
    });

    expect(runs.state.inspectedRunSummary).toBeUndefined();
    expect(runs.state.runChoices?.[0]?.runSummary.executionId).toBe("exec-chat-1");
    expect(sessions.state.inspectedRunSummary).toBeUndefined();
    expect(sessions.state.sessionChoices?.[0]?.sessionId).toBe("session-b");
    expect(workflows.state.inspectedRunSummary).toBeUndefined();
    expect(workflows.state.workflowChoices?.[0]?.name).toBe("release-readiness");
  });

  it("closes the help panel when opening selection panels", async () => {
    const listSessions = vi.fn(async () => [
      {
        sessionId: "session-b",
        status: "ready" as const,
        cwd: "/repo",
        projectRoot: "/repo",
        tags: ["ops"],
        workflowTarget: "release-readiness",
        messageCount: 4,
        updatedAt: "2026-05-22T00:00:00.000Z",
      },
    ]);
    const listWorkflowLocators = vi.fn(async () => [locator]);
    const helped = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      lastRunSummary: buildWorkflowRunSummary(executionResult),
      showHelpPanel: true,
    };

    const runs = await handleChatInput({
      input: "/runs",
      state: helped,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });
    const sessions = await handleChatInput({
      input: "/sessions",
      state: helped,
      resolveWorkflow,
      runWorkflow,
      listSessions,
      commandOptions: { dryRun: true },
    });
    const workflows = await handleChatInput({
      input: "/workflows",
      state: helped,
      resolveWorkflow,
      runWorkflow,
      listWorkflowLocators,
      commandOptions: { dryRun: true },
    });

    expect(runs.state.showHelpPanel).toBeUndefined();
    expect(runs.state.runChoices?.[0]?.runSummary.executionId).toBe("exec-chat-1");
    expect(sessions.state.showHelpPanel).toBeUndefined();
    expect(sessions.state.sessionChoices?.[0]?.sessionId).toBe("session-b");
    expect(workflows.state.showHelpPanel).toBeUndefined();
    expect(workflows.state.workflowChoices?.[0]?.name).toBe("release-readiness");
  });

  it("opens persisted run details by execution id from chat", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const findRun = vi.fn(async () => ({
      sessionId: "session-a",
      messageId: "assistant:run",
      messageCreatedAt: "2026-05-21T00:00:02.000Z",
      runTask: "perform the release check",
      runWorkflowLocator: locator,
      runSummary,
    }));
    const state = createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true });

    const opened = await handleChatInput({
      input: "/details exec-chat-1",
      state,
      resolveWorkflow,
      runWorkflow,
      findRun,
      commandOptions: { dryRun: true },
    });

    expect(findRun).toHaveBeenCalledWith("exec-chat-1");
    expect(opened.state.inspectedRunSummary?.executionId).toBe("exec-chat-1");
    expect(opened.state.lastRunTask).toBe("perform the release check");
    expect(opened.state.lastRunWorkflowLocator).toBe(locator);
    expect(opened.state.runChoices?.[0]).toMatchObject({
      sessionId: "session-a",
      messageId: "assistant:run",
      source: "persisted",
      runTask: "perform the release check",
      runWorkflowLocator: { name: "release-readiness" },
      runSummary: { executionId: "exec-chat-1" },
    });
    expect(opened.state.messages.at(-1)?.content).toContain("Opened run details exec-chat-1.");
    expect(opened.state.messages.at(-1)?.content).toContain(
      "Use /session session-a to switch to the source session."
    );
    expect(opened.state.messages.at(-1)?.content).toContain("Use /retry to rerun this task.");

    vi.clearAllMocks();
    const retried = await handleChatInput({
      input: "/retry",
      state: opened.state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(runWorkflow).toHaveBeenCalledWith(
      locator.path,
      expect.objectContaining({
        input: expect.stringContaining("perform the release check"),
      })
    );
    expect(retried.state.lastRunWorkflowLocator).toBe(locator);
  });

  it("clears stale retry options when opening a persisted run without options", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const findRun = vi.fn(async () => ({
      sessionId: "session-a",
      messageId: "assistant:run",
      messageCreatedAt: "2026-05-21T00:00:02.000Z",
      runTask: "perform the release check",
      runWorkflowLocator: locator,
      runSummary,
    }));
    const state = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      lastRunOptions: {
        provider: "openrouter",
        model: "openrouter/owl-alpha",
        timeout: 2500,
      },
    };

    const opened = await handleChatInput({
      input: "/details exec-chat-1",
      state,
      resolveWorkflow,
      runWorkflow,
      findRun,
      commandOptions: { dryRun: true },
    });

    expect(opened.state.lastRunOptions).toBeUndefined();

    vi.clearAllMocks();
    await handleChatInput({
      input: "/retry",
      state: opened.state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(runWorkflow).toHaveBeenCalledWith(
      locator.path,
      expect.not.objectContaining({
        provider: "openrouter",
        model: "openrouter/owl-alpha",
        timeout: 2500,
      })
    );
  });

  it("retries opened persisted metadata from its source project", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const findRun = vi.fn(async () => ({
      sessionId: "source-session",
      projectRoot: "/repo/source-project",
      messageId: "assistant:run",
      messageCreatedAt: "2026-05-21T00:00:02.000Z",
      runTask: "perform the release check",
      runSummary,
    }));
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      projectRoot: "/repo/current-project",
      dryRun: true,
    });

    const opened = await handleChatInput({
      input: "/details exec-chat-1",
      state,
      resolveWorkflow,
      runWorkflow,
      findRun,
      commandOptions: { dryRun: true },
    });

    expect(opened.state.lastRunProjectRoot).toBe("/repo/source-project");

    vi.clearAllMocks();
    await handleChatInput({
      input: "/retry",
      state: opened.state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(resolveWorkflow).toHaveBeenCalledWith("release-readiness", "/repo/source-project");
  });

  it("does not query persisted run details when a memory summary matches", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const findRun = vi.fn(async () => undefined);
    const state = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      lastRunSummary: runSummary,
    };

    const opened = await handleChatInput({
      input: "/details exec-chat-1",
      state,
      resolveWorkflow,
      runWorkflow,
      findRun,
      commandOptions: { dryRun: true },
    });

    expect(findRun).not.toHaveBeenCalled();
    expect(opened.state.inspectedRunSummary?.executionId).toBe("exec-chat-1");
    expect(opened.state.messages.at(-1)?.content).toBe("Opened run details exec-chat-1.");
  });

  it("restores message-level retry context when opening details after workflow switching", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const findRun = vi.fn(async () => undefined);
    const state = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      workflowTarget: "code-review",
      workflowLocator: codeReviewLocator,
      messages: [
        {
          id: "assistant:release-run",
          role: "assistant" as const,
          content: "Workflow completed.",
          createdAt: "2026-05-21T00:00:02.000Z",
          workflowTarget: "release-readiness",
          runTask: "perform the release check",
          runWorkflowLocator: locator,
          runSummary,
        },
      ],
    };

    const opened = await handleChatInput({
      input: "/details exec-chat-1",
      state,
      resolveWorkflow,
      runWorkflow,
      findRun,
      commandOptions: { dryRun: true },
    });

    expect(findRun).not.toHaveBeenCalled();
    expect(opened.state.inspectedRunSummary?.executionId).toBe("exec-chat-1");
    expect(opened.state.lastRunTask).toBe("perform the release check");
    expect(opened.state.lastRunWorkflowLocator).toBe(locator);
    expect(opened.state.workflowLocator).toBe(codeReviewLocator);
    expect(opened.state.messages.at(-1)?.content).toContain("Use /retry to rerun this task.");
  });

  it("opens numbered run details with a source session switch hint", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const state = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      runChoices: [
        {
          runSummary,
          sessionId: "history-session",
          messageId: "assistant:run",
          source: "persisted",
        },
      ],
    };

    const opened = await handleChatInput({
      input: "/details 1",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(opened.state.inspectedRunSummary?.executionId).toBe("exec-chat-1");
    expect(opened.state.messages.at(-1)?.content).toContain(
      "Use /session history-session to switch to the source session."
    );
  });

  it("reports missing run details after checking persisted history", async () => {
    const findRun = vi.fn(async () => undefined);
    const state = createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true });

    const opened = await handleChatInput({
      input: "/details exec-missing",
      state,
      resolveWorkflow,
      runWorkflow,
      findRun,
      commandOptions: { dryRun: true },
    });

    expect(findRun).toHaveBeenCalledWith("exec-missing");
    expect(opened.state.inspectedRunSummary).toBeUndefined();
    expect(opened.state.messages.at(-1)?.content).toContain("Run details not found: exec-missing");
  });

  it("clears stale run details when requested details are missing", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const findRun = vi.fn(async () => undefined);
    const state = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      inspectedRunSummary: runSummary,
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["triage"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      workflowChoices: [locator],
      showHelpPanel: true,
    };

    const opened = await handleChatInput({
      input: "/details exec-missing",
      state,
      resolveWorkflow,
      runWorkflow,
      findRun,
      commandOptions: { dryRun: true },
    });

    expect(findRun).toHaveBeenCalledWith("exec-missing");
    expect(opened.state.inspectedRunSummary).toBeUndefined();
    expect(opened.state.runChoices?.[0]?.runSummary.executionId).toBe("exec-chat-1");
    expect(opened.state.sessionChoices).toBeUndefined();
    expect(opened.state.workflowChoices).toBeUndefined();
    expect(opened.state.showHelpPanel).toBeUndefined();
    expect(opened.state.messages.at(-1)?.content).toContain("Run details not found: exec-missing");
  });

  it("keeps listed run choices when a numbered run detail choice is missing", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const findRun = vi.fn(async () => undefined);
    const state = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
    };

    const opened = await handleChatInput({
      input: "/details 2",
      state,
      resolveWorkflow,
      runWorkflow,
      findRun,
      commandOptions: { dryRun: true },
    });

    expect(findRun).not.toHaveBeenCalled();
    expect(opened.state.inspectedRunSummary).toBeUndefined();
    expect(opened.state.runChoices?.map((choice) => choice.runSummary.executionId)).toEqual([
      "exec-chat-1",
    ]);
    expect(opened.state.messages.at(-1)?.content).toContain("Run choice not found.");
  });

  it("reports missing numbered run details when no run choices exist", async () => {
    const state = createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true });

    const opened = await handleChatInput({
      input: "/details 1",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(opened.state.inspectedRunSummary).toBeUndefined();
    expect(opened.state.messages.at(-1)?.content).toContain("Run choice not found.");
  });

  it("lists persisted runs for a selected session choice from chat", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const listRuns = vi.fn(async () => [
      {
        sessionId: "session-b",
        messageId: "state:lastRunSummary",
        messageCreatedAt: "2026-05-22T00:00:02.000Z",
        runSummary: {
          ...runSummary,
          executionId: "exec-session-b",
          startedAt: "2026-05-22T00:00:00.000Z",
        },
      },
    ]);
    const state = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["ops"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
    };

    const listed = await handleChatInput({
      input: "/runs --session 1",
      state,
      resolveWorkflow,
      runWorkflow,
      listRuns,
      commandOptions: { dryRun: true },
    });

    expect(listRuns).toHaveBeenCalledWith("session-b");
    expect(listed.state.runChoices?.map((choice) => choice.runSummary.executionId)).toEqual([
      "exec-session-b",
    ]);
    expect(listed.state.runChoices?.[0]?.sessionId).toBe("session-b");
    expect(listed.state.messages.at(-1)?.content).toContain(
      "Persisted workflow runs (session session-b):"
    );
  });

  it("reports invalid and missing persisted run list selectors", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const state = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      inspectedRunSummary: runSummary,
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["triage"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      workflowChoices: [locator],
      showHelpPanel: true,
    };
    const invalid = await handleChatInput({
      input: "/runs --unknown",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });
    const missingChoice = await handleChatInput({
      input: "/runs --session 2",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });
    const missingTag = await handleChatInput({
      input: "/runs --tag",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });
    const missingStatus = await handleChatInput({
      input: "/runs --status",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });
    const invalidStatus = await handleChatInput({
      input: "/runs typo",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(invalid.state.messages.at(-1)?.content).toContain(
      "Usage: /runs, /runs failed, /runs --all, /runs --session <id-or-number>, /runs --project [path], /runs --tag <tag>, or /runs --status <queued|running|waiting|suspended|completed|failed|aborted>."
    );
    expect(invalid.state.inspectedRunSummary).toBeUndefined();
    expect(invalid.state.runChoices).toBeUndefined();
    expect(invalid.state.sessionChoices).toBeUndefined();
    expect(invalid.state.workflowChoices).toBeUndefined();
    expect(invalid.state.showHelpPanel).toBeUndefined();
    expect(missingTag.state.messages.at(-1)?.content).toContain("Usage: /runs");
    expect(missingStatus.state.messages.at(-1)?.content).toContain("Usage: /runs");
    expect(invalidStatus.state.messages.at(-1)?.content).toContain("Usage: /runs");
    expect(missingChoice.state.messages.at(-1)?.content).toContain(
      "Session choice not found. Run /sessions first."
    );
    expect(missingChoice.state.inspectedRunSummary).toBeUndefined();
    expect(missingChoice.state.runChoices).toBeUndefined();
    expect(missingChoice.state.sessionChoices?.map((session) => session.sessionId)).toEqual([
      "session-b",
    ]);
    expect(missingChoice.state.workflowChoices).toBeUndefined();
    expect(missingChoice.state.showHelpPanel).toBeUndefined();
  });

  it("passes persisted run filters to injected run listing callbacks", async () => {
    const listRuns = vi.fn(async () => []);
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      projectRoot: "/repo/project-a",
      dryRun: true,
    });

    const listed = await handleChatInput({
      input: "/runs --project packages/cli --tag release --status failed",
      state,
      resolveWorkflow,
      runWorkflow,
      listRuns,
      commandOptions: { dryRun: true },
    });

    expect(listRuns).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        projectRoot: "/repo/packages/cli",
        tag: "release",
        status: "failed",
      })
    );
    expect(listed.state.messages.at(-1)?.content).toContain(
      "all sessions, project /repo/packages/cli, tag release, status failed"
    );
  });

  it("passes persisted run status shortcuts to injected run listing callbacks", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const listRuns = vi.fn(async () => [
      {
        sessionId: "session-a",
        messageId: "assistant:failed-run",
        messageCreatedAt: "2026-05-22T00:00:02.000Z",
        runSummary: {
          ...runSummary,
          executionId: "exec-failed",
          status: "failed" as const,
        },
      },
    ]);
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const listed = await handleChatInput({
      input: "/runs failed",
      state,
      resolveWorkflow,
      runWorkflow,
      listRuns,
      commandOptions: { dryRun: true },
    });

    expect(listRuns).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({ status: "failed" })
    );
    expect(listed.state.messages.at(-1)?.content).toContain(
      "Persisted workflow runs (all sessions, status failed):"
    );
    expect(listed.state.runChoices?.[0]?.runSummary.executionId).toBe("exec-failed");
  });

  it("keeps chat open when persisted run listing fails", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const listRuns = vi.fn(async () => {
      throw new Error("Run history unavailable");
    });
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        projectRoot: "/repo/project-a",
        dryRun: true,
      }),
      inspectedRunSummary: runSummary,
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["triage"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      workflowChoices: [locator],
      showHelpPanel: true,
    };

    const result = await handleChatInput({
      input: "/runs --project packages/cli --tag release",
      state,
      resolveWorkflow,
      runWorkflow,
      listRuns,
      commandOptions: { dryRun: true },
    });

    expect(listRuns).toHaveBeenCalledWith(
      undefined,
      expect.objectContaining({
        projectRoot: "/repo/packages/cli",
        tag: "release",
      })
    );
    expect(result.exit).toBe(false);
    expect(result.state.status).toBe("failed");
    expect(result.state.lastError).toBe("Run history unavailable");
    expect(result.state.inspectedRunSummary).toBeUndefined();
    expect(result.state.runChoices).toBeUndefined();
    expect(result.state.sessionChoices).toBeUndefined();
    expect(result.state.workflowChoices).toBeUndefined();
    expect(result.state.showHelpPanel).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain(
      "Run list failed: Run history unavailable"
    );
  });

  it("filters persisted runs by project, tag, and status from chat", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "obora-chat-run-filter-command-"));
    const runSummary = buildWorkflowRunSummary(executionResult);
    const projectA = join(cwd, "project-a");
    const projectB = join(cwd, "project-b");
    await saveChatSessionState({
      cwd,
      state: {
        ...createInitialChatState({
          sessionId: "session-release",
          cwd,
          projectRoot: projectA,
          tags: ["release"],
          dryRun: false,
        }),
        lastRunSummary: {
          ...runSummary,
          executionId: "exec-release",
          startedAt: "2026-05-25T00:00:00.000Z",
        },
      },
    });
    await saveChatSessionState({
      cwd,
      state: {
        ...createInitialChatState({
          sessionId: "session-support",
          cwd,
          projectRoot: projectB,
          tags: ["support"],
          dryRun: false,
        }),
        lastRunSummary: {
          ...runSummary,
          executionId: "exec-support-failed",
          status: "failed",
          startedAt: "2026-05-24T00:00:00.000Z",
        },
      },
    });
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd,
      projectRoot: projectA,
      dryRun: true,
    });

    const byProject = await handleChatInput({
      input: "/runs --project",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });
    const byTag = await handleChatInput({
      input: "/runs --tag support",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });
    const byStatus = await handleChatInput({
      input: "/runs --status failed",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(byProject.state.messages.at(-1)?.content).toContain(`project ${projectA}`);
    expect(byProject.state.messages.at(-1)?.content).toContain("exec-release");
    expect(byProject.state.messages.at(-1)?.content).not.toContain("exec-support-failed");
    expect(byTag.state.messages.at(-1)?.content).toContain("tag support");
    expect(byTag.state.messages.at(-1)?.content).toContain("exec-support-failed");
    expect(byStatus.state.messages.at(-1)?.content).toContain("status failed");
    expect(byStatus.state.messages.at(-1)?.content).toContain("exec-support-failed");
    const byStatusShortcut = await handleChatInput({
      input: "/runs failed",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(byStatusShortcut.state.messages.at(-1)?.content).toContain("status failed");
    expect(byStatusShortcut.state.messages.at(-1)?.content).toContain("exec-support-failed");
  });

  it("reports empty persisted run lists for a selected session", async () => {
    const listRuns = vi.fn(async () => []);
    const state = createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true });

    const listed = await handleChatInput({
      input: "/runs --session session-empty",
      state,
      resolveWorkflow,
      runWorkflow,
      listRuns,
      commandOptions: { dryRun: true },
    });

    expect(listRuns).toHaveBeenCalledWith("session-empty");
    expect(listed.state.runChoices).toEqual([]);
    expect(listed.state.messages.at(-1)?.content).toContain(
      "No persisted workflow runs found for session session-empty."
    );
  });

  it("opens the newest persisted run first for a selected session", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "obora-chat-session-run-sort-"));
    const runSummary = buildWorkflowRunSummary(executionResult);
    const olderRun = {
      ...runSummary,
      executionId: "exec-older",
      startedAt: "2026-05-24T00:00:00.000Z",
    };
    const newerRun = {
      ...runSummary,
      executionId: "exec-newer",
      startedAt: "2026-05-25T00:00:00.000Z",
    };
    await saveChatSessionState({
      cwd,
      state: {
        ...createInitialChatState({
          sessionId: "session-sort",
          cwd,
          dryRun: false,
        }),
        messages: [
          {
            id: "assistant:older",
            role: "assistant",
            content: olderRun.message,
            createdAt: "2026-05-24T00:00:01.000Z",
            runSummary: olderRun,
          },
          {
            id: "assistant:newer",
            role: "assistant",
            content: newerRun.message,
            createdAt: "2026-05-25T00:00:01.000Z",
            runSummary: newerRun,
          },
        ],
        lastRunTask: "rerun newest persisted task",
        lastRunWorkflowLocator: locator,
        lastRunSummary: newerRun,
      },
    });
    const runWorkflowWithResult = vi.fn(async () => executionResult);
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd,
      dryRun: true,
    });

    const listed = await handleChatInput({
      input: "/runs --session session-sort",
      state,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: { dryRun: true },
    });
    const opened = await handleChatInput({
      input: "/details 1",
      state: listed.state,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: { dryRun: true },
    });
    const retried = await handleChatInput({
      input: "/retry 1",
      state: listed.state,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: { dryRun: true },
    });

    expect(listed.state.runChoices?.map((choice) => choice.runSummary.executionId)).toEqual([
      "exec-newer",
      "exec-older",
    ]);
    expect(opened.state.inspectedRunSummary?.executionId).toBe("exec-newer");
    expect(runWorkflowWithResult).toHaveBeenCalledWith(
      locator.path,
      expect.objectContaining({
        input: expect.stringContaining("rerun newest persisted task"),
      })
    );
    expect(retried.state.lastRunTask).toBe("rerun newest persisted task");
  });

  it("reports missing run details without requiring a workflow selection", async () => {
    vi.clearAllMocks();
    const state = createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true });

    const result = await handleChatInput({
      input: "/details missing-run",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(runWorkflow).not.toHaveBeenCalled();
    expect(result.state.messages.at(-1)?.content).toContain("Run details not found: missing-run");
  });

  it("shows and updates session tags without requiring workflow selection", async () => {
    vi.clearAllMocks();
    const runSummary = buildWorkflowRunSummary(executionResult);
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
      tags: ["triage"],
    });

    const shown = await handleChatInput({
      input: "/tags",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });
    const updated = await handleChatInput({
      input: "/tags release, qa",
      state: {
        ...shown.state,
        inspectedRunSummary: runSummary,
        runChoices: [
          {
            runSummary,
            sessionId: "session-a",
            messageId: "assistant:run",
            source: "persisted",
          },
        ],
        sessionChoices: [
          {
            sessionId: "session-b",
            status: "ready" as const,
            cwd: "/repo",
            projectRoot: "/repo",
            tags: ["triage"],
            workflowTarget: "release-readiness",
            messageCount: 4,
            updatedAt: "2026-05-22T00:00:00.000Z",
          },
        ],
        workflowChoices: [locator],
        showHelpPanel: true,
      },
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });
    const cleared = await handleChatInput({
      input: "/tags --clear",
      state: updated.state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(runWorkflow).not.toHaveBeenCalled();
    expect(shown.state.messages.at(-1)?.content).toContain("Session tags: triage");
    expect(updated.state.tags).toEqual(["release", "qa"]);
    expect(updated.state.inspectedRunSummary).toBeUndefined();
    expect(updated.state.runChoices).toBeUndefined();
    expect(updated.state.sessionChoices).toBeUndefined();
    expect(updated.state.workflowChoices).toBeUndefined();
    expect(updated.state.showHelpPanel).toBeUndefined();
    expect(updated.state.messages.at(-1)?.content).toContain("Session tags updated: release, qa");
    expect(cleared.state.tags).toEqual([]);
    expect(cleared.state.messages.at(-1)?.content).toContain("Session tags updated: none");
  });

  it("shows current session metadata without requiring workflow execution", async () => {
    vi.clearAllMocks();
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        projectRoot: "/repo/project-a",
        dryRun: true,
        tags: ["release", "qa"],
      }),
      workflowTarget: "release-readiness",
      workflowLocator: locator,
      lastRunCommand: "obora run .obora/workflows/release-readiness.yaml",
      lastRunTask: "perform the release check",
      lastRunWorkflowLocator: locator,
      lastRunOptions: {
        provider: "openrouter",
        model: "openrouter/owl-alpha",
        config: "/repo/.obora/config.yaml",
        agents: "/repo/agents.yaml",
        policy: "/repo/policy.yaml",
        timeout: 2500,
      },
      lastRunSummary: {
        executionId: "exec-session-1",
        workflowName: "release-readiness",
        status: "completed" as const,
        message: "Workflow completed: 1/1 steps completed.",
        startedAt: "2026-05-24T00:00:00.000Z",
        endedAt: "2026-05-24T00:00:01.000Z",
        durationMs: 1000,
        totalStepCount: 1,
        completedStepCount: 1,
        steps: [],
      },
    };

    const result = await handleChatInput({
      input: "/session",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    const content = result.state.messages.at(-1)?.content;
    expect(resolveWorkflow).not.toHaveBeenCalled();
    expect(runWorkflow).not.toHaveBeenCalled();
    expect(content).toContain("Session: session-a");
    expect(content).toContain("Project: /repo/project-a");
    expect(content).toContain("Tags: release, qa");
    expect(content).toContain("Workflow: release-readiness (project)");
    expect(content).toContain("Mode: dry-run");
    expect(content).toContain("Last run: obora run .obora/workflows/release-readiness.yaml");
    expect(content).toContain("Retry: release-readiness -> perform the release check");
    expect(content).toContain(
      "Retry options: provider openrouter · model openrouter/owl-alpha · timeout 2500ms · files+3"
    );
    expect(content).toContain("Last result: completed 1/1");
    expect(content).toContain("Details: /details exec-session-1");
  });

  it("shows session retry metadata for old runs without a resolved locator", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        projectRoot: "/repo/current-project",
        dryRun: true,
      }),
      status: "ready" as const,
      lastRunTask: "perform the release check",
      lastRunProjectRoot: "/repo/source-project",
      lastRunSummary: runSummary,
    };

    const result = await handleChatInput({
      input: "/session",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    const content = result.state.messages.at(-1)?.content ?? "";
    expect(content).toContain("Retry: release-readiness -> perform the release check");
    expect(content).toContain("Retry project: /repo/source-project");
    expect(content).toContain("Last run: obora run release-readiness");
  });

  it("shows empty session metadata when no workflow or run exists", async () => {
    vi.clearAllMocks();
    const state = createInitialChatState({
      sessionId: "session-empty",
      cwd: "/repo",
      dryRun: false,
    });

    const result = await handleChatInput({
      input: "/session",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: {},
    });

    const content = result.state.messages.at(-1)?.content;
    expect(runWorkflow).not.toHaveBeenCalled();
    expect(content).toContain("Session: session-empty");
    expect(content).toContain("Tags: none");
    expect(content).toContain("Workflow: none");
    expect(content).toContain("Mode: live");
    expect(content).toContain("Provider: default");
    expect(content).toContain("Model: default");
    expect(content).toContain("Last run: none");
    expect(content).toContain("Last result: none");
    expect(content).not.toContain("Details:");
  });

  it("shows and updates the session project root", async () => {
    vi.clearAllMocks();
    const runSummary = buildWorkflowRunSummary(executionResult);
    const selected = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        projectRoot: "/repo/project-a",
        dryRun: true,
      }),
      workflowTarget: "release-readiness",
      workflowLocator: locator,
      workflowChoices: [locator],
      inspectedRunSummary: runSummary,
      runChoices: [
        {
          runSummary,
          sessionId: "session-a",
          messageId: "assistant:run",
          source: "persisted",
        },
      ],
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo/project-a",
          tags: ["ops"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      showHelpPanel: true,
    };

    const shown = await handleChatInput({
      input: "/project",
      state: selected,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });
    const updated = await handleChatInput({
      input: "/project packages/cli",
      state: shown.state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(runWorkflow).not.toHaveBeenCalled();
    expect(shown.state.messages.at(-1)?.content).toContain("Project: /repo/project-a");
    expect(updated.state.projectRoot).toBe("/repo/packages/cli");
    expect(updated.state.workflowTarget).toBeUndefined();
    expect(updated.state.workflowLocator).toBeUndefined();
    expect(updated.state.workflowChoices).toEqual([]);
    expect(updated.state.inspectedRunSummary).toBeUndefined();
    expect(updated.state.runChoices).toBeUndefined();
    expect(updated.state.sessionChoices).toBeUndefined();
    expect(updated.state.showHelpPanel).toBeUndefined();
    expect(updated.state.messages.at(-1)?.content).toContain(
      "Project root updated: /repo/packages/cli"
    );
  });

  it("lists recent sessions from inside chat and supports tag filtering", async () => {
    vi.clearAllMocks();
    const listSessions = vi.fn(async (_tag?: string) => [
      {
        sessionId: "release-session",
        status: "ready" as const,
        cwd: "/repo",
        projectRoot: "/repo",
        tags: ["release"],
        workflowTarget: "release-readiness",
        lastRunTask: "perform the release check",
        lastRunWorkflowName: "release-readiness",
        messageCount: 5,
        updatedAt: "2026-05-24T00:00:00.000Z",
      },
    ]);
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/sessions release",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      listSessions,
    });

    expect(runWorkflow).not.toHaveBeenCalled();
    expect(listSessions).toHaveBeenCalledWith("release", undefined);
    expect(result.state.messages.at(-1)?.content).toContain("Recent sessions tagged release");
    expect(result.state.messages.at(-1)?.content).toContain("release-session");
    expect(result.state.messages.at(-1)?.content).toContain("release-readiness");
    expect(result.state.messages.at(-1)?.content).toContain("retry release-readiness");
  });

  it("keeps chat open when session listing fails", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const listSessions = vi.fn(async () => {
      throw new Error("Session store unavailable");
    });
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      inspectedRunSummary: runSummary,
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["triage"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      workflowChoices: [locator],
      showHelpPanel: true,
    };

    const result = await handleChatInput({
      input: "/sessions release",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      listSessions,
    });

    expect(listSessions).toHaveBeenCalledWith("release", undefined);
    expect(result.exit).toBe(false);
    expect(result.state.status).toBe("failed");
    expect(result.state.lastError).toBe("Session store unavailable");
    expect(result.state.inspectedRunSummary).toBeUndefined();
    expect(result.state.runChoices).toBeUndefined();
    expect(result.state.sessionChoices).toBeUndefined();
    expect(result.state.workflowChoices).toBeUndefined();
    expect(result.state.showHelpPanel).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain(
      "Session list failed: Session store unavailable"
    );
  });

  it("stores listed sessions as numbered choices and switches by number", async () => {
    const loaded = createInitialChatState({
      sessionId: "release-session",
      cwd: "/repo/old",
      projectRoot: "/repo/release",
      tags: ["release"],
      dryRun: false,
      workflowTarget: "release-readiness",
    });
    const listSessions = vi.fn(async (_tag?: string) => [
      {
        sessionId: "release-session",
        status: "ready" as const,
        cwd: "/repo/old",
        projectRoot: "/repo/release",
        tags: ["release"],
        workflowTarget: "release-readiness",
        messageCount: 3,
        updatedAt: "2026-05-24T00:00:00.000Z",
      },
    ]);
    const loadSession = vi.fn(async (_sessionId: string) => loaded);
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const listed = await handleChatInput({
      input: "/sessions release",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true, provider: "openrouter", model: "openrouter/owl-alpha" },
      listSessions,
      loadSession,
    });
    const switched = await handleChatInput({
      input: "/session 1",
      state: listed.state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true, provider: "openrouter", model: "openrouter/owl-alpha" },
      listSessions,
      loadSession,
    });

    expect(listed.state.sessionChoices?.map((session) => session.sessionId)).toEqual([
      "release-session",
    ]);
    expect(listed.state.messages.at(-1)?.content).toContain("Use /session 1");
    expect(loadSession).toHaveBeenCalledWith("release-session");
    expect(switched.state.sessionId).toBe("release-session");
    expect(switched.state.cwd).toBe("/repo");
    expect(switched.state.projectRoot).toBe("/repo/release");
    expect(switched.state.dryRun).toBe(true);
    expect(switched.state.providerName).toBe("openrouter");
    expect(switched.state.modelName).toBe("openrouter/owl-alpha");
    expect(switched.state.messages.at(-1)?.content).toContain(
      "Switched to session release-session."
    );
  });

  it("switches to a listed session by typing only the choice number", async () => {
    const loaded = createInitialChatState({
      sessionId: "release-session",
      cwd: "/repo/old",
      projectRoot: "/repo/release",
      tags: ["release"],
      dryRun: false,
      workflowTarget: "release-readiness",
    });
    const loadSession = vi.fn(async (_sessionId: string) => loaded);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      sessionChoices: [
        {
          sessionId: "release-session",
          status: "ready" as const,
          cwd: "/repo/old",
          projectRoot: "/repo/release",
          tags: ["release"],
          workflowTarget: "release-readiness",
          messageCount: 3,
          updatedAt: "2026-05-24T00:00:00.000Z",
        },
      ],
    };

    const switched = await handleChatInput({
      input: "1",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true, provider: "openrouter", model: "openrouter/owl-alpha" },
      loadSession,
    });

    expect(loadSession).toHaveBeenCalledWith("release-session");
    expect(switched.state.sessionId).toBe("release-session");
    expect(switched.state.messages.at(-1)?.content).toContain(
      "Switched to session release-session."
    );
  });

  it("preserves inspected run context when switching sessions", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const loaded = createInitialChatState({
      sessionId: "release-session",
      cwd: "/repo/old",
      projectRoot: "/repo/release",
      dryRun: false,
    });
    const loadSession = vi.fn(async (_sessionId: string) => loaded);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      inspectedRunSummary: runSummary,
      runChoices: [
        {
          runSummary,
          sessionId: "release-session",
          messageId: "assistant:run",
          source: "persisted",
        },
      ],
    };

    const switched = await handleChatInput({
      input: "/session release-session",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      loadSession,
    });

    expect(switched.state.sessionId).toBe("release-session");
    expect(switched.state.inspectedRunSummary?.executionId).toBe("exec-chat-1");
    expect(switched.state.runChoices?.[0]).toMatchObject({
      sessionId: "release-session",
      runSummary: { executionId: "exec-chat-1" },
    });
    expect(switched.state.messages.at(-1)?.content).toContain(
      "Switched to session release-session. Still showing run details exec-chat-1."
    );
  });

  it("prioritizes loaded session run choices after switching sessions", async () => {
    const currentSummary = buildWorkflowRunSummary(executionResult);
    const loadedSummary = {
      ...currentSummary,
      executionId: "exec-release-session",
      workflowName: "release-workflow",
    };
    const loaded = {
      ...createInitialChatState({
        sessionId: "release-session",
        cwd: "/repo/old",
        projectRoot: "/repo/release",
        dryRun: false,
      }),
      runChoices: [
        {
          runSummary: loadedSummary,
          sessionId: "release-session",
          messageId: "assistant:release-run",
          source: "persisted",
        },
      ],
    };
    const loadSession = vi.fn(async (_sessionId: string) => loaded);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      runChoices: [
        {
          runSummary: currentSummary,
          sessionId: "session-a",
          messageId: "assistant:current-run",
          source: "persisted",
        },
      ],
    };

    const switched = await handleChatInput({
      input: "/session release-session",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      loadSession,
    });
    const opened = await handleChatInput({
      input: "/details",
      state: switched.state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      loadSession,
    });

    expect(switched.state.runChoices?.map((choice) => choice.runSummary.executionId)).toEqual([
      "exec-release-session",
      "exec-chat-1",
    ]);
    expect(opened.state.inspectedRunSummary).toMatchObject({
      executionId: "exec-release-session",
      workflowName: "release-workflow",
    });
  });

  it("switches to a known chat session id without a numbered list", async () => {
    const loaded = createInitialChatState({
      sessionId: "known-session",
      cwd: "/repo/old",
      dryRun: false,
    });
    const loadSession = vi.fn(async (_sessionId: string) => loaded);
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/session known-session",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      loadSession,
    });

    expect(loadSession).toHaveBeenCalledWith("known-session");
    expect(result.state.sessionId).toBe("known-session");
    expect(result.state.projectRoot).toBe("/repo");
    expect(result.state.messages.at(-1)?.content).toContain("Switched to session known-session.");
    expect(result.state.messages.at(-1)?.content).not.toContain("Still showing run details");
  });

  it("reports missing chat sessions when switching by id", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const loadSession = vi.fn(async (_sessionId: string) => undefined);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      inspectedRunSummary: runSummary,
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["triage"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      workflowChoices: [locator],
      showHelpPanel: true,
    };

    const result = await handleChatInput({
      input: "/session missing-session",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      loadSession,
    });

    expect(loadSession).toHaveBeenCalledWith("missing-session");
    expect(result.state.sessionId).toBe("session-a");
    expect(result.state.inspectedRunSummary).toBeUndefined();
    expect(result.state.runChoices).toBeUndefined();
    expect(result.state.sessionChoices).toBeUndefined();
    expect(result.state.workflowChoices).toBeUndefined();
    expect(result.state.showHelpPanel).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain(
      "Chat session not found: missing-session"
    );
  });

  it("reports missing numbered session choices without loading numeric ids", async () => {
    const loadSession = vi.fn(async (_sessionId: string) => undefined);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          tags: [],
          messageCount: 1,
          updatedAt: "2026-05-24T00:00:00.000Z",
        },
      ],
    };

    const result = await handleChatInput({
      input: "/session 2",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      loadSession,
    });

    expect(loadSession).not.toHaveBeenCalled();
    expect(result.state.sessionChoices?.map((session) => session.sessionId)).toEqual([
      "session-b",
    ]);
    expect(result.state.messages.at(-1)?.content).toContain("Session choice not found.");
  });

  it("filters listed chat sessions by the current project root", async () => {
    const listSessions = vi.fn(async (_tag?: string, _projectRoot?: string) => [
      {
        sessionId: "project-session",
        status: "ready" as const,
        cwd: "/repo",
        projectRoot: "/repo/project-a",
        tags: [],
        messageCount: 2,
        updatedAt: "2026-05-24T00:00:00.000Z",
      },
    ]);
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      projectRoot: "/repo/project-a",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/sessions --project",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      listSessions,
    });

    expect(listSessions).toHaveBeenCalledWith(undefined, "/repo/project-a");
    expect(result.state.messages.at(-1)?.content).toContain(
      "Recent sessions for /repo/project-a"
    );
    expect(result.state.sessionChoices?.map((session) => session.sessionId)).toEqual([
      "project-session",
    ]);

    const shortcut = await handleChatInput({
      input: "/sessions here",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      listSessions,
    });

    expect(listSessions).toHaveBeenCalledWith(undefined, "/repo/project-a");
    expect(shortcut.state.messages.at(-1)?.content).toContain(
      "Recent sessions for /repo/project-a"
    );
  });

  it("filters listed chat sessions by an explicit project path", async () => {
    const listSessions = vi.fn(async (_tag?: string, _projectRoot?: string) => []);
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/sessions --project packages/cli",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      listSessions,
    });

    expect(listSessions).toHaveBeenCalledWith(undefined, "/repo/packages/cli");
    expect(result.state.messages.at(-1)?.content).toContain(
      "No chat sessions found for /repo/packages/cli."
    );
  });

  it("reports invalid session list options", async () => {
    const listSessions = vi.fn(async () => []);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          tags: ["release"],
          messageCount: 2,
          updatedAt: "2026-05-24T00:00:00.000Z",
        },
      ],
      showHelpPanel: true,
    };

    const result = await handleChatInput({
      input: "/sessions --unknown",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      listSessions,
    });

    expect(listSessions).not.toHaveBeenCalled();
    expect(result.state.messages.at(-1)?.content).toContain(
      "Usage: /sessions, /sessions here, /sessions <tag>, or /sessions --project [path]."
    );
    expect(result.state.sessionChoices).toBeUndefined();
    expect(result.state.showHelpPanel).toBeUndefined();
  });

  it("renames the active chat session", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const renamed = createInitialChatState({
      sessionId: "renamed-session",
      cwd: "/repo/old",
      projectRoot: "/repo/project-a",
      dryRun: false,
    });
    const renameSession = vi.fn(async (_fromSessionId: string, _toSessionId: string) => renamed);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      inspectedRunSummary: runSummary,
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["triage"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      workflowChoices: [locator],
      showHelpPanel: true,
    };

    const result = await handleChatInput({
      input: "/session rename session-a renamed-session",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      renameSession,
    });

    expect(renameSession).toHaveBeenCalledWith("session-a", "renamed-session");
    expect(result.state.sessionId).toBe("renamed-session");
    expect(result.state.cwd).toBe("/repo");
    expect(result.state.dryRun).toBe(true);
    expect(result.state.inspectedRunSummary).toBeUndefined();
    expect(result.state.runChoices).toBeUndefined();
    expect(result.state.sessionChoices).toBeUndefined();
    expect(result.state.workflowChoices).toBeUndefined();
    expect(result.state.showHelpPanel).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain(
      "Renamed session session-a to renamed-session."
    );
  });

  it("renames a listed chat session by number without switching", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const renameSession = vi.fn(async (_fromSessionId: string, toSessionId: string) =>
      createInitialChatState({
        sessionId: toSessionId,
        cwd: "/repo",
        dryRun: true,
      })
    );
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          tags: [],
          messageCount: 1,
          updatedAt: "2026-05-24T00:00:00.000Z",
        },
        {
          sessionId: "session-c",
          status: "idle" as const,
          cwd: "/repo",
          tags: ["archive"],
          messageCount: 2,
          updatedAt: "2026-05-23T00:00:00.000Z",
        },
      ],
      inspectedRunSummary: runSummary,
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      workflowChoices: [locator],
      showHelpPanel: true,
    };

    const result = await handleChatInput({
      input: "/session rename 1 session-d",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      renameSession,
    });

    expect(renameSession).toHaveBeenCalledWith("session-b", "session-d");
    expect(result.state.sessionId).toBe("session-a");
    expect(result.state.inspectedRunSummary).toBeUndefined();
    expect(result.state.runChoices).toBeUndefined();
    expect(result.state.sessionChoices?.map((session) => session.sessionId)).toEqual([
      "session-d",
      "session-c",
    ]);
    expect(result.state.workflowChoices).toBeUndefined();
    expect(result.state.showHelpPanel).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain(
      "Renamed session session-b to session-d."
    );
  });

  it("deletes a listed inactive chat session by number", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const deleteSession = vi.fn(async (_sessionId: string) => true);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          tags: [],
          messageCount: 1,
          updatedAt: "2026-05-24T00:00:00.000Z",
        },
        {
          sessionId: "session-c",
          status: "idle" as const,
          cwd: "/repo",
          tags: ["archive"],
          messageCount: 2,
          updatedAt: "2026-05-23T00:00:00.000Z",
        },
      ],
      inspectedRunSummary: runSummary,
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      workflowChoices: [locator],
      showHelpPanel: true,
    };

    const result = await handleChatInput({
      input: "/session delete 1",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      deleteSession,
    });

    expect(deleteSession).toHaveBeenCalledWith("session-b");
    expect(result.state.inspectedRunSummary).toBeUndefined();
    expect(result.state.runChoices).toBeUndefined();
    expect(result.state.sessionChoices?.map((session) => session.sessionId)).toEqual([
      "session-c",
    ]);
    expect(result.state.workflowChoices).toBeUndefined();
    expect(result.state.showHelpPanel).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain("Deleted session session-b.");
  });

  it("does not delete the active chat session", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const deleteSession = vi.fn(async (_sessionId: string) => true);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      inspectedRunSummary: runSummary,
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["triage"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      workflowChoices: [locator],
      showHelpPanel: true,
    };

    const result = await handleChatInput({
      input: "/session delete session-a",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      deleteSession,
    });

    expect(deleteSession).not.toHaveBeenCalled();
    expect(result.state.inspectedRunSummary).toBeUndefined();
    expect(result.state.runChoices).toBeUndefined();
    expect(result.state.sessionChoices).toBeUndefined();
    expect(result.state.workflowChoices).toBeUndefined();
    expect(result.state.showHelpPanel).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain("Cannot delete the active session.");
  });

  it("reports missing chat sessions when renaming by id", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const renameSession = vi.fn(async (_fromSessionId: string, _toSessionId: string) => undefined);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      inspectedRunSummary: runSummary,
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["triage"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      workflowChoices: [locator],
      showHelpPanel: true,
    };

    const result = await handleChatInput({
      input: "/session rename missing renamed",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      renameSession,
    });

    expect(renameSession).toHaveBeenCalledWith("missing", "renamed");
    expect(result.state.inspectedRunSummary).toBeUndefined();
    expect(result.state.runChoices).toBeUndefined();
    expect(result.state.sessionChoices).toBeUndefined();
    expect(result.state.workflowChoices).toBeUndefined();
    expect(result.state.showHelpPanel).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain("Chat session not found: missing");
  });

  it("reports missing numbered choices when renaming sessions", async () => {
    const renameSession = vi.fn(async (_fromSessionId: string, _toSessionId: string) => undefined);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          tags: [],
          messageCount: 1,
          updatedAt: "2026-05-24T00:00:00.000Z",
        },
      ],
    };

    const result = await handleChatInput({
      input: "/session rename 2 renamed",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      renameSession,
    });

    expect(renameSession).not.toHaveBeenCalled();
    expect(result.state.sessionChoices?.map((session) => session.sessionId)).toEqual([
      "session-b",
    ]);
    expect(result.state.messages.at(-1)?.content).toContain("Session choice not found.");
  });

  it("reports missing chat sessions when deleting by id", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const deleteSession = vi.fn(async (_sessionId: string) => false);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      inspectedRunSummary: runSummary,
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["triage"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      workflowChoices: [locator],
      showHelpPanel: true,
    };

    const result = await handleChatInput({
      input: "/session delete missing",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      deleteSession,
    });

    expect(deleteSession).toHaveBeenCalledWith("missing");
    expect(result.state.inspectedRunSummary).toBeUndefined();
    expect(result.state.runChoices).toBeUndefined();
    expect(result.state.sessionChoices).toBeUndefined();
    expect(result.state.workflowChoices).toBeUndefined();
    expect(result.state.showHelpPanel).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain("Chat session not found: missing");
  });

  it("reports missing numbered choices when deleting sessions", async () => {
    const deleteSession = vi.fn(async (_sessionId: string) => true);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          tags: [],
          messageCount: 1,
          updatedAt: "2026-05-24T00:00:00.000Z",
        },
      ],
    };

    const result = await handleChatInput({
      input: "/session delete 2",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      deleteSession,
    });

    expect(deleteSession).not.toHaveBeenCalled();
    expect(result.state.sessionChoices?.map((session) => session.sessionId)).toEqual([
      "session-b",
    ]);
    expect(result.state.messages.at(-1)?.content).toContain("Session choice not found.");
  });

  it("renames and deletes chat sessions through the default store", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "obora-chat-session-manage-"));
    const sessionStoreDir = join(cwd, ".obora", "chat", "sessions");
    await runChatSession({
      cwd,
      input: createStream(false),
      output: createStream(false),
      commandOptions: {
        once: "/tags managed",
        dryRun: true,
        session: "session-b",
      },
      resolveWorkflow,
      runWorkflow,
      sessionStoreDir,
    });
    const renamed = await handleChatInput({
      input: "/session rename session-b session-c",
      state: createInitialChatState({
        sessionId: "session-a",
        cwd,
        dryRun: true,
      }),
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });
    const deleted = await handleChatInput({
      input: "/session delete session-c",
      state: renamed.state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(renamed.state.messages.at(-1)?.content).toContain(
      "Renamed session session-b to session-c."
    );
    expect(deleted.state.messages.at(-1)?.content).toContain("Deleted session session-c.");
    await expect(readFile(join(sessionStoreDir, "session-c.json"), "utf-8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("manages sessions through runChatSession store callbacks", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "obora-chat-session-callbacks-"));
    await runChatSession({
      cwd,
      input: createStream(false),
      output: createStream(false),
      commandOptions: {
        once: "/tags managed",
        dryRun: true,
        session: "session-b",
      },
      resolveWorkflow,
      runWorkflow,
    });
    const listedByTag = await runChatSession({
      cwd,
      input: createStream(false),
      output: createStream(false),
      commandOptions: {
        once: "/sessions managed",
        dryRun: true,
        session: "session-a",
      },
      resolveWorkflow,
      runWorkflow,
    });
    const listedByProject = await runChatSession({
      cwd,
      input: createStream(false),
      output: createStream(false),
      commandOptions: {
        once: "/sessions --project",
        dryRun: true,
        session: "session-a",
      },
      resolveWorkflow,
      runWorkflow,
    });
    const renamed = await runChatSession({
      cwd,
      input: createStream(false),
      output: createStream(false),
      commandOptions: {
        once: "/session rename session-b session-c",
        dryRun: true,
        session: "session-a",
      },
      resolveWorkflow,
      runWorkflow,
    });
    const deleted = await runChatSession({
      cwd,
      input: createStream(false),
      output: createStream(false),
      commandOptions: {
        once: "/session delete session-c",
        dryRun: true,
        session: "session-a",
      },
      resolveWorkflow,
      runWorkflow,
    });

    expect(listedByTag.messages.at(-1)?.content).toContain("Recent sessions tagged managed");
    expect(listedByProject.messages.at(-1)?.content).toContain(`Recent sessions for ${cwd}`);
    expect(renamed.messages.at(-1)?.content).toContain(
      "Renamed session session-b to session-c."
    );
    expect(deleted.messages.at(-1)?.content).toContain("Deleted session session-c.");
  });

  it("lists reusable workflows from inside chat and supports scope filtering", async () => {
    const listWorkflowLocators = vi.fn(async (_scope?: "project" | "global" | "all") => [
      locator,
      {
        ...locator,
        id: "global:review",
        scope: "global" as const,
        name: "code-review",
        displayPath: "~/.obora/workflows/code-review.yaml",
        description: "Review repository changes",
        stepCount: 2,
      },
    ]);
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/workflows global",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      listWorkflowLocators,
    });

    expect(runWorkflow).not.toHaveBeenCalled();
    expect(listWorkflowLocators).toHaveBeenCalledWith("global", undefined);
    expect(result.state.workflowChoices?.map((workflow) => workflow.name)).toEqual([
      "release-readiness",
      "code-review",
    ]);
    expect(result.state.messages.at(-1)?.content).toContain("Reusable workflows (global):");
    expect(result.state.messages.at(-1)?.content).toContain("1. release-readiness");
    expect(result.state.messages.at(-1)?.content).toContain("code-review");
    expect(result.state.messages.at(-1)?.content).toContain("Review repository changes");
    expect(result.state.messages.at(-1)?.content).toContain("/workflow 1");
  });

  it("uses the session project root when listing workflows", async () => {
    const listWorkflowLocators = vi.fn(async (_scope?: "project" | "global" | "all") => [
      locator,
    ]);
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      projectRoot: "/repo/packages/cli",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/workflows project",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      listWorkflowLocators,
    });

    expect(listWorkflowLocators).toHaveBeenCalledWith("project", "/repo/packages/cli");
    expect(result.state.workflowChoices).toEqual([locator]);
  });

  it("keeps chat open when workflow listing fails", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const listWorkflowLocators = vi.fn(async () => {
      throw "Workflow discovery failed";
    });
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        projectRoot: "/repo/packages/cli",
        dryRun: true,
      }),
      inspectedRunSummary: runSummary,
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["triage"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      workflowChoices: [locator],
      showHelpPanel: true,
    };

    const result = await handleChatInput({
      input: "/workflows project",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      listWorkflowLocators,
    });

    expect(listWorkflowLocators).toHaveBeenCalledWith("project", "/repo/packages/cli");
    expect(result.exit).toBe(false);
    expect(result.state.status).toBe("failed");
    expect(result.state.lastError).toBe("Workflow discovery failed");
    expect(result.state.inspectedRunSummary).toBeUndefined();
    expect(result.state.runChoices).toBeUndefined();
    expect(result.state.sessionChoices).toBeUndefined();
    expect(result.state.workflowChoices).toBeUndefined();
    expect(result.state.showHelpPanel).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain(
      "Workflow list failed: Workflow discovery failed"
    );
  });

  it("selects a workflow by number from the latest workflow list", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const listed = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      workflowChoices: [locator, codeReviewLocator],
      inspectedRunSummary: runSummary,
      runChoices: [
        {
          runSummary,
          sessionId: "session-a",
          messageId: "assistant:run",
          source: "persisted",
        },
      ],
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["ops"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      showHelpPanel: true,
    };

    const result = await handleChatInput({
      input: "/workflow 2",
      state: listed,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(resolveWorkflow).not.toHaveBeenCalled();
    expect(result.state.workflowTarget).toBe("code-review");
    expect(result.state.workflowLocator).toBe(codeReviewLocator);
    expect(result.state.workflowChoices).toBeUndefined();
    expect(result.state.inspectedRunSummary).toBeUndefined();
    expect(result.state.runChoices).toBeUndefined();
    expect(result.state.sessionChoices).toBeUndefined();
    expect(result.state.showHelpPanel).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain("Selected workflow code-review");
  });

  it("selects a listed workflow by typing only the choice number", async () => {
    const listed = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      workflowChoices: [locator, codeReviewLocator],
    };

    const result = await handleChatInput({
      input: "2",
      state: listed,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(resolveWorkflow).not.toHaveBeenCalled();
    expect(result.state.workflowTarget).toBe("code-review");
    expect(result.state.workflowLocator).toBe(codeReviewLocator);
    expect(result.state.workflowChoices).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain("Selected workflow code-review");
  });

  it("keeps listed workflow choices when a numbered workflow choice is missing", async () => {
    vi.clearAllMocks();
    const listed = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      workflowChoices: [locator],
    };

    const result = await handleChatInput({
      input: "/workflow 2",
      state: listed,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(resolveWorkflow).not.toHaveBeenCalled();
    expect(result.state.workflowChoices).toEqual([locator]);
    expect(result.state.messages.at(-1)?.content).toContain("Workflow choice not found.");
  });

  it("resolves workflow names against the session project root", async () => {
    vi.clearAllMocks();
    const resolveWorkflowForProject = vi.fn(async (_target: string, _projectRoot?: string) => locator);
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      projectRoot: "/repo/packages/cli",
      dryRun: true,
    });

    await handleChatInput({
      input: "/workflow release-readiness",
      state,
      resolveWorkflow: resolveWorkflowForProject,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(resolveWorkflowForProject).toHaveBeenCalledWith(
      "release-readiness",
      "/repo/packages/cli"
    );
  });

  it("keeps chat open when workflow selection resolution fails", async () => {
    vi.clearAllMocks();
    const runSummary = buildWorkflowRunSummary(executionResult);
    const resolveWorkflowFailure = vi.fn(async () => {
      throw new Error("Workflow not found: missing-workflow");
    });
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      inspectedRunSummary: runSummary,
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["triage"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      workflowChoices: [locator],
      showHelpPanel: true,
    };

    const result = await handleChatInput({
      input: "/workflow missing-workflow",
      state,
      resolveWorkflow: resolveWorkflowFailure,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(resolveWorkflowFailure).toHaveBeenCalledWith("missing-workflow", undefined);
    expect(runWorkflow).not.toHaveBeenCalled();
    expect(result.exit).toBe(false);
    expect(result.state.status).toBe("failed");
    expect(result.state.lastError).toBe("Workflow not found: missing-workflow");
    expect(result.state.inspectedRunSummary).toBeUndefined();
    expect(result.state.runChoices).toBeUndefined();
    expect(result.state.sessionChoices).toBeUndefined();
    expect(result.state.workflowChoices).toBeUndefined();
    expect(result.state.showHelpPanel).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain(
      "Workflow resolve failed: Workflow not found: missing-workflow"
    );
  });

  it("runs a workflow by number from the latest workflow list", async () => {
    vi.clearAllMocks();
    const listed = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      workflowChoices: [locator, codeReviewLocator],
    };

    const result = await handleChatInput({
      input: "/run #2 inspect the branch",
      state: listed,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(resolveWorkflow).not.toHaveBeenCalled();
    expect(runWorkflow).toHaveBeenCalledWith(
      codeReviewLocator.path,
      expect.objectContaining({
        input: expect.stringContaining("inspect the branch"),
      })
    );
    expect(result.state.workflowLocator).toBeUndefined();
    expect(result.state.lastRunCommand).toBe("obora run .obora/workflows/code-review.yaml");
  });

  it("shows the current workflow and numbered choices when /workflow has no argument", async () => {
    vi.clearAllMocks();
    const listed = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      workflowTarget: "release-readiness",
      workflowLocator: locator,
      workflowChoices: [locator, codeReviewLocator],
    };

    const result = await handleChatInput({
      input: "/workflow",
      state: listed,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(resolveWorkflow).not.toHaveBeenCalled();
    expect(runWorkflow).not.toHaveBeenCalled();
    expect(result.state.messages.at(-1)?.content).toContain(
      "Current workflow: release-readiness (project)"
    );
    expect(result.state.messages.at(-1)?.content).toContain("1. release-readiness");
    expect(result.state.messages.at(-1)?.content).toContain("2. code-review");
  });

  it("guides users to list workflows when /workflow has no choices", async () => {
    vi.clearAllMocks();
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/workflow",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(resolveWorkflow).not.toHaveBeenCalled();
    expect(result.state.messages.at(-1)?.content).toContain("No workflow selected.");
    expect(result.state.messages.at(-1)?.content).toContain("Run /workflows first");
  });

  it("does not run empty /run commands", async () => {
    vi.clearAllMocks();
    const runSummary = buildWorkflowRunSummary(executionResult);
    const selected = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      workflowLocator: locator,
      inspectedRunSummary: runSummary,
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["triage"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      workflowChoices: [locator],
      showHelpPanel: true,
      status: "ready" as const,
    };

    const result = await handleChatInput({
      input: "/run",
      state: selected,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(runWorkflow).not.toHaveBeenCalled();
    expect(result.state.inspectedRunSummary).toBeUndefined();
    expect(result.state.runChoices).toBeUndefined();
    expect(result.state.sessionChoices).toBeUndefined();
    expect(result.state.workflowChoices).toBeUndefined();
    expect(result.state.showHelpPanel).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain("Usage: /run <task>");
  });

  it("closes open panels when running a numbered workflow choice", async () => {
    const runWorkflowWithResult = vi.fn(async () => executionResult);
    const runSummary = buildWorkflowRunSummary(executionResult);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: false,
      }),
      workflowChoices: [locator, codeReviewLocator],
      inspectedRunSummary: runSummary,
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["triage"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      showHelpPanel: true,
    };

    const result = await handleChatInput({
      input: "/run #1 inspect the branch",
      state,
      resolveWorkflow,
      runWorkflow: runWorkflowWithResult,
      commandOptions: { provider: "openrouter", model: "openrouter/owl-alpha" },
    });

    expect(runWorkflowWithResult).toHaveBeenCalledOnce();
    expect(result.state.lastRunSummary?.executionId).toBe("exec-chat-1");
    expect(result.state.inspectedRunSummary).toBeUndefined();
    expect(result.state.runChoices).toBeUndefined();
    expect(result.state.sessionChoices).toBeUndefined();
    expect(result.state.workflowChoices).toBeUndefined();
    expect(result.state.showHelpPanel).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain("Workflow completed");
  });

  it("reports missing numbered workflow choices clearly", async () => {
    vi.clearAllMocks();
    const runSummary = buildWorkflowRunSummary(executionResult);
    const state = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: true,
      }),
      inspectedRunSummary: runSummary,
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["triage"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      workflowChoices: [locator],
      showHelpPanel: true,
    };

    const result = await handleChatInput({
      input: "/run #2 inspect the branch",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(runWorkflow).not.toHaveBeenCalled();
    expect(result.state.inspectedRunSummary).toBeUndefined();
    expect(result.state.runChoices).toBeUndefined();
    expect(result.state.sessionChoices).toBeUndefined();
    expect(result.state.workflowChoices).toEqual([locator]);
    expect(result.state.showHelpPanel).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain("Workflow choice not found");
  });

  it("reports when no reusable workflows are available inside chat", async () => {
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/workflows project",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      listWorkflowLocators: vi.fn(async () => []),
    });

    expect(result.state.messages.at(-1)?.content).toContain(
      "No reusable workflows found for project."
    );
  });

  it("lists reusable workflows with the current chat scope when no scope is provided", async () => {
    const listWorkflowLocators = vi.fn(async (_scope?: "project" | "global" | "all") => [
      locator,
    ]);
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/workflows",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true, scope: "project" },
      listWorkflowLocators,
    });

    expect(listWorkflowLocators).toHaveBeenCalledWith("project", undefined);
    expect(result.state.messages.at(-1)?.content).toContain("Reusable workflows (project):");
    expect(result.state.messages.at(-1)?.content).toContain("release-readiness");
  });

  it("lists workflows from the default discovery path with the session project root", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "obora-chat-workflows-command-"));
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd,
      projectRoot: join(cwd, "packages", "cli"),
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/workflows project",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(result.state.workflowChoices).toEqual([]);
    expect(result.state.messages.at(-1)?.content).toContain(
      "No reusable workflows found for project."
    );
  });

  it("reports empty workflow lists without a scope label", async () => {
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/workflows",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      listWorkflowLocators: vi.fn(async () => []),
    });

    expect(result.state.messages.at(-1)?.content).toContain("No reusable workflows found.");
  });

  it("reports when no chat sessions are available inside chat", async () => {
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/sessions",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      listSessions: vi.fn(async () => []),
    });

    expect(result.state.messages.at(-1)?.content).toContain("No chat sessions found.");
  });

  it("lists recent unfiltered sessions from inside chat", async () => {
    const listSessions = vi.fn(async () => [
      {
        sessionId: "untagged-session",
        status: "completed" as const,
        cwd: "/repo",
        tags: [],
        messageCount: 1,
        updatedAt: "2026-05-24T00:00:00.000Z",
      },
    ]);
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/sessions",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      listSessions,
    });

    expect(listSessions).toHaveBeenCalledWith(undefined, undefined);
    expect(result.state.messages.at(-1)?.content).toContain("Recent sessions:");
    expect(result.state.messages.at(-1)?.content).toContain("untagged-session");
    expect(result.state.messages.at(-1)?.content).toContain("no workflow");
    expect(result.state.messages.at(-1)?.content).toContain("untagged");
  });

  it("reports when no tagged chat sessions are available inside chat", async () => {
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd: "/repo",
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/sessions release",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
      listSessions: vi.fn(async () => []),
    });

    expect(result.state.messages.at(-1)?.content).toContain(
      "No chat sessions found tagged release."
    );
  });

  it("lists sessions from the default store when no list function is injected", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "obora-chat-sessions-command-"));
    const state = createInitialChatState({
      sessionId: "session-a",
      cwd,
      dryRun: true,
    });

    const result = await handleChatInput({
      input: "/sessions",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(result.state.messages.at(-1)?.content).toContain("No chat sessions found.");
  });

  it("retries transient provider failures before returning the chat run summary", async () => {
    const flakyRunWorkflow = vi
      .fn<typeof runWorkflow>()
      .mockRejectedValueOnce(new Error("Provider returned error"))
      .mockResolvedValueOnce(executionResult);
    const selected = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: false,
      }),
      workflowLocator: locator,
      status: "ready" as const,
    };

    const result = await handleChatInput({
      input: "perform the release check",
      state: selected,
      resolveWorkflow,
      runWorkflow: flakyRunWorkflow,
      commandOptions: { provider: "openrouter", model: "openrouter/owl-alpha" },
    });

    expect(flakyRunWorkflow).toHaveBeenCalledTimes(2);
    expect(result.state.status).toBe("ready");
    expect(result.state.lastRunSummary).toMatchObject({
      executionId: "exec-chat-1",
      status: "completed",
    });
    expect(result.state.messages.at(-1)?.content).toContain(
      "Workflow completed: 2/2 steps completed."
    );
  });

  it("keeps the chat session open when a workflow run fails", async () => {
    const failingRunWorkflow = vi.fn(async () => {
      throw new Error("Permanent execution failure");
    });
    const selected = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: false,
      }),
      workflowLocator: locator,
      status: "ready" as const,
    };

    const result = await handleChatInput({
      input: "execute a live smoke task",
      state: selected,
      resolveWorkflow,
      runWorkflow: failingRunWorkflow,
      commandOptions: {
        model: "openrouter/owl-alpha",
      },
    });

    expect(failingRunWorkflow).toHaveBeenCalledOnce();
    expect(result.exit).toBe(false);
    expect(result.state.status).toBe("failed");
    expect(result.state.lastError).toBe("Permanent execution failure");
    expect(result.state.lastRunCommand).toBe("obora run .obora/workflows/release-readiness.yaml");
    expect(result.state.messages.at(-1)?.content).toContain(
      "Workflow run failed: Permanent execution failure"
    );
  });

  it("formats string workflow failures without closing the session", async () => {
    const failingRunWorkflow = vi.fn(() => Promise.reject("provider string failure"));
    const selected = {
      ...createInitialChatState({
        sessionId: "session-a",
        cwd: "/repo",
        dryRun: false,
      }),
      workflowLocator: locator,
      status: "ready" as const,
    };

    const result = await handleChatInput({
      input: "execute a live smoke task",
      state: selected,
      resolveWorkflow,
      runWorkflow: failingRunWorkflow,
      commandOptions: {},
    });

    expect(result.exit).toBe(false);
    expect(result.state.lastError).toBe("provider string failure");
    expect(result.state.messages.at(-1)?.content).toContain(
      "Workflow run failed: provider string failure"
    );
  });

  it("requires workflow selection before running a task", async () => {
    const runSummary = buildWorkflowRunSummary(executionResult);
    const state = {
      ...createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true }),
      inspectedRunSummary: runSummary,
      runChoices: chatRunChoicesFromSummaries([runSummary], "session-a"),
      sessionChoices: [
        {
          sessionId: "session-b",
          status: "ready" as const,
          cwd: "/repo",
          projectRoot: "/repo",
          tags: ["triage"],
          workflowTarget: "release-readiness",
          messageCount: 4,
          updatedAt: "2026-05-22T00:00:00.000Z",
        },
      ],
      workflowChoices: [locator],
      showHelpPanel: true,
    };

    const result = await handleChatInput({
      input: "do work",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

    expect(result.state.inspectedRunSummary).toBeUndefined();
    expect(result.state.runChoices).toBeUndefined();
    expect(result.state.sessionChoices).toBeUndefined();
    expect(result.state.workflowChoices).toBeUndefined();
    expect(result.state.showHelpPanel).toBeUndefined();
    expect(result.state.messages.at(-1)?.content).toContain("Select a workflow first");
  });

  it("runs a one-shot TUI session without requiring interactive stdin", async () => {
    vi.clearAllMocks();
    const sessionStoreDir = await mkdtemp(join(tmpdir(), "obora-chat-session-"));
    const finalState = await runChatSession({
      cwd: "/repo",
      input: createStream(false),
      output: createStream(false),
      commandOptions: {
        workflow: "release-readiness",
        once: "prepare release notes",
        dryRun: true,
        session: "session-a",
        project: "/repo",
        tags: "release,smoke",
      },
      resolveWorkflow,
      runWorkflow,
      sessionStoreDir,
    });

    expect(finalState.status).toBe("ready");
    expect(finalState.workflowLocator).toBe(locator);
    expect(finalState.projectRoot).toBe("/repo");
    expect(finalState.tags).toEqual(["release", "smoke"]);
    expect(runWorkflow).toHaveBeenCalledOnce();
    await expect(readFile(join(sessionStoreDir, "session-a.json"), "utf-8")).resolves.toContain(
      '"sessionId": "session-a"'
    );
  });

  it("restores a persisted chat session when --session is reused", async () => {
    vi.clearAllMocks();
    const sessionStoreDir = await mkdtemp(join(tmpdir(), "obora-chat-session-"));
    await runChatSession({
      cwd: "/repo",
      input: createStream(false),
      output: createStream(false),
      commandOptions: {
        workflow: "release-readiness",
        once: "prepare release notes",
        dryRun: true,
        session: "session-a",
      },
      resolveWorkflow,
      runWorkflow,
      sessionStoreDir,
    });

    const finalState = await runChatSession({
      cwd: "/repo",
      input: createStream(false),
      output: createStream(false),
      commandOptions: {
        once: "continue from the same session",
        dryRun: true,
        session: "session-a",
      },
      resolveWorkflow,
      runWorkflow,
      sessionStoreDir,
    });

    expect(finalState.workflowLocator).toBeDefined();
    expect(finalState.messages.map((message) => message.content)).toEqual(
      expect.arrayContaining(["prepare release notes", "continue from the same session"])
    );
    expect(runWorkflow).toHaveBeenCalledTimes(2);
  });

  it("preserves a chat-updated project root when a session is reused", async () => {
    vi.clearAllMocks();
    const sessionStoreDir = await mkdtemp(join(tmpdir(), "obora-chat-session-"));
    await runChatSession({
      cwd: "/repo",
      input: createStream(false),
      output: createStream(false),
      commandOptions: {
        once: "/project packages/cli",
        dryRun: true,
        session: "session-a",
      },
      resolveWorkflow,
      runWorkflow,
      sessionStoreDir,
    });

    const finalState = await runChatSession({
      cwd: "/repo",
      input: createStream(false),
      output: createStream(false),
      commandOptions: {
        once: "/session",
        dryRun: true,
        session: "session-a",
      },
      resolveWorkflow,
      runWorkflow,
      sessionStoreDir,
    });

    expect(finalState.projectRoot).toBe("/repo/packages/cli");
    expect(finalState.messages.at(-1)?.content).toContain("Project: /repo/packages/cli");
  });

  it("allows --project to override a restored chat project root", async () => {
    vi.clearAllMocks();
    const sessionStoreDir = await mkdtemp(join(tmpdir(), "obora-chat-session-"));
    await runChatSession({
      cwd: "/repo",
      input: createStream(false),
      output: createStream(false),
      commandOptions: {
        once: "/project packages/cli",
        dryRun: true,
        session: "session-a",
      },
      resolveWorkflow,
      runWorkflow,
      sessionStoreDir,
    });

    const finalState = await runChatSession({
      cwd: "/repo",
      input: createStream(false),
      output: createStream(false),
      commandOptions: {
        once: "/session",
        dryRun: true,
        session: "session-a",
        project: "/repo/other-project",
      },
      resolveWorkflow,
      runWorkflow,
      sessionStoreDir,
    });

    expect(finalState.projectRoot).toBe("/repo/other-project");
    expect(finalState.messages.at(-1)?.content).toContain("Project: /repo/other-project");
  });

  it("runs a one-shot session without a workflow and asks the user to select one", async () => {
    vi.clearAllMocks();
    const sessionStoreDir = await mkdtemp(join(tmpdir(), "obora-chat-session-"));
    const finalState = await runChatSession({
      cwd: "/repo",
      input: createStream(false),
      output: createStream(false),
      commandOptions: {
        once: "prepare release notes",
        dryRun: true,
        session: "session-a",
      },
      resolveWorkflow,
      runWorkflow,
      sessionStoreDir,
    });

    expect(runWorkflow).not.toHaveBeenCalled();
    expect(finalState.messages.at(-1)?.content).toContain("Select a workflow first");
  });

  it("opens persisted run details during a one-shot session", async () => {
    const sessionStoreDir = await mkdtemp(join(tmpdir(), "obora-chat-session-"));
    const historyState = {
      ...createInitialChatState({
        sessionId: "history-session",
        cwd: "/repo",
        dryRun: true,
      }),
      messages: [
        {
          id: "assistant:run",
          role: "assistant" as const,
          content: "Workflow completed.",
          createdAt: "2026-05-21T00:00:02.000Z",
          runSummary: buildWorkflowRunSummary(executionResult),
        },
      ],
    };
    await mkdir(sessionStoreDir, { recursive: true });
    await writeFile(
      join(sessionStoreDir, "history-session.json"),
      JSON.stringify(
        {
          schemaVersion: 1,
          updatedAt: "2026-05-21T00:00:03.000Z",
          state: historyState,
        },
        null,
        2
      ),
      "utf-8"
    );

    const finalState = await runChatSession({
      cwd: "/repo",
      input: createStream(false),
      output: createStream(false),
      commandOptions: {
        once: "/details exec-chat-1",
        dryRun: true,
        session: "active-session",
      },
      resolveWorkflow,
      runWorkflow,
      sessionStoreDir,
    });

    expect(finalState.inspectedRunSummary?.executionId).toBe("exec-chat-1");
    expect(finalState.messages.at(-1)?.content).toContain("Opened run details exec-chat-1.");
  });

  it("supports an interactive TTY session that exits from user input", async () => {
    const input = createStream(true);
    const output = createStream(true);
    const sessionStoreDir = await mkdtemp(join(tmpdir(), "obora-chat-session-"));
    const session = runChatSession({
      cwd: "/repo",
      input,
      output,
      commandOptions: { dryRun: true, session: "session-a" },
      resolveWorkflow,
      runWorkflow,
      sessionStoreDir,
    });

    input.end("/exit\n");

    await expect(session).resolves.toEqual(
      expect.objectContaining({
        status: "completed",
      })
    );
  });

  it("rejects non-TTY interactive sessions without --once", async () => {
    await expect(
      runChatSession({
        cwd: "/repo",
        input: createStream(false),
        output: createStream(false),
        commandOptions: { workflow: "release-readiness", dryRun: true },
        resolveWorkflow,
        runWorkflow,
      })
    ).rejects.toThrow("Interactive chat requires a TTY");
  });
});
