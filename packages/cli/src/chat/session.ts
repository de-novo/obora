import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import type { Readable, Writable } from "node:stream";

import { buildWorkflowRunSummary } from "@obora/sdk";
import type {
  WorkflowLocator,
  WorkflowResolveScope,
  WorkflowRunStepSummary,
  WorkflowRunSummary,
} from "@obora/sdk";

import { runRun } from "../commands/run.js";
import { CLIError } from "../utils/cli-error.js";
import { ExitCode } from "../utils/exit-codes.js";
import {
  appendChatMessage,
  createChatMessage,
  createInitialChatState,
  setChatStatus,
} from "./state.js";
import {
  listChatSessionSummaries,
  loadChatSessionState,
  saveChatSessionState,
} from "./store.js";
import type { ChatSessionSummary } from "./store.js";
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
  readonly sessionStoreDir?: string;
}

interface ChatTurnResult {
  readonly state: ChatSessionState;
  readonly exit: boolean;
}

const chatHelp =
  "Commands: /workflow <name-or-path> selects a reusable workflow, /run <task> runs the current workflow, /details <executionId> shows step results, /sessions [tag] lists recent sessions, /tags [a,b] shows or updates session tags, /exit quits.";

const isExitCommand = (input: string): boolean => input === "/exit" || input === "/quit";

const workflowTargetFromCommand = (input: string): string | undefined =>
  input.startsWith("/workflow ") ? input.slice("/workflow ".length).trim() : undefined;

const detailsTargetFromCommand = (input: string): string | undefined =>
  input.startsWith("/details ") ? input.slice("/details ".length).trim() : undefined;

const tagsTargetFromCommand = (input: string): string | undefined =>
  input.startsWith("/tags ") ? input.slice("/tags ".length).trim() : undefined;

const sessionsTagFromCommand = (input: string): string | undefined =>
  input.startsWith("/sessions ") ? input.slice("/sessions ".length).trim() : undefined;

const messageFromInput = (input: string): string =>
  input.startsWith("/run ") ? input.slice("/run ".length).trim() : input;

const normalizeSessionTags = (tags: string | undefined): ReadonlyArray<string> =>
  tags
    ? tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
    : [];

const sessionTagsFromCommand = (tagsTarget: string): ReadonlyArray<string> =>
  tagsTarget === "--clear" ? [] : normalizeSessionTags(tagsTarget);

const transientProviderPatterns = [
  "provider returned error",
  "rate limit",
  "temporarily unavailable",
  "timeout",
  "timed out",
  "overloaded",
  "service unavailable",
  "gateway",
] as const;

const maxChatRunAttempts = 3;
const retryDelayMs = 750;

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

const appendAssistant = (
  state: ChatSessionState,
  content: string,
  runSummary?: WorkflowRunSummary
): ChatSessionState =>
  appendChatMessage(state, {
    ...createChatMessage("assistant", content),
    ...(runSummary ? { runSummary } : {}),
  });

const appendSystem = (state: ChatSessionState, content: string): ChatSessionState =>
  appendChatMessage(state, createChatMessage("system", content));

const errorMessage = (error: unknown): string =>
  error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "Unknown workflow run failure.";

const isTransientProviderError = (error: unknown): boolean => {
  const message = errorMessage(error).toLowerCase();
  return transientProviderPatterns.some((pattern) => message.includes(pattern));
};

const delay = (ms: number): Promise<void> =>
  new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });

const runWorkflowWithRetry = async (
  runWorkflow: typeof runRun,
  workflowPath: string,
  runOptions: Record<string, unknown>,
  remainingAttempts = maxChatRunAttempts
): ReturnType<typeof runRun> =>
  runWorkflow(workflowPath, runOptions).catch((error: unknown): ReturnType<typeof runRun> => {
    if (remainingAttempts <= 1 || !isTransientProviderError(error)) {
      throw error;
    }
    return delay(retryDelayMs).then(() =>
      runWorkflowWithRetry(runWorkflow, workflowPath, runOptions, remainingAttempts - 1)
    );
  });

const formatRunSummaryMessage = (
  runSummary: WorkflowRunSummary | undefined,
  dryRun: boolean | undefined
): string =>
  dryRun
    ? "Dry-run completed. The workflow accepted this chat task."
    : runSummary
      ? `${runSummary.message} > ${runSummary.steps.map((step) => step.name).join(", ")}`
      : "Workflow run completed for this chat task.";

const formatOptionalList = (label: string, values: ReadonlyArray<string>): string | undefined =>
  values.length > 0 ? `${label}: ${values.join(", ")}` : undefined;

const formatDetailsStep = (step: WorkflowRunStepSummary): ReadonlyArray<string> =>
  [
    `- ${step.name}: ${step.status}${step.agent ? ` · ${step.agent}` : ""}${step.model ? ` · ${step.model}` : ""}`,
    `  output: ${step.outputPreview}`,
    formatOptionalList("  tools", step.toolsUsed),
    formatOptionalList("  artifacts", step.artifacts),
    formatOptionalList("  decisions", step.decisions),
    step.rationale ? `  rationale: ${step.rationale}` : undefined,
    formatOptionalList("  issues", step.issues),
    formatOptionalList("  dependencies", step.dependencies),
  ].filter((line): line is string => Boolean(line));

const formatRunDetailsMessage = (summary: WorkflowRunSummary): string =>
  [
    `Run details ${summary.executionId}`,
    `${summary.message} (${summary.status})`,
    `Workflow: ${summary.workflowName}`,
    `Steps: ${summary.completedStepCount}/${summary.totalStepCount}`,
    ...(summary.durationMs === undefined ? [] : [`Duration: ${summary.durationMs}ms`]),
    ...(summary.error ? [`Error: ${summary.error}`] : []),
    ...summary.steps.flatMap(formatDetailsStep),
  ].join("\n");

const findRunSummaryInState = (
  state: ChatSessionState,
  executionId: string
): WorkflowRunSummary | undefined =>
  state.messages
    .flatMap((message) =>
      message.runSummary?.executionId === executionId ? [message.runSummary] : []
    )
    .at(0);

const formatSessionTags = (tags: ReadonlyArray<string> | undefined): string =>
  tags && tags.length > 0 ? tags.join(", ") : "none";

const withSessionTags = (
  state: ChatSessionState,
  tags: ReadonlyArray<string>
): ChatSessionState => ({
  ...state,
  tags,
});

const formatSessionSummaryLine = (summary: ChatSessionSummary): string =>
  [
    `- ${summary.sessionId}`,
    summary.status,
    summary.workflowTarget ?? "no workflow",
    `${summary.messageCount} messages`,
    summary.tags.length > 0 ? `tags ${summary.tags.join(",")}` : "untagged",
  ].join(" · ");

const formatSessionListMessage = (
  summaries: ReadonlyArray<ChatSessionSummary>,
  tag: string | undefined
): string =>
  summaries.length > 0
    ? [`Recent sessions${tag ? ` tagged ${tag}` : ""}:`, ...summaries.slice(0, 5).map(formatSessionSummaryLine)].join(
        "\n"
      )
    : `No chat sessions found${tag ? ` tagged ${tag}` : ""}.`;

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
  listSessions,
}: {
  readonly input: string;
  readonly state: ChatSessionState;
  readonly resolveWorkflow: (target: string) => Promise<WorkflowLocator>;
  readonly runWorkflow: typeof runRun;
  readonly commandOptions: ChatCommandOptions;
  readonly listSessions?: (tag?: string) => Promise<ReadonlyArray<ChatSessionSummary>>;
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

  if (trimmed === "/sessions" || trimmed.startsWith("/sessions ")) {
    const tag = sessionsTagFromCommand(trimmed);
    const summaries = await (listSessions
      ? listSessions(tag)
      : listChatSessionSummaries({ cwd: state.cwd, ...(tag ? { tag } : {}) }));
    return {
      state: appendAssistant(state, formatSessionListMessage(summaries, tag)),
      exit: false,
    };
  }

  if (trimmed === "/tags") {
    return {
      state: appendAssistant(state, `Session tags: ${formatSessionTags(state.tags)}`),
      exit: false,
    };
  }

  const tagsTarget = tagsTargetFromCommand(trimmed);
  if (tagsTarget !== undefined) {
    const tags = sessionTagsFromCommand(tagsTarget);
    return {
      state: appendAssistant(
        withSessionTags(state, tags),
        `Session tags updated: ${formatSessionTags(tags)}`
      ),
      exit: false,
    };
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

  const detailsExecutionId = detailsTargetFromCommand(trimmed);
  if (detailsExecutionId) {
    const summary = findRunSummaryInState(state, detailsExecutionId);
    return {
      state: appendAssistant(
        state,
        summary
          ? formatRunDetailsMessage(summary)
          : `Run details not found: ${detailsExecutionId}`
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
  const lastRunCommand = `obora run ${state.workflowLocator.displayPath}`;
  const runOptions = {
    ...commandRunOptions(commandOptions),
    input: runInput,
  };

  return runWorkflowWithRetry(runWorkflow, state.workflowLocator.path, runOptions)
    .then((execution): ChatTurnResult => {
      const runSummary = execution ? buildWorkflowRunSummary(execution) : undefined;
      return {
        state: appendAssistant(
          {
            ...setChatStatus(runningState, "ready"),
            lastRunCommand,
            ...(runSummary ? { lastRunSummary: runSummary } : {}),
          },
          formatRunSummaryMessage(runSummary, commandOptions.dryRun),
          runSummary
        ),
        exit: false,
      };
    })
    .catch((error: unknown): ChatTurnResult => {
      const message = errorMessage(error);
      return {
        state: appendAssistant(
          {
            ...setChatStatus(runningState, "failed", message),
            lastRunCommand,
          },
          `Workflow run failed: ${message}`
        ),
        exit: false,
      };
    });
};

const promptLoop = async ({
  reader,
  state,
  tui,
  resolveWorkflow,
  runWorkflow,
  commandOptions,
  listSessions,
  persist,
}: {
  readonly reader: { question: (query: string) => Promise<string> };
  readonly state: ChatSessionState;
  readonly tui: ChatTuiController;
  readonly resolveWorkflow: (target: string) => Promise<WorkflowLocator>;
  readonly runWorkflow: typeof runRun;
  readonly commandOptions: ChatCommandOptions;
  readonly listSessions: (tag?: string) => Promise<ReadonlyArray<ChatSessionSummary>>;
  readonly persist: (state: ChatSessionState) => Promise<void>;
}): Promise<ChatSessionState> => {
  const input = await reader.question("> ");
  const result = await handleChatInput({
    input,
    state,
    resolveWorkflow,
    runWorkflow,
    commandOptions,
    listSessions,
  });
  tui.update(result.state);
  await persist(result.state);
  return result.exit || tui.isAbortRequested()
    ? result.state
    : promptLoop({
        reader,
        state: result.state,
        tui,
        resolveWorkflow,
        runWorkflow,
        commandOptions,
        listSessions,
        persist,
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

const createSessionStartState = async ({
  cwd,
  commandOptions,
  sessionStoreDir,
}: {
  readonly cwd: string;
  readonly commandOptions: ChatCommandOptions;
  readonly sessionStoreDir?: string;
}): Promise<ChatSessionState> => {
  const sessionId = commandOptions.session ?? `chat-${Date.now()}`;
  const projectRoot = resolve(commandOptions.project ?? cwd);
  const tags = normalizeSessionTags(commandOptions.tags);
  const restored = commandOptions.session
    ? await loadChatSessionState({ cwd, sessionId, storeDir: sessionStoreDir })
    : undefined;
  if (restored) {
    return {
      ...restored,
      cwd,
      projectRoot,
      tags: tags.length > 0 ? tags : restored.tags,
      dryRun: Boolean(commandOptions.dryRun),
      ...(commandOptions.provider ? { providerName: commandOptions.provider } : {}),
      ...(commandOptions.model ? { modelName: commandOptions.model } : {}),
      ...(commandOptions.workflow ? { workflowTarget: commandOptions.workflow } : {}),
    };
  }
  return createInitialChatState({
    sessionId,
    cwd,
    projectRoot,
    tags,
    dryRun: Boolean(commandOptions.dryRun),
    providerName: commandOptions.provider,
    modelName: commandOptions.model,
    workflowTarget: commandOptions.workflow,
  });
};

const saveSession = (
  cwd: string,
  state: ChatSessionState,
  sessionStoreDir: string | undefined
): Promise<void> => saveChatSessionState({ cwd, state, storeDir: sessionStoreDir });

export const runChatSession = async (
  options: ChatSessionRuntimeOptions
): Promise<ChatSessionState> => {
  const scope = parseChatWorkflowScope(options.commandOptions.scope);
  const resolveWorkflow = resolveWorkflowForSession(options, scope);
  const runWorkflow = options.runWorkflow ?? runRun;
  const listSessions = (tag?: string): Promise<ReadonlyArray<ChatSessionSummary>> =>
    listChatSessionSummaries({
      cwd: options.cwd,
      ...(tag ? { tag } : {}),
      ...(options.sessionStoreDir ? { storeDir: options.sessionStoreDir } : {}),
    });
  const initialState = await createSessionStartState({
    cwd: options.cwd,
    commandOptions: options.commandOptions,
    sessionStoreDir: options.sessionStoreDir,
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
    await saveSession(options.cwd, resolvedState, options.sessionStoreDir);
    const result = await handleChatInput({
      input: options.commandOptions.once,
      state: resolvedState,
      resolveWorkflow,
      runWorkflow,
      commandOptions: options.commandOptions,
      listSessions,
    });
    tui.update(result.state);
    await saveSession(options.cwd, result.state, options.sessionStoreDir);
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

  await saveSession(options.cwd, resolvedState, options.sessionStoreDir);

  const reader = createInterface({ input: options.input, output: options.output });

  return promptLoop({
    reader,
    state: resolvedState,
    tui,
    resolveWorkflow,
    runWorkflow,
    commandOptions: options.commandOptions,
    listSessions,
    persist: (state) => saveSession(options.cwd, state, options.sessionStoreDir),
  })
    .then((state) => saveSession(options.cwd, state, options.sessionStoreDir).then(() => state))
    .finally(() => {
      reader.close();
      return tui.stop();
    });
};
