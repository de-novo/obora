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
  listChatWorkflowLocators,
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
  "Commands: /workflow <name-or-path> selects a reusable workflow, /workflows [scope] lists reusable workflows, /workflow 1 selects from the last workflow list, /run <task> runs the current workflow, /run #1 <task> runs one task with a listed workflow, /run --workflow <name-or-path> <task> runs one task with another workflow, /details <executionId> shows step results, /sessions [tag] lists recent sessions, /tags [a,b] shows or updates session tags, /exit quits.";

const isExitCommand = (input: string): boolean => input === "/exit" || input === "/quit";

const workflowTargetFromCommand = (input: string): string | undefined =>
  input.startsWith("/workflow ") ? input.slice("/workflow ".length).trim() : undefined;

const detailsTargetFromCommand = (input: string): string | undefined =>
  input.startsWith("/details ") ? input.slice("/details ".length).trim() : undefined;

const tagsTargetFromCommand = (input: string): string | undefined =>
  input.startsWith("/tags ") ? input.slice("/tags ".length).trim() : undefined;

const sessionsTagFromCommand = (input: string): string | undefined =>
  input.startsWith("/sessions ") ? input.slice("/sessions ".length).trim() : undefined;

const workflowsScopeFromCommand = (input: string): string | undefined =>
  input.startsWith("/workflows ") ? input.slice("/workflows ".length).trim() : undefined;

const messageFromInput = (input: string): string =>
  input.startsWith("/run ") ? input.slice("/run ".length).trim() : input;

const runWorkflowOverridePattern = /^\/run\s+--workflow(?:=|\s+)(\S+)\s+(.+)$/u;
const runWorkflowChoicePattern = /^\/run\s+#(\d+)\s+(.+)$/u;

const runWorkflowOverrideFromInput = (
  input: string
): { readonly workflowTarget: string; readonly message: string } | undefined => {
  const match = runWorkflowOverridePattern.exec(input);
  return match && match[1] && match[2]
    ? { workflowTarget: match[1], message: match[2].trim() }
    : undefined;
};

const workflowChoiceIndexFromTarget = (target: string): number | undefined =>
  /^\d+$/u.test(target) ? Number.parseInt(target, 10) - 1 : undefined;

const runWorkflowChoiceFromInput = (
  input: string
): { readonly index: number; readonly message: string } | undefined => {
  const match = runWorkflowChoicePattern.exec(input);
  return match && match[1] && match[2]
    ? { index: Number.parseInt(match[1], 10) - 1, message: match[2].trim() }
    : undefined;
};

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

const formatWorkflowLocatorLine = (locator: WorkflowLocator): string =>
  [
    `- ${locator.name}`,
    locator.scope,
    `${locator.stepCount} steps`,
    locator.displayPath,
    locator.description ?? undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

const formatNumberedWorkflowLocatorLine = (
  locator: WorkflowLocator,
  index: number
): string => `${index + 1}. ${formatWorkflowLocatorLine(locator).slice(2)}`;

const formatWorkflowListMessage = (
  locators: ReadonlyArray<WorkflowLocator>,
  scope: WorkflowResolveScope | undefined
): string =>
  locators.length > 0
    ? [
        `Reusable workflows${scope ? ` (${scope})` : ""}:`,
        ...locators.slice(0, 8).map(formatNumberedWorkflowLocatorLine),
        "Use /workflow 1 to select, or /run #1 <task> to run once.",
      ].join("\n")
    : `No reusable workflows found${scope ? ` for ${scope}` : ""}.`;

const withWorkflowChoices = (
  state: ChatSessionState,
  workflowChoices: ReadonlyArray<WorkflowLocator>
): ChatSessionState => ({
  ...state,
  workflowChoices,
});

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

const workflowChoiceAt = (
  state: ChatSessionState,
  index: number
): WorkflowLocator | undefined =>
  index >= 0 && state.workflowChoices ? state.workflowChoices[index] : undefined;

const runChatTask = ({
  state,
  workflowLocator,
  message,
  runWorkflow,
  commandOptions,
}: {
  readonly state: ChatSessionState;
  readonly workflowLocator: WorkflowLocator;
  readonly message: string;
  readonly runWorkflow: typeof runRun;
  readonly commandOptions: ChatCommandOptions;
}): Promise<ChatTurnResult> => {
  const userState = appendChatMessage(state, createChatMessage("user", message));
  const runningState = setChatStatus(userState, "running");
  const runInput = createChatRunInput({
    message,
    sessionId: state.sessionId,
    workflowName: workflowLocator.name,
    workflowPath: workflowLocator.path,
  });
  const lastRunCommand = `obora run ${workflowLocator.displayPath}`;
  const runOptions = {
    ...commandRunOptions(commandOptions),
    input: runInput,
  };

  return runWorkflowWithRetry(runWorkflow, workflowLocator.path, runOptions)
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
  listWorkflowLocators,
}: {
  readonly input: string;
  readonly state: ChatSessionState;
  readonly resolveWorkflow: (target: string) => Promise<WorkflowLocator>;
  readonly runWorkflow: typeof runRun;
  readonly commandOptions: ChatCommandOptions;
  readonly listSessions?: (tag?: string) => Promise<ReadonlyArray<ChatSessionSummary>>;
  readonly listWorkflowLocators?: (
    scope?: WorkflowResolveScope
  ) => Promise<ReadonlyArray<WorkflowLocator>>;
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

  if (trimmed === "/workflows" || trimmed.startsWith("/workflows ")) {
    const scope = parseChatWorkflowScope(workflowsScopeFromCommand(trimmed) ?? commandOptions.scope);
    const locators = await (listWorkflowLocators
      ? listWorkflowLocators(scope)
      : listChatWorkflowLocators({
          cwd: state.cwd,
          scope,
          projectRoot: commandOptions.project,
          globalWorkflowDir: commandOptions.globalWorkflowsDir,
        }));
    return {
      state: appendAssistant(withWorkflowChoices(state, locators.slice(0, 8)), formatWorkflowListMessage(locators, scope)),
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
    const choiceIndex = workflowChoiceIndexFromTarget(workflowTarget);
    const choice = choiceIndex === undefined ? undefined : workflowChoiceAt(state, choiceIndex);
    if (choice) {
      return {
        state: appendAssistant(
          withResolvedWorkflow(setChatStatus(state, "resolving"), choice.name, choice),
          `Selected workflow ${choice.name} (${choice.scope}).`
        ),
        exit: false,
      };
    }
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

  const runChoice = runWorkflowChoiceFromInput(trimmed);
  if (runChoice) {
    const choice = workflowChoiceAt(state, runChoice.index);
    return choice
      ? runChatTask({
          state,
          workflowLocator: choice,
          message: runChoice.message,
          runWorkflow,
          commandOptions,
        })
      : {
          state: appendAssistant(
            state,
            "Workflow choice not found. Run /workflows first, then use /run #1 <task>."
          ),
          exit: false,
        };
  }

  const runOverride = runWorkflowOverrideFromInput(trimmed);
  if (runOverride) {
    const locator = await resolveWorkflow(runOverride.workflowTarget);
    return runChatTask({
      state: setChatStatus(state, "resolving"),
      workflowLocator: locator,
      message: runOverride.message,
      runWorkflow,
      commandOptions,
    });
  }

  if (!state.workflowLocator) {
    return {
      state: appendAssistant(state, "Select a workflow first with /workflow <name-or-path>."),
      exit: false,
    };
  }

  const message = messageFromInput(trimmed);
  return runChatTask({
    state,
    workflowLocator: state.workflowLocator,
    message,
    runWorkflow,
    commandOptions,
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
  listWorkflowLocators,
  persist,
}: {
  readonly reader: { question: (query: string) => Promise<string> };
  readonly state: ChatSessionState;
  readonly tui: ChatTuiController;
  readonly resolveWorkflow: (target: string) => Promise<WorkflowLocator>;
  readonly runWorkflow: typeof runRun;
  readonly commandOptions: ChatCommandOptions;
  readonly listSessions: (tag?: string) => Promise<ReadonlyArray<ChatSessionSummary>>;
  readonly listWorkflowLocators: (
    scope?: WorkflowResolveScope
  ) => Promise<ReadonlyArray<WorkflowLocator>>;
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
    listWorkflowLocators,
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
        listWorkflowLocators,
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
  const listWorkflowLocators = (
    scopeOverride?: WorkflowResolveScope
  ): Promise<ReadonlyArray<WorkflowLocator>> =>
    listChatWorkflowLocators({
      cwd: options.cwd,
      scope: scopeOverride ?? scope,
      projectRoot: options.commandOptions.project,
      globalWorkflowDir: options.commandOptions.globalWorkflowsDir,
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
      listWorkflowLocators,
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
    listWorkflowLocators,
    persist: (state) => saveSession(options.cwd, state, options.sessionStoreDir),
  })
    .then((state) => saveSession(options.cwd, state, options.sessionStoreDir).then(() => state))
    .finally(() => {
      reader.close();
      return tui.stop();
    });
};
