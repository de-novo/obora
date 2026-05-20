import type { WorkflowLocator } from "@obora/sdk";
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
      commandOptions: { dryRun: true, model: "deepseek/deepseek-v4-flash:free" },
    });

    expect(runWorkflow).toHaveBeenCalledWith(
      locator.path,
      expect.objectContaining({
        dryRun: true,
        quiet: true,
        model: "deepseek/deepseek-v4-flash:free",
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
        model: "deepseek/deepseek-v4-flash:free",
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
        model: "deepseek/deepseek-v4-flash:free",
        config: "/repo/.obora/config.yaml",
        agents: "/repo/agents.yaml",
        policy: "/repo/policy.yaml",
        timeout: 2500,
        input: expect.stringContaining("perform the release check"),
      })
    );
    expect(result.state.messages.at(-1)?.content).toContain("Workflow run completed");
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
    const finalState = await runChatSession({
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
    });

    expect(finalState.status).toBe("ready");
    expect(finalState.workflowLocator).toBe(locator);
    expect(runWorkflow).toHaveBeenCalledOnce();
  });

  it("runs a one-shot session without a workflow and asks the user to select one", async () => {
    vi.clearAllMocks();
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
    });

    expect(runWorkflow).not.toHaveBeenCalled();
    expect(finalState.messages.at(-1)?.content).toContain("Select a workflow first");
  });

  it("supports an interactive TTY session that exits from user input", async () => {
    const input = createStream(true);
    const output = createStream(true);
    const session = runChatSession({
      cwd: "/repo",
      input,
      output,
      commandOptions: { dryRun: true, session: "session-a" },
      resolveWorkflow,
      runWorkflow,
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
