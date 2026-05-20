import { createInterface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";

import type { WorkflowLocator, WorkflowResolveScope } from "@obora/sdk";

import { runRun } from "../commands/run.js";
import { CLIError } from "../utils/cli-error.js";
import { ExitCode } from "../utils/exit-codes.js";
import {
  appendChatMessage,
  createChatMessage,
  createInitialChatState,
  setChatStatus,
} from "./state.js";
import { ChatTuiController } from "./tui.js";
import type { ChatCommandOptions, ChatSessionState } from "./types.js";
import {
  createChatRunInput,
  parseChatTimeout,
  parseChatWorkflowScope,
  resolveChatWorkflow,
} from "./workflow.js";

export interface ChatSessionRuntimeOptions {
  readonly cwd: string;
  readonly input: Readable & { readonly isTTY?: boolean };
  readonly output: Writable & { readonly isTTY?: boolean };
  readonly commandOptions: ChatCommandOptions;
  readonly runWorkflow?: typeof runRun;
  readonly resolveWorkflow?: (target: string) => Promise<WorkflowLocator>;
}

interface ChatTurnResult {
  readonly state: ChatSessionState;
  readonly exit: boolean;
}

const chatHelp =
  "Commands: /workflow <name-or-path> selects a reusable workflow, /run <task> runs the current workflow, /exit quits.";

const isExitCommand = (input: string): boolean => input === "/exit" || input === "/quit";

const workflowTargetFromCommand = (input: string): string | undefined =>
  input.startsWith("/workflow ") ? input.slice("/workflow ".length).trim() : undefined;

const messageFromInput = (input: string): string =>
  input.startsWith("/run ") ? input.slice("/run ".length).trim() : input;

const commandRunOptions = (options: ChatCommandOptions): Record<string, unknown> => ({
  dryRun: Boolean(options.dryRun),
  quiet: true,
  ...(options.provider ? { provider: options.provider } : {}),
  ...(options.model ? { model: options.model } : {}),
  ...(options.config ? { config: options.config } : {}),
  ...(options.agents ? { agents: options.agents } : {}),
  ...(options.policy ? { policy: options.policy } : {}),
  ...(options.timeout ? { timeout: parseChatTimeout(options.timeout) } : {}),
});

const appendAssistant = (state: ChatSessionState, content: string): ChatSessionState =>
  appendChatMessage(state, createChatMessage("assistant", content));

const appendSystem = (state: ChatSessionState, content: string): ChatSessionState =>
  appendChatMessage(state, createChatMessage("system", content));

const withResolvedWorkflow = (
  state: ChatSessionState,
  workflowTarget: string,
  workflowLocator: WorkflowLocator
): ChatSessionState => ({
  ...state,
  workflowTarget,
  workflowLocator,
  status: "ready",
  lastError: undefined,
});

const resolveWorkflowForSession =
  (options: ChatSessionRuntimeOptions, scope: WorkflowResolveScope | undefined) =>
  async (target: string): Promise<WorkflowLocator> =>
    options.resolveWorkflow
      ? options.resolveWorkflow(target)
      : resolveChatWorkflow({
          target,
          cwd: options.cwd,
          scope,
          projectRoot: options.commandOptions.project,
          globalWorkflowDir: options.commandOptions.globalWorkflowsDir,
        });

export const handleChatInput = async ({
  input,
  state,
  resolveWorkflow,
  runWorkflow,
  commandOptions,
}: {
  readonly input: string;
  readonly state: ChatSessionState;
  readonly resolveWorkflow: (target: string) => Promise<WorkflowLocator>;
  readonly runWorkflow: typeof runRun;
  readonly commandOptions: ChatCommandOptions;
}): Promise<ChatTurnResult> => {
  const trimmed = input.trim();

  if (!trimmed) {
    return { state, exit: false };
  }

  if (isExitCommand(trimmed)) {
    return {
      state: appendSystem(setChatStatus(state, "completed"), "Chat session closed."),
      exit: true,
    };
  }

  if (trimmed === "/help") {
    return { state: appendAssistant(state, chatHelp), exit: false };
  }

  const workflowTarget = workflowTargetFromCommand(trimmed);
  if (workflowTarget) {
    const resolvingState = setChatStatus(state, "resolving");
    const locator = await resolveWorkflow(workflowTarget);
    return {
      state: appendAssistant(
        withResolvedWorkflow(resolvingState, workflowTarget, locator),
        `Selected workflow ${locator.name} (${locator.scope}).`
      ),
      exit: false,
    };
  }

  if (!state.workflowLocator) {
    return {
      state: appendAssistant(state, "Select a workflow first with /workflow <name-or-path>."),
      exit: false,
    };
  }

  const message = messageFromInput(trimmed);
  const userState = appendChatMessage(state, createChatMessage("user", message));
  const runningState = setChatStatus(userState, "running");
  const runInput = createChatRunInput({
    message,
    sessionId: state.sessionId,
    workflowName: state.workflowLocator.name,
    workflowPath: state.workflowLocator.path,
  });
  await runWorkflow(state.workflowLocator.path, {
    ...commandRunOptions(commandOptions),
    input: runInput,
  });

  return {
    state: appendAssistant(
      {
        ...setChatStatus(runningState, "ready"),
        lastRunCommand: `obora run ${state.workflowLocator.displayPath}`,
      },
      commandOptions.dryRun
        ? "Dry-run completed. The workflow accepted this chat task."
        : "Workflow run completed for this chat task."
    ),
    exit: false,
  };
};

const promptLoop = async ({
  reader,
  state,
  tui,
  resolveWorkflow,
  runWorkflow,
  commandOptions,
}: {
  readonly reader: { question: (query: string) => Promise<string> };
  readonly state: ChatSessionState;
  readonly tui: ChatTuiController;
  readonly resolveWorkflow: (target: string) => Promise<WorkflowLocator>;
  readonly runWorkflow: typeof runRun;
  readonly commandOptions: ChatCommandOptions;
}): Promise<ChatSessionState> => {
  const input = await reader.question("> ");
  const result = await handleChatInput({
    input,
    state,
    resolveWorkflow,
    runWorkflow,
    commandOptions,
  });
  tui.update(result.state);
  return result.exit || tui.isAbortRequested()
    ? result.state
    : promptLoop({
        reader,
        state: result.state,
        tui,
        resolveWorkflow,
        runWorkflow,
        commandOptions,
      });
};

const resolveInitialWorkflow = async ({
  state,
  target,
  resolveWorkflow,
}: {
  readonly state: ChatSessionState;
  readonly target: string | undefined;
  readonly resolveWorkflow: (target: string) => Promise<WorkflowLocator>;
}): Promise<ChatSessionState> => {
  if (!target) return state;
  const locator = await resolveWorkflow(target);
  return appendAssistant(
    withResolvedWorkflow(setChatStatus(state, "resolving"), target, locator),
    `Selected workflow ${locator.name} (${locator.scope}).`
  );
};

export const runChatSession = async (
  options: ChatSessionRuntimeOptions
): Promise<ChatSessionState> => {
  const scope = parseChatWorkflowScope(options.commandOptions.scope);
  const resolveWorkflow = resolveWorkflowForSession(options, scope);
  const runWorkflow = options.runWorkflow ?? runRun;
  const initialState = createInitialChatState({
    sessionId: options.commandOptions.session ?? `chat-${Date.now()}`,
    cwd: options.cwd,
    dryRun: Boolean(options.commandOptions.dryRun),
    workflowTarget: options.commandOptions.workflow,
  });
  const tui = new ChatTuiController(initialState);
  await tui.start();
  const resolvedState = await resolveInitialWorkflow({
    state: initialState,
    target: options.commandOptions.workflow,
    resolveWorkflow,
  });
  tui.update(resolvedState);

  if (options.commandOptions.once) {
    const result = await handleChatInput({
      input: options.commandOptions.once,
      state: resolvedState,
      resolveWorkflow,
      runWorkflow,
      commandOptions: options.commandOptions,
    });
    tui.update(result.state);
    await tui.stop();
    return result.state;
  }

  if (!options.input.isTTY || !options.output.isTTY) {
    await tui.stop();
    throw new CLIError(
      "Interactive chat requires a TTY. Use --once <message> for automation.",
      ExitCode.CLI_ERROR
    );
  }

  const reader = createInterface({ input: options.input, output: options.output });

  return promptLoop({
    reader,
    state: resolvedState,
    tui,
    resolveWorkflow,
    runWorkflow,
    commandOptions: options.commandOptions,
  }).finally(() => {
    reader.close();
    return tui.stop();
  });
};
