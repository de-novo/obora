import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import type { Readable, Writable } from "node:stream";

import { buildWorkflowRunSummary } from "@obora/sdk";
import type {
  WorkflowLocator,
  WorkflowResolveScope,
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
  deleteChatSessionState,
  findChatRunDetail,
  listChatRunDetails,
  listChatSessionSummaries,
  loadChatSessionState,
  renameChatSessionState,
  saveChatSessionState,
} from "./store.js";
import type { ChatRunDetail, ChatSessionSummary } from "./store.js";
import { ChatTuiController } from "./tui.js";
import type { ChatCommandOptions, ChatRunChoice, ChatSessionState } from "./types.js";
import {
  chatRunChoiceFromDetail,
  chatRunChoicesFromDetails,
  chatRunChoicesFromSummaries,
  runChoiceSummary,
  toChatRunChoice,
  type ChatRunChoiceInput,
} from "./run-choices.js";
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
  readonly resolveWorkflow?: (
    target: string,
    projectRoot?: string
  ) => Promise<WorkflowLocator>;
  readonly sessionStoreDir?: string;
}

interface ChatTurnResult {
  readonly state: ChatSessionState;
  readonly exit: boolean;
}

interface SessionListFilter {
  readonly tag?: string;
  readonly projectRoot?: string;
}

interface SessionRenameCommand {
  readonly target: string;
  readonly nextSessionId: string;
}

interface RunListFilter {
  readonly sessionId?: string;
  readonly missingChoice?: boolean;
}

const chatHelp =
  "Commands: /workflow <name-or-path> selects a reusable workflow, /workflows [scope] lists reusable workflows, /project [path] shows or changes the session project root, /sessions [tag] lists recent sessions, /sessions --project [path] filters by project, /session 1 or /session <id> switches sessions, /session rename <id-or-number> <new-id> renames, /session delete <id-or-number> deletes, /workflow 1 selects from the last workflow list, /run <task> runs the current workflow, /run #1 <task> runs one task with a listed workflow, /run --workflow <name-or-path> <task> runs one task with another workflow, /runs lists workflow runs in this chat, /runs --all lists persisted runs across sessions, /runs --session <id-or-number> lists persisted runs for one session, /details <executionId-or-number> shows step results, /session shows current session metadata, /tags [a,b] shows or updates session tags, /exit quits.";

const isExitCommand = (input: string): boolean => input === "/exit" || input === "/quit";

const workflowTargetFromCommand = (input: string): string | undefined =>
  input.startsWith("/workflow ") ? input.slice("/workflow ".length).trim() : undefined;

const detailsTargetFromCommand = (input: string): string | undefined =>
  input.startsWith("/details ") ? input.slice("/details ".length).trim() : undefined;

const tagsTargetFromCommand = (input: string): string | undefined =>
  input.startsWith("/tags ") ? input.slice("/tags ".length).trim() : undefined;

const sessionsTagFromCommand = (input: string): string | undefined =>
  input.startsWith("/sessions ") ? input.slice("/sessions ".length).trim() : undefined;

const sessionTargetFromCommand = (input: string): string | undefined =>
  input.startsWith("/session ") ? input.slice("/session ".length).trim() : undefined;

const commandParts = (input: string): ReadonlyArray<string> =>
  input
    .trim()
    .split(/\s+/u)
    .filter((part) => part.length > 0);

const sessionListFilterFromCommand = (
  input: string,
  state: ChatSessionState
): SessionListFilter => {
  const target = sessionsTagFromCommand(input);
  const parts = commandParts(input);
  return parts[1] === "--project"
    ? {
        projectRoot: parts[2] ? resolveProjectRootTarget(state, parts[2]) : state.projectRoot ?? state.cwd,
      }
    : target
      ? { tag: target }
      : {};
};

const sessionDeleteTargetFromCommand = (target: string): string | undefined =>
  target.startsWith("delete ") ? target.slice("delete ".length).trim() : undefined;

const sessionRenameFromCommand = (target: string): SessionRenameCommand | undefined => {
  const parts = commandParts(target);
  return parts[0] === "rename" && parts[1] && parts[2]
    ? { target: parts[1], nextSessionId: parts[2] }
    : undefined;
};

const projectTargetFromCommand = (input: string): string | undefined =>
  input.startsWith("/project ") ? input.slice("/project ".length).trim() : undefined;

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

const runChoiceIndexFromTarget = (target: string): number | undefined =>
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

const findRunSummaryInState = (
  state: ChatSessionState,
  executionId: string
): WorkflowRunSummary | undefined =>
  state.messages
    .flatMap((message) =>
      message.runSummary?.executionId === executionId ? [message.runSummary] : []
    )
    .at(0) ??
  (state.lastRunSummary?.executionId === executionId ? state.lastRunSummary : undefined) ??
  (state.inspectedRunSummary?.executionId === executionId
    ? state.inspectedRunSummary
    : undefined);

const uniqueRunSummaries = (
  summaries: ReadonlyArray<WorkflowRunSummary | undefined>
): ReadonlyArray<WorkflowRunSummary> =>
  summaries
    .filter((summary): summary is WorkflowRunSummary => Boolean(summary))
    .filter(
      (summary, index, all) =>
        all.findIndex((candidate) => candidate.executionId === summary.executionId) === index
    );

const runSummariesFromState = (state: ChatSessionState): ReadonlyArray<WorkflowRunSummary> =>
  uniqueRunSummaries([
    state.lastRunSummary,
    state.inspectedRunSummary,
    ...state.messages.flatMap((message) => message.runSummary ?? []),
  ]).slice(0, 8);

const runChoiceAt = (
  state: ChatSessionState,
  index: number
): WorkflowRunSummary | undefined =>
  index >= 0 && state.runChoices ? runChoiceSummary(state.runChoices[index]) : undefined;

const runChoiceEntryAt = (
  state: ChatSessionState,
  index: number
): ChatRunChoice | undefined => (index >= 0 && state.runChoices ? state.runChoices[index] : undefined);

const formatRunSummaryLine = (summary: WorkflowRunSummary, index: number): string =>
  `${index + 1}. ${summary.executionId} · ${summary.workflowName} · ${summary.status} · ${summary.completedStepCount}/${summary.totalStepCount} steps`;

const openedRunDetailsMessage = (
  summary: WorkflowRunSummary,
  choice: ChatRunChoice | undefined,
  persistedDetail: ChatRunDetail | undefined
): string => {
  const sessionId = choice?.sessionId ?? persistedDetail?.sessionId;
  return sessionId
    ? `Opened run details ${summary.executionId}. Use /session ${sessionId} to switch to the source session.`
    : `Opened run details ${summary.executionId}.`;
};

const formatRunListMessage = (summaries: ReadonlyArray<WorkflowRunSummary>): string =>
  summaries.length > 0
    ? [
        "Recent workflow runs:",
        ...summaries.map(formatRunSummaryLine),
        "Use /details 1 to open a run, or /details <executionId>.",
      ].join("\n")
    : "No workflow runs found in this chat session.";

const runListFilterFromCommand = (
  input: string,
  state: ChatSessionState
): RunListFilter | undefined => {
  const parts = commandParts(input);
  const sessionFilter =
    parts[1] === "--session" && parts[2] ? sessionIdFromTarget(state, parts[2]) : undefined;
  return parts[1] === "--all"
    ? {}
    : sessionFilter
      ? sessionFilter.missingChoice
        ? { missingChoice: true }
        : { sessionId: sessionFilter.sessionId }
      : undefined;
};

const persistedRunScopeText = (filter: RunListFilter): string =>
  filter.sessionId ? `session ${filter.sessionId}` : "all sessions";

const formatPersistedRunSummaryLine = (detail: ChatRunDetail, index: number): string =>
  `${index + 1}. ${detail.runSummary.executionId} · ${detail.sessionId} · ${detail.runSummary.workflowName} · ${detail.runSummary.status} · ${detail.runSummary.completedStepCount}/${detail.runSummary.totalStepCount} steps`;

const formatPersistedRunListMessage = (
  details: ReadonlyArray<ChatRunDetail>,
  filter: RunListFilter
): string =>
  details.length > 0
    ? [
        `Persisted workflow runs (${persistedRunScopeText(filter)}):`,
        ...details.map(formatPersistedRunSummaryLine),
        "Use /details 1 to open a run, or /details <executionId>.",
      ].join("\n")
    : `No persisted workflow runs found for ${persistedRunScopeText(filter)}.`;

const withRunChoices = (
  state: ChatSessionState,
  runChoices: ReadonlyArray<ChatRunChoiceInput>
): ChatSessionState => ({
  ...state,
  runChoices: runChoices.map((choice) => toChatRunChoice(choice, state.sessionId)),
});

const formatSessionTags = (tags: ReadonlyArray<string> | undefined): string =>
  tags && tags.length > 0 ? tags.join(", ") : "none";

const withSessionTags = (
  state: ChatSessionState,
  tags: ReadonlyArray<string>
): ChatSessionState => ({
  ...state,
  tags,
});

const withSessionChoices = (
  state: ChatSessionState,
  sessionChoices: ReadonlyArray<ChatSessionSummary>
): ChatSessionState => ({
  ...state,
  sessionChoices,
});

const sessionChoiceIndexFromTarget = (target: string): number | undefined =>
  /^\d+$/u.test(target) ? Number.parseInt(target, 10) - 1 : undefined;

const sessionChoiceAt = (
  state: ChatSessionState,
  index: number
): ChatSessionSummary | undefined =>
  index >= 0 && state.sessionChoices ? state.sessionChoices[index] : undefined;

const sessionIdFromTarget = (
  state: ChatSessionState,
  target: string
): { readonly sessionId?: string; readonly missingChoice: boolean } => {
  const choiceIndex = sessionChoiceIndexFromTarget(target);
  const choice = choiceIndex === undefined ? undefined : sessionChoiceAt(state, choiceIndex);
  return choiceIndex === undefined
    ? { sessionId: target, missingChoice: false }
    : choice
      ? { sessionId: choice.sessionId, missingChoice: false }
      : { missingChoice: true };
};

const uniqueRunChoices = (
  choices: ReadonlyArray<ChatRunChoice | undefined>
): ReadonlyArray<ChatRunChoice> =>
  choices
    .filter((choice): choice is ChatRunChoice => Boolean(choice))
    .filter(
      (choice, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.runSummary.executionId === choice.runSummary.executionId &&
            candidate.sessionId === choice.sessionId
        ) === index
    );

const normalizeLoadedSessionState = ({
  current,
  loaded,
  commandOptions,
}: {
  readonly current: ChatSessionState;
  readonly loaded: ChatSessionState;
  readonly commandOptions: ChatCommandOptions;
}): ChatSessionState => ({
  ...loaded,
  cwd: current.cwd,
  projectRoot: loaded.projectRoot ?? current.cwd,
  dryRun: Boolean(commandOptions.dryRun),
  inspectedRunSummary: current.inspectedRunSummary ?? loaded.inspectedRunSummary,
  runChoices: uniqueRunChoices([
    ...(current.runChoices ?? []),
    ...(loaded.runChoices ?? []),
  ]),
  ...(commandOptions.provider ? { providerName: commandOptions.provider } : {}),
  ...(commandOptions.model ? { modelName: commandOptions.model } : {}),
});

const resolveProjectRootTarget = (state: ChatSessionState, target: string): string =>
  resolve(state.cwd, target);

const withProjectRoot = (state: ChatSessionState, projectRoot: string): ChatSessionState => ({
  ...state,
  projectRoot,
  workflowTarget: undefined,
  workflowLocator: undefined,
  workflowChoices: [],
  lastError: undefined,
});

const formatSessionSummaryLine = (summary: ChatSessionSummary): string =>
  [
    `- ${summary.sessionId}`,
    summary.status,
    summary.workflowTarget ?? "no workflow",
    `${summary.messageCount} messages`,
    summary.tags.length > 0 ? `tags ${summary.tags.join(",")}` : "untagged",
  ].join(" · ");

const formatNumberedSessionSummaryLine = (
  summary: ChatSessionSummary,
  index: number
): string => `${index + 1}. ${formatSessionSummaryLine(summary).slice(2)}`;

const formatSessionListMessage = (
  summaries: ReadonlyArray<ChatSessionSummary>,
  filter: SessionListFilter
): string =>
  summaries.length > 0
    ? [
        `Recent sessions${filter.tag ? ` tagged ${filter.tag}` : ""}${filter.projectRoot ? ` for ${filter.projectRoot}` : ""}:`,
        ...summaries.slice(0, 8).map(formatNumberedSessionSummaryLine),
        "Use /session 1 to switch, or /session <id> to open a known session.",
      ].join("\n")
    : `No chat sessions found${filter.tag ? ` tagged ${filter.tag}` : ""}${filter.projectRoot ? ` for ${filter.projectRoot}` : ""}.`;

const formatSessionWorkflow = (state: ChatSessionState): string =>
  state.workflowLocator
    ? `${state.workflowLocator.name} (${state.workflowLocator.scope})`
    : state.workflowTarget
      ? `${state.workflowTarget} (unresolved)`
      : "none";

const userTurnCount = (state: ChatSessionState): number =>
  state.messages.filter((message) => message.role === "user").length;

const formatLastResult = (state: ChatSessionState): string =>
  state.lastRunSummary
    ? `${state.lastRunSummary.status} ${state.lastRunSummary.completedStepCount}/${state.lastRunSummary.totalStepCount}`
    : "none";

const formatSessionStatusMessage = (state: ChatSessionState): string =>
  [
    `Session: ${state.sessionId}`,
    `Status: ${state.status}`,
    `Project: ${state.projectRoot ?? state.cwd}`,
    `Directory: ${state.cwd}`,
    `Tags: ${formatSessionTags(state.tags)}`,
    `Workflow: ${formatSessionWorkflow(state)}`,
    `Mode: ${state.dryRun ? "dry-run" : "live"}`,
    `Provider: ${state.providerName ?? "default"}`,
    `Model: ${state.modelName ?? "default"}`,
    `Messages: ${state.messages.length}`,
    `User turns: ${userTurnCount(state)}`,
    `Last run: ${state.lastRunCommand ?? "none"}`,
    `Last result: ${formatLastResult(state)}`,
    ...(state.lastRunSummary ? [`Details: /details ${state.lastRunSummary.executionId}`] : []),
  ].join("\n");

const formatProjectStatusMessage = (state: ChatSessionState): string =>
  [
    `Project: ${state.projectRoot ?? state.cwd}`,
    `Directory: ${state.cwd}`,
    "Use /project <path> to change the session project root.",
    "Run /workflows project after changing projects to refresh reusable workflows.",
  ].join("\n");

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

const formatCurrentWorkflow = (state: ChatSessionState): string =>
  state.workflowLocator
    ? `Current workflow: ${state.workflowLocator.name} (${state.workflowLocator.scope})`
    : state.workflowTarget
      ? `Current workflow: ${state.workflowTarget} (unresolved)`
      : "No workflow selected.";

const formatWorkflowStatusMessage = (state: ChatSessionState): string =>
  [
    formatCurrentWorkflow(state),
    ...(state.workflowChoices && state.workflowChoices.length > 0
      ? [
          "Recent workflow choices:",
          ...state.workflowChoices.slice(0, 8).map(formatNumberedWorkflowLocatorLine),
          "Use /workflow 1 to select, or /run #1 <task> to run once.",
        ]
      : ["Run /workflows first to list reusable workflows."]),
  ].join("\n");

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
            ...(runSummary
              ? { lastRunSummary: runSummary, inspectedRunSummary: runSummary }
              : {}),
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
  async (target: string, projectRoot?: string): Promise<WorkflowLocator> =>
    options.resolveWorkflow
      ? options.resolveWorkflow(target, projectRoot)
      : resolveChatWorkflow({
          target,
          cwd: options.cwd,
          scope,
          projectRoot: projectRoot ?? options.commandOptions.project,
          globalWorkflowDir: options.commandOptions.globalWorkflowsDir,
        });

export const handleChatInput = async ({
  input,
  state,
  resolveWorkflow,
  runWorkflow,
  commandOptions,
  listSessions,
  loadSession,
  renameSession,
  deleteSession,
  listWorkflowLocators,
  listRuns,
  findRun,
}: {
  readonly input: string;
  readonly state: ChatSessionState;
  readonly resolveWorkflow: (
    target: string,
    projectRoot?: string
  ) => Promise<WorkflowLocator>;
  readonly runWorkflow: typeof runRun;
  readonly commandOptions: ChatCommandOptions;
  readonly listSessions?: (
    tag?: string,
    projectRoot?: string
  ) => Promise<ReadonlyArray<ChatSessionSummary>>;
  readonly loadSession?: (sessionId: string) => Promise<ChatSessionState | undefined>;
  readonly renameSession?: (
    fromSessionId: string,
    toSessionId: string
  ) => Promise<ChatSessionState | undefined>;
  readonly deleteSession?: (sessionId: string) => Promise<boolean>;
  readonly listWorkflowLocators?: (
    scope?: WorkflowResolveScope,
    projectRoot?: string
  ) => Promise<ReadonlyArray<WorkflowLocator>>;
  readonly listRuns?: (sessionId?: string) => Promise<ReadonlyArray<ChatRunDetail>>;
  readonly findRun?: (executionId: string) => Promise<ChatRunDetail | undefined>;
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

  if (trimmed === "/workflow") {
    return {
      state: appendAssistant(state, formatWorkflowStatusMessage(state)),
      exit: false,
    };
  }

  if (trimmed === "/run") {
    return {
      state: appendAssistant(
        state,
        "Usage: /run <task>. You can also use /run #1 <task> after /workflows, or /run --workflow <name-or-path> <task>."
      ),
      exit: false,
    };
  }

  if (trimmed === "/runs") {
    const summaries = runSummariesFromState(state);
    return {
      state: appendAssistant(
        withRunChoices(state, chatRunChoicesFromSummaries(summaries, state.sessionId)),
        formatRunListMessage(summaries)
      ),
      exit: false,
    };
  }

  if (trimmed.startsWith("/runs ")) {
    const filter = runListFilterFromCommand(trimmed, state);
    if (!filter) {
      return {
        state: appendAssistant(
          state,
          "Usage: /runs, /runs --all, or /runs --session <id-or-number>."
        ),
        exit: false,
      };
    }
    if (filter.missingChoice) {
      return {
        state: appendAssistant(state, "Session choice not found. Run /sessions first."),
        exit: false,
      };
    }
    const details = await (listRuns
      ? listRuns(filter.sessionId)
      : listChatRunDetails({
          cwd: state.cwd,
          ...(filter.sessionId ? { sessionId: filter.sessionId } : {}),
        }));
    return {
      state: appendAssistant(
        withRunChoices(state, chatRunChoicesFromDetails(details).slice(0, 8)),
        formatPersistedRunListMessage(details, filter)
      ),
      exit: false,
    };
  }

  if (trimmed === "/sessions" || trimmed.startsWith("/sessions ")) {
    const filter = sessionListFilterFromCommand(trimmed, state);
    const summaries = await (listSessions
      ? listSessions(filter.tag, filter.projectRoot)
      : listChatSessionSummaries({
          cwd: state.cwd,
          ...(filter.tag ? { tag: filter.tag } : {}),
          ...(filter.projectRoot ? { projectRoot: filter.projectRoot } : {}),
        }));
    return {
      state: appendAssistant(
        withSessionChoices(state, summaries.slice(0, 8)),
        formatSessionListMessage(summaries, filter)
      ),
      exit: false,
    };
  }

  if (trimmed === "/session") {
    return {
      state: appendAssistant(state, formatSessionStatusMessage(state)),
      exit: false,
    };
  }

  const sessionTarget = sessionTargetFromCommand(trimmed);
  if (sessionTarget !== undefined) {
    const renameCommand = sessionRenameFromCommand(sessionTarget);
    if (renameCommand) {
      const target = sessionIdFromTarget(state, renameCommand.target);
      const renamed = target.sessionId
        ? await (renameSession
            ? renameSession(target.sessionId, renameCommand.nextSessionId)
            : renameChatSessionState({
                cwd: state.cwd,
                fromSessionId: target.sessionId,
                toSessionId: renameCommand.nextSessionId,
              }))
        : undefined;
      return target.missingChoice
        ? {
            state: appendAssistant(
              state,
              "Session choice not found. Run /sessions first, then use /session rename 1 <new-id>."
            ),
            exit: false,
          }
        : renamed
          ? {
              state:
                target.sessionId === state.sessionId
                  ? appendAssistant(
                      normalizeLoadedSessionState({
                        current: state,
                        loaded: renamed,
                        commandOptions,
                      }),
                      `Renamed session ${target.sessionId} to ${renameCommand.nextSessionId}.`
                    )
                  : appendAssistant(
                      state,
                      `Renamed session ${target.sessionId} to ${renameCommand.nextSessionId}.`
                    ),
              exit: false,
            }
          : {
              state: appendAssistant(state, `Chat session not found: ${target.sessionId}`),
              exit: false,
            };
    }

    const deleteTarget = sessionDeleteTargetFromCommand(sessionTarget);
    if (deleteTarget !== undefined) {
      const target = sessionIdFromTarget(state, deleteTarget);
      const deleted =
        target.sessionId && target.sessionId !== state.sessionId
          ? await (deleteSession
              ? deleteSession(target.sessionId)
              : deleteChatSessionState({ cwd: state.cwd, sessionId: target.sessionId }))
          : false;
      return target.missingChoice
        ? {
            state: appendAssistant(
              state,
              "Session choice not found. Run /sessions first, then use /session delete 1."
            ),
            exit: false,
          }
        : target.sessionId === state.sessionId
          ? {
              state: appendAssistant(
                state,
                "Cannot delete the active session. Switch to another session first."
              ),
              exit: false,
            }
          : deleted
            ? {
                state: appendAssistant(state, `Deleted session ${target.sessionId}.`),
                exit: false,
              }
            : {
                state: appendAssistant(state, `Chat session not found: ${target.sessionId}`),
                exit: false,
              };
    }

    const target = sessionIdFromTarget(state, sessionTarget);
    if (target.missingChoice) {
      return {
        state: appendAssistant(
          state,
          "Session choice not found. Run /sessions first, then use /session 1."
        ),
        exit: false,
      };
    }
    const targetSessionId = target.sessionId ?? sessionTarget;
    const loaded = await (loadSession
      ? loadSession(targetSessionId)
      : loadChatSessionState({ cwd: state.cwd, sessionId: targetSessionId }));
    return loaded
      ? {
          state: appendAssistant(
            normalizeLoadedSessionState({ current: state, loaded, commandOptions }),
            `Switched to session ${targetSessionId}.`
          ),
          exit: false,
        }
      : {
          state: appendAssistant(state, `Chat session not found: ${targetSessionId}`),
          exit: false,
        };
  }

  if (trimmed === "/project") {
    return {
      state: appendAssistant(state, formatProjectStatusMessage(state)),
      exit: false,
    };
  }

  const projectTarget = projectTargetFromCommand(trimmed);
  if (projectTarget !== undefined) {
    const projectRoot = resolveProjectRootTarget(state, projectTarget);
    return {
      state: appendAssistant(
        withProjectRoot(state, projectRoot),
        `Project root updated: ${projectRoot}\nWorkflow selection cleared. Run /workflows project to choose a workflow for this project.`
      ),
      exit: false,
    };
  }

  if (trimmed === "/workflows" || trimmed.startsWith("/workflows ")) {
    const scope = parseChatWorkflowScope(workflowsScopeFromCommand(trimmed) ?? commandOptions.scope);
    const locators = await (listWorkflowLocators
      ? listWorkflowLocators(scope, state.projectRoot)
      : listChatWorkflowLocators({
          cwd: state.cwd,
          scope,
          projectRoot: state.projectRoot ?? commandOptions.project,
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
    const locator = await resolveWorkflow(workflowTarget, state.projectRoot);
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
    const choiceIndex = runChoiceIndexFromTarget(detailsExecutionId);
    const choice = choiceIndex === undefined ? undefined : runChoiceEntryAt(state, choiceIndex);
    const choiceSummary = choice ? runChoiceSummary(choice) : undefined;
    const stateSummary = choiceSummary ?? findRunSummaryInState(state, detailsExecutionId);
    const persistedDetail = stateSummary
      ? undefined
      : await (findRun
          ? findRun(detailsExecutionId)
          : findChatRunDetail({ cwd: state.cwd, executionId: detailsExecutionId }));
    const summary = stateSummary ?? persistedDetail?.runSummary;
    const runChoices = persistedDetail
      ? [chatRunChoiceFromDetail(persistedDetail), ...(state.runChoices ?? [])]
      : (state.runChoices ?? []);
    return {
      state: appendAssistant(
        summary ? { ...state, inspectedRunSummary: summary, runChoices } : state,
        summary
          ? openedRunDetailsMessage(summary, choice, persistedDetail)
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
    const locator = await resolveWorkflow(runOverride.workflowTarget, state.projectRoot);
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
  loadSession,
  renameSession,
  deleteSession,
  listWorkflowLocators,
  listRuns,
  findRun,
  persist,
}: {
  readonly reader: { question: (query: string) => Promise<string> };
  readonly state: ChatSessionState;
  readonly tui: ChatTuiController;
  readonly resolveWorkflow: (
    target: string,
    projectRoot?: string
  ) => Promise<WorkflowLocator>;
  readonly runWorkflow: typeof runRun;
  readonly commandOptions: ChatCommandOptions;
  readonly listSessions: (
    tag?: string,
    projectRoot?: string
  ) => Promise<ReadonlyArray<ChatSessionSummary>>;
  readonly loadSession: (sessionId: string) => Promise<ChatSessionState | undefined>;
  readonly renameSession: (
    fromSessionId: string,
    toSessionId: string
  ) => Promise<ChatSessionState | undefined>;
  readonly deleteSession: (sessionId: string) => Promise<boolean>;
  readonly listWorkflowLocators: (
    scope?: WorkflowResolveScope,
    projectRoot?: string
  ) => Promise<ReadonlyArray<WorkflowLocator>>;
  readonly listRuns: (sessionId?: string) => Promise<ReadonlyArray<ChatRunDetail>>;
  readonly findRun: (executionId: string) => Promise<ChatRunDetail | undefined>;
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
    loadSession,
    renameSession,
    deleteSession,
    listWorkflowLocators,
    listRuns,
    findRun,
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
        loadSession,
        renameSession,
        deleteSession,
        listWorkflowLocators,
        listRuns,
        findRun,
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
  readonly resolveWorkflow: (
    target: string,
    projectRoot?: string
  ) => Promise<WorkflowLocator>;
}): Promise<ChatSessionState> => {
  if (!target) return state;
  const locator = await resolveWorkflow(target, state.projectRoot);
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
      projectRoot: commandOptions.project ? projectRoot : restored.projectRoot ?? projectRoot,
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
  const listSessions = (
    tag?: string,
    projectRoot?: string
  ): Promise<ReadonlyArray<ChatSessionSummary>> =>
    listChatSessionSummaries({
      cwd: options.cwd,
      ...(tag ? { tag } : {}),
      ...(projectRoot ? { projectRoot } : {}),
      ...(options.sessionStoreDir ? { storeDir: options.sessionStoreDir } : {}),
    });
  const loadSession = (sessionId: string): Promise<ChatSessionState | undefined> =>
    loadChatSessionState({
      cwd: options.cwd,
      sessionId,
      ...(options.sessionStoreDir ? { storeDir: options.sessionStoreDir } : {}),
    });
  const renameSession = (
    fromSessionId: string,
    toSessionId: string
  ): Promise<ChatSessionState | undefined> =>
    renameChatSessionState({
      cwd: options.cwd,
      fromSessionId,
      toSessionId,
      ...(options.sessionStoreDir ? { storeDir: options.sessionStoreDir } : {}),
    });
  const deleteSession = (sessionId: string): Promise<boolean> =>
    deleteChatSessionState({
      cwd: options.cwd,
      sessionId,
      ...(options.sessionStoreDir ? { storeDir: options.sessionStoreDir } : {}),
    });
  const listWorkflowLocators = (
    scopeOverride?: WorkflowResolveScope,
    projectRootOverride?: string
  ): Promise<ReadonlyArray<WorkflowLocator>> =>
    listChatWorkflowLocators({
      cwd: options.cwd,
      scope: scopeOverride ?? scope,
      projectRoot: projectRootOverride ?? options.commandOptions.project,
      globalWorkflowDir: options.commandOptions.globalWorkflowsDir,
    });
  const listRuns = (sessionId?: string): Promise<ReadonlyArray<ChatRunDetail>> =>
    listChatRunDetails({
      cwd: options.cwd,
      ...(sessionId ? { sessionId } : {}),
      ...(options.sessionStoreDir ? { storeDir: options.sessionStoreDir } : {}),
    });
  const findRun = (executionId: string): Promise<ChatRunDetail | undefined> =>
    findChatRunDetail({
      cwd: options.cwd,
      executionId,
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
      loadSession,
      renameSession,
      deleteSession,
      listWorkflowLocators,
      listRuns,
      findRun,
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
    loadSession,
    renameSession,
    deleteSession,
    listWorkflowLocators,
    listRuns,
    findRun,
    persist: (state) => saveSession(options.cwd, state, options.sessionStoreDir),
  })
    .then((state) => saveSession(options.cwd, state, options.sessionStoreDir).then(() => state))
    .finally(() => {
      reader.close();
      return tui.stop();
    });
};
