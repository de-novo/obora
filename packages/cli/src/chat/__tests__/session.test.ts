import type { RuntimeExecution, WorkflowLocator } from "@obora/sdk";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";

import { createInitialChatState } from "../state.js";
import { handleChatInput, runChatSession } from "../session.js";

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
const resolveWorkflow = vi.fn(async (_target: string) => locator);

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
    expect(help.state.messages.at(-1)?.content).toContain("Commands:");

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
    expect(result.state.messages.at(-1)?.content).toContain("Workflow run completed");
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
    expect(lastMessage?.content).toContain("Workflow completed: 2/2 steps completed.");
    expect(lastMessage?.runSummary?.steps[0]).toMatchObject({
      name: "collect",
      model: "openrouter/owl-alpha",
      artifacts: ["release-notes.md"],
    });
  });

  it("shows step-level run details from the current chat session", async () => {
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
    expect(content).toContain("Run details exec-chat-1");
    expect(content).toContain("collect: completed");
    expect(content).toContain("openrouter/owl-alpha");
    expect(content).toContain("tools: file_read");
    expect(content).toContain("artifacts: release-notes.md");
    expect(content).toContain("decisions: Use release notes");
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
      state: shown.state,
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
    expect(updated.state.messages.at(-1)?.content).toContain("Session tags updated: release, qa");
    expect(cleared.state.tags).toEqual([]);
    expect(cleared.state.messages.at(-1)?.content).toContain("Session tags updated: none");
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
    expect(listSessions).toHaveBeenCalledWith("release");
    expect(result.state.messages.at(-1)?.content).toContain("Recent sessions tagged release");
    expect(result.state.messages.at(-1)?.content).toContain("release-session");
    expect(result.state.messages.at(-1)?.content).toContain("release-readiness");
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
    expect(listWorkflowLocators).toHaveBeenCalledWith("global");
    expect(result.state.messages.at(-1)?.content).toContain("Reusable workflows (global):");
    expect(result.state.messages.at(-1)?.content).toContain("code-review");
    expect(result.state.messages.at(-1)?.content).toContain("Review repository changes");
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

    expect(listWorkflowLocators).toHaveBeenCalledWith("project");
    expect(result.state.messages.at(-1)?.content).toContain("Reusable workflows (project):");
    expect(result.state.messages.at(-1)?.content).toContain("release-readiness");
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

    expect(listSessions).toHaveBeenCalledWith(undefined);
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
    const state = createInitialChatState({ sessionId: "session-a", cwd: "/repo", dryRun: true });

    const result = await handleChatInput({
      input: "do work",
      state,
      resolveWorkflow,
      runWorkflow,
      commandOptions: { dryRun: true },
    });

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
