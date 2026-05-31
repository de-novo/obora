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
import { isClearRunDetailsCommand } from "./commands.js";
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
import type {
  ChatCommandOptions,
  ChatMessage,
  ChatRunChoice,
  ChatRunOptions,
  ChatSessionState,
} from "./types.js";
import {
  chatRunChoiceFromDetail,
  chatRunChoicesFromDetails,
  runChoiceSummary,
  toChatRunChoice,
  type ChatRunChoiceInput,
} from "./run-choices.js";
import { formatCompactChatRunOptions } from "./run-options-format.js";
import { isRunStatusFilter, runStatusFilterUsage } from "./run-status-filter.js";
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

interface ChatRunMessageContext {
  readonly workflowTarget: string;
  readonly runTask: string;
  readonly runWorkflowLocator: WorkflowLocator;
  readonly runOptions?: ChatRunOptions;
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
  readonly projectRoot?: string;
  readonly tag?: string;
  readonly status?: string;
  readonly missingChoice?: boolean;
}

const isExitCommand = (input: string): boolean => input === "/exit" || input === "/quit";

const workflowTargetFromCommand = (input: string): string | undefined =>
  input.startsWith("/workflow ") ? input.slice("/workflow ".length).trim() : undefined;

const detailsTargetFromCommand = (input: string): string | undefined =>
  input.startsWith("/details ") ? input.slice("/details ".length).trim() : undefined;

const retryTargetFromCommand = (input: string): string | undefined =>
  input.startsWith("/retry ") ? input.slice("/retry ".length).trim() : undefined;

const runDetailShortcutTargetFromInput = (
  input: string,
  state: ChatSessionState
): string | undefined =>
  /^\d+$/u.test(input) && state.runChoices && state.runChoices.length > 0 ? input : undefined;

const workflowChoiceShortcutTargetFromInput = (
  input: string,
  state: ChatSessionState
): string | undefined =>
  /^\d+$/u.test(input) &&
  !state.runChoices?.length &&
  !state.sessionChoices?.length &&
  state.workflowChoices &&
  state.workflowChoices.length > 0
    ? input
    : undefined;

const sessionChoiceShortcutTargetFromInput = (
  input: string,
  state: ChatSessionState
): string | undefined =>
  /^\d+$/u.test(input) &&
  !state.runChoices?.length &&
  !state.workflowChoices?.length &&
  state.sessionChoices &&
  state.sessionChoices.length > 0
    ? input
    : undefined;

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
): SessionListFilter | undefined => {
  const target = sessionsTagFromCommand(input);
  const parts = commandParts(input);
  const unknownOption = parts[1]?.startsWith("--") && parts[1] !== "--project";
  return unknownOption
    ? undefined
    : parts[1] === "--project"
    ? {
        projectRoot: parts[2] ? resolveProjectRootTarget(state, parts[2]) : state.projectRoot ?? state.cwd,
      }
    : target === "here"
      ? { projectRoot: state.projectRoot ?? state.cwd }
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

const chatRunOptionsFromCommandOptions = (options: ChatCommandOptions): ChatRunOptions => ({
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
  runSummary?: WorkflowRunSummary,
  runContext?: ChatRunMessageContext
): ChatSessionState =>
  appendChatMessage(state, {
    ...createChatMessage("assistant", content),
    ...(runContext ? { workflowTarget: runContext.workflowTarget } : {}),
    ...(runContext ? { runTask: runContext.runTask } : {}),
    ...(runContext ? { runWorkflowLocator: runContext.runWorkflowLocator } : {}),
    ...(runContext?.runOptions ? { runOptions: runContext.runOptions } : {}),
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

const findRunChoiceInState = (
  state: ChatSessionState,
  executionId: string
): ChatRunChoice | undefined =>
  state.messages
    .flatMap((message) =>
      message.runSummary?.executionId === executionId
        ? [
            {
              runSummary: message.runSummary,
              ...(state.projectRoot ? { projectRoot: state.projectRoot } : {}),
              messageId: message.id,
              source: "message",
              ...(message.runTask ? { runTask: message.runTask } : {}),
              ...(message.runWorkflowLocator
                ? { runWorkflowLocator: message.runWorkflowLocator }
                : {}),
              ...(message.runOptions ? { runOptions: message.runOptions } : {}),
            },
          ]
        : []
    )
    .at(0) ??
  (state.lastRunSummary?.executionId === executionId
    ? {
        runSummary: state.lastRunSummary,
        ...(state.projectRoot ? { projectRoot: state.projectRoot } : {}),
        source: "lastRunSummary",
        ...(state.lastRunTask ? { runTask: state.lastRunTask } : {}),
        ...(state.lastRunWorkflowLocator
          ? { runWorkflowLocator: state.lastRunWorkflowLocator }
          : {}),
        ...(state.lastRunOptions ? { runOptions: state.lastRunOptions } : {}),
      }
    : undefined);

const runChoiceContextForSummary = (
  state: ChatSessionState,
  summary: WorkflowRunSummary
): Pick<ChatRunChoice, "runTask" | "runWorkflowLocator" | "runOptions"> =>
  state.lastRunSummary?.executionId === summary.executionId
    ? {
        ...(state.lastRunTask ? { runTask: state.lastRunTask } : {}),
        ...(state.lastRunWorkflowLocator
          ? { runWorkflowLocator: state.lastRunWorkflowLocator }
          : {}),
        ...(state.lastRunOptions ? { runOptions: state.lastRunOptions } : {}),
      }
    : {};

const runChoiceFromMessage = (
  state: ChatSessionState,
  message: ChatMessage
): ReadonlyArray<ChatRunChoice> =>
  message.runSummary
    ? [
        {
          runSummary: message.runSummary,
          ...(state.projectRoot ? { projectRoot: state.projectRoot } : {}),
          messageId: message.id,
          source: "message",
          ...(message.runTask ? { runTask: message.runTask } : {}),
          ...(message.runWorkflowLocator
            ? { runWorkflowLocator: message.runWorkflowLocator }
            : {}),
          ...(message.runOptions ? { runOptions: message.runOptions } : {}),
        },
      ]
    : [];

const runChoicesFromState = (state: ChatSessionState): ReadonlyArray<ChatRunChoice> =>
  uniqueRunChoices([
    ...state.messages.flatMap((message) => runChoiceFromMessage(state, message)),
    ...(state.lastRunSummary
      ? [
          {
            runSummary: state.lastRunSummary,
            ...(state.projectRoot ? { projectRoot: state.projectRoot } : {}),
            source: "lastRunSummary",
            ...runChoiceContextForSummary(state, state.lastRunSummary),
          },
        ]
      : []),
    ...(state.inspectedRunSummary
      ? [
          {
            runSummary: state.inspectedRunSummary,
            ...(state.projectRoot ? { projectRoot: state.projectRoot } : {}),
            source: "inspectedRunSummary",
            ...runChoiceContextForSummary(state, state.inspectedRunSummary),
          },
        ]
      : []),
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

const runChoiceEntryForTarget = (
  state: ChatSessionState,
  target: string
): ChatRunChoice | undefined => {
  const choiceIndex = runChoiceIndexFromTarget(target);
  return choiceIndex === undefined
    ? state.runChoices?.find((choice) => runChoiceSummary(choice).executionId === target)
    : runChoiceEntryAt(state, choiceIndex);
};

const formatRunChoiceSummaryLine = (choice: ChatRunChoice, index: number): string => {
  const summary = runChoiceSummary(choice);
  return [
    `${index + 1}. ${summary.executionId}`,
    choice.sessionId,
    summary.workflowName,
    summary.status,
    formatRunTaskText(choice.runTask),
    choice.runTask ? `retry ${choice.runWorkflowLocator?.name ?? summary.workflowName}` : "no retry",
    formatCompactChatRunOptions(choice.runOptions)
      ? `options ${formatCompactChatRunOptions(choice.runOptions)}`
      : "options default",
    `${summary.completedStepCount}/${summary.totalStepCount} steps`,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");
};

const openedRunDetailsMessage = (
  summary: WorkflowRunSummary,
  choice: ChatRunChoice | undefined,
  persistedDetail: ChatRunDetail | undefined
): string => {
  const sessionId = choice?.sessionId ?? persistedDetail?.sessionId;
  const retryTask = choice?.runTask ?? persistedDetail?.runTask;
  const sourceMessage = sessionId
    ? ` Use /session ${sessionId} to switch to the source session.`
    : "";
  const retryMessage = retryTask ? " Use /retry to rerun this task." : "";
  return `Opened run details ${summary.executionId}.${sourceMessage}${retryMessage}`;
};

const clearPanels = (state: ChatSessionState): ChatSessionState =>
  state.inspectedRunSummary
    ? {
        ...state,
        inspectedRunSummary: undefined,
        sessionChoices: undefined,
        selectedSessionChoiceIndex: undefined,
        workflowChoices: undefined,
        showHelpPanel: undefined,
      }
    : {
        ...state,
        inspectedRunSummary: undefined,
        runChoices: undefined,
        sessionChoices: undefined,
        selectedSessionChoiceIndex: undefined,
        workflowChoices: undefined,
        showHelpPanel: undefined,
      };

const withoutPanels = (state: ChatSessionState): ChatSessionState => ({
  ...state,
  inspectedRunSummary: undefined,
  runChoices: undefined,
  sessionChoices: undefined,
  selectedSessionChoiceIndex: undefined,
  workflowChoices: undefined,
  showHelpPanel: undefined,
});

const clampSessionChoiceIndex = (
  choices: ReadonlyArray<ChatSessionSummary>,
  index: number | undefined
): number => Math.min(Math.max(index ?? 0, 0), Math.max(choices.length - 1, 0));

const withSessionChoicesOnly = (state: ChatSessionState): ChatSessionState => ({
  ...withoutPanels(state),
  ...(state.sessionChoices && state.sessionChoices.length > 0
    ? {
        sessionChoices: state.sessionChoices,
        selectedSessionChoiceIndex: clampSessionChoiceIndex(
          state.sessionChoices,
          state.selectedSessionChoiceIndex
        ),
      }
    : {}),
});

const withWorkflowChoicesOnly = (state: ChatSessionState): ChatSessionState => ({
  ...withoutPanels(state),
  ...(state.workflowChoices && state.workflowChoices.length > 0
    ? { workflowChoices: state.workflowChoices }
    : {}),
});

const withRunChoicesOnly = (state: ChatSessionState): ChatSessionState => ({
  ...withoutPanels(state),
  ...(state.runChoices && state.runChoices.length > 0 ? { runChoices: state.runChoices } : {}),
});

const withoutDeletedSessionChoice = (
  state: ChatSessionState,
  deletedSessionId: string
): ChatSessionState => {
  const nextSessionChoices = state.sessionChoices?.filter(
    (summary) => summary.sessionId !== deletedSessionId
  );
  return {
    ...withoutPanels(state),
    ...(nextSessionChoices && nextSessionChoices.length > 0
      ? {
          sessionChoices: nextSessionChoices,
          selectedSessionChoiceIndex: clampSessionChoiceIndex(
            nextSessionChoices,
            state.selectedSessionChoiceIndex
          ),
        }
      : {}),
  };
};

const withRenamedSessionChoice = (
  state: ChatSessionState,
  fromSessionId: string,
  toSessionId: string
): ChatSessionState => {
  const nextSessionChoices = state.sessionChoices?.map((summary) =>
    summary.sessionId === fromSessionId ? { ...summary, sessionId: toSessionId } : summary
  );
  return {
    ...withoutPanels(state),
    ...(nextSessionChoices && nextSessionChoices.length > 0
      ? {
          sessionChoices: nextSessionChoices,
          selectedSessionChoiceIndex: clampSessionChoiceIndex(
            nextSessionChoices,
            state.selectedSessionChoiceIndex
          ),
        }
      : {}),
  };
};

const hasPickerPanel = (state: ChatSessionState): boolean =>
  Boolean(
    (state.runChoices && state.runChoices.length > 0) ||
      (state.sessionChoices && state.sessionChoices.length > 0) ||
      (state.workflowChoices && state.workflowChoices.length > 0)
  );

const clearPanelMessage = (state: ChatSessionState): string =>
  state.inspectedRunSummary
    ? "Closed run details view."
    : state.showHelpPanel
      ? "Closed help panel."
      : hasPickerPanel(state)
        ? "Closed selection panels."
        : "No panel is open.";

const withHelpPanel = (state: ChatSessionState): ChatSessionState => ({
  ...state,
  inspectedRunSummary: undefined,
  runChoices: undefined,
  sessionChoices: undefined,
  selectedSessionChoiceIndex: undefined,
  workflowChoices: undefined,
  showHelpPanel: true,
});

const formatRunListMessage = (choices: ReadonlyArray<ChatRunChoice>): string =>
  choices.length > 0
    ? [
        "Recent workflow runs:",
        ...choices.map(formatRunChoiceSummaryLine),
        "Type 1 to open a run, or use /details <executionId>.",
      ].join("\n")
    : "No workflow runs found in this chat session.";

const runListFilterFromCommand = (
  input: string,
  state: ChatSessionState
): RunListFilter | undefined => {
  const parts = commandParts(input);
  const options = parts.slice(1);
  const statusShortcut =
    options.length === 1 && options[0] && !options[0].startsWith("--") ? options[0] : undefined;
  const knownOptions = ["--all", "--session", "--project", "--tag", "--status"];
  const hasOption = (option: string): boolean => options.includes(option);
  const optionValue = (option: string): string | undefined => {
    const optionIndex = parts.indexOf(option);
    const value = optionIndex >= 0 ? parts[optionIndex + 1] : undefined;
    return value && !value.startsWith("--") ? value : undefined;
  };
  const hasUnknownOption = options.some(
    (part) => part.startsWith("--") && !knownOptions.includes(part)
  );
  const sessionTarget = optionValue("--session");
  const sessionFilter =
    hasOption("--session") && sessionTarget ? sessionIdFromTarget(state, sessionTarget) : undefined;
  const projectTarget = optionValue("--project");
  const projectRoot = projectTarget
    ? resolveProjectRootTarget(state, projectTarget)
    : state.projectRoot ?? state.cwd;
  const hasKnownOption = options.some((part) => knownOptions.includes(part));
  const hasRequiredValue =
    (!hasOption("--session") || Boolean(sessionTarget)) &&
    (!hasOption("--tag") || Boolean(optionValue("--tag"))) &&
    (!hasOption("--status") || Boolean(optionValue("--status")));
  const statusFilter = statusShortcut ?? optionValue("--status");
  const hasValidStatus = !statusFilter || isRunStatusFilter(statusFilter);

  return statusShortcut && hasValidStatus
    ? { status: statusShortcut }
    : !hasKnownOption || hasUnknownOption || !hasRequiredValue || !hasValidStatus
    ? undefined
    : sessionFilter?.missingChoice
      ? { missingChoice: true }
      : {
          ...(sessionFilter ? { sessionId: sessionFilter.sessionId } : {}),
          ...(hasOption("--project") ? { projectRoot } : {}),
          ...(optionValue("--tag") ? { tag: optionValue("--tag") } : {}),
          ...(statusFilter ? { status: statusFilter } : {}),
        };
};

const persistedRunScopeText = (filter: RunListFilter): string =>
  [
    filter.sessionId ? `session ${filter.sessionId}` : "all sessions",
    filter.projectRoot ? `project ${filter.projectRoot}` : undefined,
    filter.tag ? `tag ${filter.tag}` : undefined,
    filter.status ? `status ${filter.status}` : undefined,
  ]
    .filter((part): part is string => Boolean(part))
    .join(", ");

const formatRunTaskText = (task: string | undefined): string =>
  task ? `task ${task.length > 48 ? `${task.slice(0, 47)}…` : task}` : "task -";

const formatPersistedRunSummaryLine = (detail: ChatRunDetail, index: number): string =>
  [
    `${index + 1}. ${detail.runSummary.executionId}`,
    detail.sessionId,
    detail.projectRoot ? `project ${detail.projectRoot}` : "project -",
    detail.runSummary.workflowName,
    detail.runSummary.status,
    formatRunTaskText(detail.runTask),
    detail.runTask
      ? `retry ${detail.runWorkflowLocator?.name ?? detail.runSummary.workflowName}`
      : "no retry",
    formatCompactChatRunOptions(detail.runOptions)
      ? `options ${formatCompactChatRunOptions(detail.runOptions)}`
      : "options default",
    `${detail.runSummary.completedStepCount}/${detail.runSummary.totalStepCount} steps`,
  ].join(" · ");

const formatPersistedRunListMessage = (
  details: ReadonlyArray<ChatRunDetail>,
  filter: RunListFilter
): string =>
  details.length > 0
    ? [
        `Persisted workflow runs (${persistedRunScopeText(filter)}):`,
        ...details.map(formatPersistedRunSummaryLine),
        "Use /retry 1 to rerun directly, or /details 1 to inspect first.",
      ].join("\n")
    : `No persisted workflow runs found for ${persistedRunScopeText(filter)}.`;

const withRunChoices = (
  state: ChatSessionState,
  runChoices: ReadonlyArray<ChatRunChoiceInput>
): ChatSessionState => ({
  ...state,
  inspectedRunSummary: undefined,
  runChoices: runChoices.map((choice) => toChatRunChoice(choice, state.sessionId)),
  sessionChoices: undefined,
  selectedSessionChoiceIndex: undefined,
  workflowChoices: undefined,
  showHelpPanel: undefined,
});

const formatSessionTags = (tags: ReadonlyArray<string> | undefined): string =>
  tags && tags.length > 0 ? tags.join(", ") : "none";

const withSessionTags = (
  state: ChatSessionState,
  tags: ReadonlyArray<string>
): ChatSessionState => ({
  ...state,
  tags,
  inspectedRunSummary: undefined,
  runChoices: undefined,
  sessionChoices: undefined,
  selectedSessionChoiceIndex: undefined,
  workflowChoices: undefined,
  showHelpPanel: undefined,
});

const withSessionChoices = (
  state: ChatSessionState,
  sessionChoices: ReadonlyArray<ChatSessionSummary>
): ChatSessionState => ({
  ...state,
  inspectedRunSummary: undefined,
  sessionChoices,
  selectedSessionChoiceIndex: sessionChoices.length > 0 ? 0 : undefined,
  runChoices: undefined,
  workflowChoices: undefined,
  showHelpPanel: undefined,
});

const withInspectedRunSummary = (
  state: ChatSessionState,
  summary: WorkflowRunSummary,
  runChoices: ReadonlyArray<ChatRunChoice> | undefined = state.runChoices
): ChatSessionState => ({
  ...state,
  inspectedRunSummary: summary,
  runChoices,
  sessionChoices: undefined,
  selectedSessionChoiceIndex: undefined,
  workflowChoices: undefined,
  showHelpPanel: undefined,
});

const withRetryContextFromRunDetail = (
  state: ChatSessionState,
  choice: ChatRunChoice | undefined,
  persistedDetail: ChatRunDetail | undefined
): ChatSessionState => {
  const runTask = choice?.runTask ?? persistedDetail?.runTask;
  const runWorkflowLocator = choice?.runWorkflowLocator ?? persistedDetail?.runWorkflowLocator;
  const runOptions = choice?.runOptions ?? persistedDetail?.runOptions;
  const runSummary = choice?.runSummary ?? persistedDetail?.runSummary;
  const runProjectRoot = choice?.projectRoot ?? persistedDetail?.projectRoot;
  return runTask
    ? {
        ...state,
        lastRunTask: runTask,
        lastRunProjectRoot: runProjectRoot,
        lastRunWorkflowLocator: runWorkflowLocator,
        lastRunOptions: runOptions,
        ...(runSummary ? { lastRunSummary: runSummary } : {}),
        lastRunCommand: runWorkflowLocator
          ? `obora run ${runWorkflowLocator.displayPath}`
          : undefined,
      }
    : state;
};

const retryUnavailableResult = (state: ChatSessionState, target: string): ChatTurnResult => ({
  state: appendAssistant(
    withoutPanels(state),
    `Run is not retryable: ${target}. Open a run with retry metadata from /runs, or run a workflow task first.`
  ),
  exit: false,
});

const retryRunFromContext = ({
  state,
  target,
  choice,
  persistedDetail,
  resolveWorkflow,
  runWorkflow,
  commandOptions,
}: {
  readonly state: ChatSessionState;
  readonly target: string;
  readonly choice?: ChatRunChoice;
  readonly persistedDetail?: ChatRunDetail;
  readonly resolveWorkflow: (
    target: string,
    projectRoot?: string
  ) => Promise<WorkflowLocator>;
  readonly runWorkflow: typeof runRun;
  readonly commandOptions: ChatCommandOptions;
}): Promise<ChatTurnResult> | ChatTurnResult => {
  const retryContext = choice ?? persistedDetail;
  const retryState = withRetryContextFromRunDetail(state, choice, persistedDetail);
  if (!retryContext?.runTask) {
    return retryUnavailableResult(state, target);
  }
  const runTask = retryContext.runTask;
  const runResolvedWorkflow = (workflowLocator: WorkflowLocator): Promise<ChatTurnResult> =>
    runChatTask({
      state: retryState,
      workflowLocator,
      message: runTask,
      ...(retryContext.runOptions ? { runOptionsOverride: retryContext.runOptions } : {}),
      runWorkflow,
      commandOptions,
    });
  return retryContext.runWorkflowLocator
    ? runResolvedWorkflow(retryContext.runWorkflowLocator)
    : resolveWorkflow(
        retryContext.runSummary.workflowName,
        retryContext.projectRoot ?? state.projectRoot
      )
        .then(runResolvedWorkflow)
        .catch((error: unknown): ChatTurnResult =>
          workflowResolveFailureResult(retryState, error)
        );
};

const sessionChoiceIndexFromTarget = (target: string): number | undefined =>
  /^\d+$/u.test(target) ? Number.parseInt(target, 10) - 1 : undefined;

const sessionChoiceAt = (
  state: ChatSessionState,
  index: number
): ChatSessionSummary | undefined =>
  index >= 0 && state.sessionChoices ? state.sessionChoices[index] : undefined;

const selectedSessionChoiceAt = (state: ChatSessionState): ChatSessionSummary | undefined =>
  state.sessionChoices
    ? sessionChoiceAt(
        state,
        clampSessionChoiceIndex(state.sessionChoices, state.selectedSessionChoiceIndex)
      )
    : undefined;

const movedSessionChoiceIndex = (
  choices: ReadonlyArray<ChatSessionSummary>,
  index: number | undefined,
  direction: "next" | "prev"
): number =>
  direction === "next"
    ? (clampSessionChoiceIndex(choices, index) + 1) % choices.length
    : (clampSessionChoiceIndex(choices, index) - 1 + choices.length) % choices.length;

const moveSessionChoiceSelection = (
  state: ChatSessionState,
  direction: "next" | "prev"
): ChatTurnResult =>
  state.sessionChoices && state.sessionChoices.length > 0
    ? {
        state: appendAssistant(
          {
            ...withSessionChoicesOnly(state),
            selectedSessionChoiceIndex: movedSessionChoiceIndex(
              state.sessionChoices,
              state.selectedSessionChoiceIndex,
              direction
            ),
          },
          `Selected session ${
            state.sessionChoices[
              movedSessionChoiceIndex(
                state.sessionChoices,
                state.selectedSessionChoiceIndex,
                direction
              )
            ]?.sessionId
          }.`
        ),
        exit: false,
      }
    : {
        state: appendAssistant(
          withSessionChoicesOnly(state),
          "No session choices are open. Run /sessions first."
        ),
        exit: false,
      };

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
    ...(loaded.runChoices ?? []),
    ...(current.runChoices ?? []),
  ]),
  ...(commandOptions.provider ? { providerName: commandOptions.provider } : {}),
  ...(commandOptions.model ? { modelName: commandOptions.model } : {}),
});

const switchedSessionMessage = (
  sessionId: string,
  state: ChatSessionState
): string =>
  state.inspectedRunSummary
    ? `Switched to session ${sessionId}. Still showing run details ${state.inspectedRunSummary.executionId}.`
    : `Switched to session ${sessionId}.`;

const appendSwitchedSessionMessage = (
  state: ChatSessionState,
  sessionId: string
): ChatSessionState => appendAssistant(state, switchedSessionMessage(sessionId, state));

const resolveProjectRootTarget = (state: ChatSessionState, target: string): string =>
  resolve(state.cwd, target);

const withProjectRoot = (state: ChatSessionState, projectRoot: string): ChatSessionState => ({
  ...state,
  projectRoot,
  workflowTarget: undefined,
  workflowLocator: undefined,
  workflowChoices: [],
  inspectedRunSummary: undefined,
  runChoices: undefined,
  sessionChoices: undefined,
  selectedSessionChoiceIndex: undefined,
  showHelpPanel: undefined,
  lastError: undefined,
});

const formatSessionSummaryLine = (summary: ChatSessionSummary): string =>
  [
    `- ${summary.sessionId}`,
    summary.status,
    summary.workflowTarget ?? "no workflow",
    `project ${summary.projectRoot ?? summary.cwd}`,
    summary.lastRunTask && summary.lastRunWorkflowName
      ? `retry ${summary.lastRunWorkflowName} -> ${summary.lastRunTask}`
      : "no retry",
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

const retryWorkflowName = (state: ChatSessionState): string | undefined =>
  state.lastRunWorkflowLocator?.name ?? state.lastRunSummary?.workflowName;

const retryRunCommand = (state: ChatSessionState): string | undefined =>
  state.lastRunWorkflowLocator
    ? `obora run ${state.lastRunWorkflowLocator.displayPath}`
    : retryWorkflowName(state)
      ? `obora run ${retryWorkflowName(state)}`
      : undefined;

const formatRetryTarget = (state: ChatSessionState): string =>
  state.lastRunTask && retryWorkflowName(state)
    ? `${retryWorkflowName(state)} -> ${state.lastRunTask}`
    : "none";

const retryProjectLine = (state: ChatSessionState): string | undefined =>
  state.lastRunProjectRoot && state.lastRunProjectRoot !== (state.projectRoot ?? state.cwd)
    ? `Retry project: ${state.lastRunProjectRoot}`
    : undefined;

const formatRetryStatusMessage = (state: ChatSessionState): string =>
  state.lastRunTask && retryWorkflowName(state)
    ? [
        "Retry target:",
        `Workflow: ${retryWorkflowName(state)} (${
          state.lastRunWorkflowLocator?.scope ?? "resolved on retry"
        })`,
        ...(retryProjectLine(state) ? [retryProjectLine(state)] : []),
        `Task: ${state.lastRunTask}`,
        ...(state.lastRunWorkflowLocator ? [`Path: ${state.lastRunWorkflowLocator.displayPath}`] : []),
        ...(formatCompactChatRunOptions(state.lastRunOptions)
          ? [`Options: ${formatCompactChatRunOptions(state.lastRunOptions)}`]
          : []),
        ...(retryRunCommand(state) ? [`Command: ${retryRunCommand(state)}`] : []),
        "Run /retry to execute it again.",
      ].join("\n")
    : "No retry target is available. Run a workflow task first with /run <task> or open a retryable run with /details.";

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
    `Last run: ${state.lastRunCommand ?? retryRunCommand(state) ?? "none"}`,
    `Retry: ${formatRetryTarget(state)}`,
    ...(retryProjectLine(state) ? [retryProjectLine(state)] : []),
    ...(formatCompactChatRunOptions(state.lastRunOptions)
      ? [`Retry options: ${formatCompactChatRunOptions(state.lastRunOptions)}`]
      : []),
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
  inspectedRunSummary: undefined,
  workflowChoices,
  runChoices: undefined,
  sessionChoices: undefined,
  selectedSessionChoiceIndex: undefined,
  showHelpPanel: undefined,
});

const withResolvedWorkflow = (
  state: ChatSessionState,
  workflowTarget: string,
  workflowLocator: WorkflowLocator
): ChatSessionState => ({
  ...state,
  workflowTarget,
  workflowLocator,
  workflowChoices: undefined,
  inspectedRunSummary: undefined,
  runChoices: undefined,
  sessionChoices: undefined,
  selectedSessionChoiceIndex: undefined,
  showHelpPanel: undefined,
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
  runOptionsOverride,
  runWorkflow,
  commandOptions,
}: {
  readonly state: ChatSessionState;
  readonly workflowLocator: WorkflowLocator;
  readonly message: string;
  readonly runOptionsOverride?: ChatRunOptions;
  readonly runWorkflow: typeof runRun;
  readonly commandOptions: ChatCommandOptions;
}): Promise<ChatTurnResult> => {
  const userState = appendChatMessage(withoutPanels(state), createChatMessage("user", message));
  const runningState = setChatStatus(userState, "running");
  const runInput = createChatRunInput({
    message,
    sessionId: state.sessionId,
    workflowName: workflowLocator.name,
    workflowPath: workflowLocator.path,
  });
  const lastRunCommand = `obora run ${workflowLocator.displayPath}`;
  const workflowTarget = state.workflowTarget ?? workflowLocator.displayPath;
  const runMetadataOptions =
    runOptionsOverride ?? chatRunOptionsFromCommandOptions(commandOptions);
  const hasRunMetadataOptions = Object.keys(runMetadataOptions).length > 0;
  const runOptions = {
    ...commandRunOptions(commandOptions),
    ...(runOptionsOverride ?? {}),
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
            lastRunTask: message,
            lastRunProjectRoot: state.projectRoot ?? state.cwd,
            lastRunWorkflowLocator: workflowLocator,
            lastRunOptions: hasRunMetadataOptions ? runMetadataOptions : undefined,
            ...(runSummary ? { lastRunSummary: runSummary } : {}),
          },
          formatRunSummaryMessage(runSummary, commandOptions.dryRun),
          runSummary,
          {
            workflowTarget,
            runTask: message,
            runWorkflowLocator: workflowLocator,
            ...(hasRunMetadataOptions ? { runOptions: runMetadataOptions } : {}),
          }
        ),
        exit: false,
      };
    })
    .catch((error: unknown): ChatTurnResult => {
      const failureMessage = errorMessage(error);
      return {
        state: appendAssistant(
          {
            ...setChatStatus(runningState, "failed", failureMessage),
            lastRunCommand,
            lastRunTask: message,
            lastRunProjectRoot: state.projectRoot ?? state.cwd,
            lastRunWorkflowLocator: workflowLocator,
            lastRunOptions: hasRunMetadataOptions ? runMetadataOptions : undefined,
          },
          `Workflow run failed: ${failureMessage}`
        ),
        exit: false,
      };
    });
};

const workflowResolveFailureResult = (
  state: ChatSessionState,
  error: unknown
): ChatTurnResult => {
  const message = errorMessage(error);
  return {
    state: appendAssistant(
      setChatStatus(withoutPanels(state), "failed", message),
      `Workflow resolve failed: ${message}`
    ),
    exit: false,
  };
};

const listFailureResult = (
  state: ChatSessionState,
  label: string,
  error: unknown
): ChatTurnResult => {
  const message = errorMessage(error);
  return {
    state: appendAssistant(
      setChatStatus(withoutPanels(state), "failed", message),
      `${label} failed: ${message}`
    ),
    exit: false,
  };
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
  readonly listRuns?: (
    sessionId?: string,
    filter?: RunListFilter
  ) => Promise<ReadonlyArray<ChatRunDetail>>;
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
    return {
      state: appendAssistant(withHelpPanel(state), "Opened help panel."),
      exit: false,
    };
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
        withoutPanels(state),
        "Usage: /run <task>. You can also use /run #1 <task> after /workflows, or /run --workflow <name-or-path> <task>."
      ),
      exit: false,
    };
  }

  if (trimmed === "/retry") {
    return state.lastRunWorkflowLocator && state.lastRunTask
      ? runChatTask({
          state,
          workflowLocator: state.lastRunWorkflowLocator,
          message: state.lastRunTask,
          ...(state.lastRunOptions ? { runOptionsOverride: state.lastRunOptions } : {}),
          runWorkflow,
          commandOptions,
        })
      : state.lastRunTask && state.lastRunSummary?.workflowName
        ? resolveWorkflow(
            state.lastRunSummary.workflowName,
            state.lastRunProjectRoot ?? state.projectRoot
          )
            .then((workflowLocator): Promise<ChatTurnResult> =>
              runChatTask({
                state,
                workflowLocator,
                message: state.lastRunTask ?? "",
                ...(state.lastRunOptions ? { runOptionsOverride: state.lastRunOptions } : {}),
                runWorkflow,
                commandOptions,
              })
            )
            .catch((error: unknown): ChatTurnResult => workflowResolveFailureResult(state, error))
        : state.workflowLocator && state.lastRunTask
          ? runChatTask({
              state,
              workflowLocator: state.workflowLocator,
              message: state.lastRunTask,
              ...(state.lastRunOptions ? { runOptionsOverride: state.lastRunOptions } : {}),
              runWorkflow,
              commandOptions,
            })
      : {
          state: appendAssistant(
            withoutPanels(state),
            "Nothing to retry yet. Run a workflow task first with /run <task>."
          ),
          exit: false,
        };
  }

  if (trimmed === "/retry status") {
    return {
      state: appendAssistant(withoutPanels(state), formatRetryStatusMessage(state)),
      exit: false,
    };
  }

  const retryTarget = retryTargetFromCommand(trimmed);
  if (retryTarget && retryTarget !== "status") {
    const retryChoiceIndex = runChoiceIndexFromTarget(retryTarget);
    const choice = runChoiceEntryForTarget(state, retryTarget);
    return choice
      ? retryRunFromContext({
          state,
          target: retryTarget,
          choice,
          resolveWorkflow,
          runWorkflow,
          commandOptions,
        })
      : retryChoiceIndex !== undefined
        ? {
            state: appendAssistant(
              withRunChoicesOnly(state),
              "Run choice not found. Run /runs first, then use /retry 1."
            ),
            exit: false,
          }
      : (findRun
          ? findRun(retryTarget)
          : findChatRunDetail({ cwd: state.cwd, executionId: retryTarget })
        )
          .then((detail): Promise<ChatTurnResult> | ChatTurnResult =>
            detail
              ? retryRunFromContext({
                  state,
                  target: retryTarget,
                  persistedDetail: detail,
                  resolveWorkflow,
                  runWorkflow,
                  commandOptions,
                })
              : {
                  state: appendAssistant(
                    withoutPanels(state),
                    `Run details not found: ${retryTarget}`
                  ),
                  exit: false,
                }
          )
          .catch((error: unknown): ChatTurnResult => listFailureResult(state, "Run lookup", error));
  }

  if (trimmed === "/runs") {
    const choices = runChoicesFromState(state);
    return {
      state: appendAssistant(withRunChoices(state, choices), formatRunListMessage(choices)),
      exit: false,
    };
  }

  if (trimmed.startsWith("/runs ")) {
    const filter = runListFilterFromCommand(trimmed, state);
    if (!filter) {
      return {
        state: appendAssistant(
          withoutPanels(state),
          `Usage: /runs, /runs failed, /runs --all, /runs --session <id-or-number>, /runs --project [path], /runs --tag <tag>, or /runs --status <${runStatusFilterUsage()}>.`
        ),
        exit: false,
      };
    }
    if (filter.missingChoice) {
      return {
        state: appendAssistant(
          withSessionChoicesOnly(state),
          "Session choice not found. Run /sessions first."
        ),
        exit: false,
      };
    }
    const hasPersistedRunFilters = Boolean(filter.projectRoot || filter.tag || filter.status);
    return (listRuns
      ? hasPersistedRunFilters
        ? listRuns(filter.sessionId, filter)
        : listRuns(filter.sessionId)
      : listChatRunDetails({
          cwd: state.cwd,
          ...(filter.sessionId ? { sessionId: filter.sessionId } : {}),
          ...(filter.projectRoot ? { projectRoot: filter.projectRoot } : {}),
          ...(filter.tag ? { tag: filter.tag } : {}),
          ...(filter.status ? { status: filter.status } : {}),
        }))
      .then((details): ChatTurnResult => ({
        state: appendAssistant(
          withRunChoices(state, chatRunChoicesFromDetails(details).slice(0, 8)),
          formatPersistedRunListMessage(details, filter)
        ),
        exit: false,
      }))
      .catch((error: unknown): ChatTurnResult => listFailureResult(state, "Run list", error));
  }

  if (trimmed === "/sessions" || trimmed.startsWith("/sessions ")) {
    const filter = sessionListFilterFromCommand(trimmed, state);
    if (!filter) {
      return {
        state: appendAssistant(
          withoutPanels(state),
          "Usage: /sessions, /sessions here, /sessions <tag>, or /sessions --project [path]."
        ),
        exit: false,
      };
    }
    return (listSessions
      ? listSessions(filter.tag, filter.projectRoot)
      : listChatSessionSummaries({
          cwd: state.cwd,
          ...(filter.tag ? { tag: filter.tag } : {}),
          ...(filter.projectRoot ? { projectRoot: filter.projectRoot } : {}),
        }))
      .then((summaries): ChatTurnResult => ({
        state: appendAssistant(
          withSessionChoices(state, summaries.slice(0, 8)),
          formatSessionListMessage(summaries, filter)
        ),
        exit: false,
      }))
      .catch((error: unknown): ChatTurnResult => listFailureResult(state, "Session list", error));
  }

  if (trimmed === "/session") {
    return {
      state: appendAssistant(state, formatSessionStatusMessage(state)),
      exit: false,
    };
  }

  const sessionTarget =
    sessionTargetFromCommand(trimmed) ?? sessionChoiceShortcutTargetFromInput(trimmed, state);
  if (sessionTarget !== undefined) {
    if (sessionTarget === "next" || sessionTarget === "prev") {
      return moveSessionChoiceSelection(state, sessionTarget);
    }

    if (sessionTarget === "open") {
      const selected = selectedSessionChoiceAt(state);
      return selected
        ? handleChatInput({
            input: `/session ${selected.sessionId}`,
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
          })
        : {
            state: appendAssistant(
              withSessionChoicesOnly(state),
              "No session choice is selected. Run /sessions first."
            ),
            exit: false,
          };
    }

    const renameCommand = sessionRenameFromCommand(sessionTarget);
    if (renameCommand) {
      const target = sessionIdFromTarget(state, renameCommand.target);
      const renameSessionId = target.sessionId;
      const renamed = renameSessionId
        ? await (renameSession
            ? renameSession(renameSessionId, renameCommand.nextSessionId)
            : renameChatSessionState({
                cwd: state.cwd,
                fromSessionId: renameSessionId,
                toSessionId: renameCommand.nextSessionId,
              }))
        : undefined;
      return target.missingChoice
        ? {
            state: appendAssistant(
              withSessionChoicesOnly(state),
              "Session choice not found. Run /sessions first, then use /session rename 1 <new-id>."
            ),
            exit: false,
          }
        : renamed && renameSessionId
          ? {
              state:
                renameSessionId === state.sessionId
                  ? appendAssistant(
                      withoutPanels(
                        normalizeLoadedSessionState({
                          current: state,
                          loaded: renamed,
                          commandOptions,
                        })
                      ),
                      `Renamed session ${renameSessionId} to ${renameCommand.nextSessionId}.`
                    )
                  : appendAssistant(
                      withRenamedSessionChoice(
                        state,
                        renameSessionId,
                        renameCommand.nextSessionId
                      ),
                      `Renamed session ${renameSessionId} to ${renameCommand.nextSessionId}.`
                    ),
              exit: false,
            }
          : {
              state: appendAssistant(
                withoutPanels(state),
                `Chat session not found: ${target.sessionId}`
              ),
              exit: false,
            };
    }

    const deleteTarget = sessionDeleteTargetFromCommand(sessionTarget);
    if (deleteTarget !== undefined) {
      const target = sessionIdFromTarget(state, deleteTarget);
      const deleteSessionId = target.sessionId;
      const deleted =
        deleteSessionId && deleteSessionId !== state.sessionId
          ? await (deleteSession
              ? deleteSession(deleteSessionId)
              : deleteChatSessionState({ cwd: state.cwd, sessionId: deleteSessionId }))
          : false;
      return target.missingChoice
        ? {
            state: appendAssistant(
              withSessionChoicesOnly(state),
              "Session choice not found. Run /sessions first, then use /session delete 1."
            ),
            exit: false,
          }
        : deleteSessionId === state.sessionId
          ? {
              state: appendAssistant(
                withoutPanels(state),
                "Cannot delete the active session. Switch to another session first."
              ),
              exit: false,
            }
          : deleted && deleteSessionId
            ? {
                state: appendAssistant(
                  withoutDeletedSessionChoice(state, deleteSessionId),
                  `Deleted session ${deleteSessionId}.`
                ),
                exit: false,
              }
            : {
                state: appendAssistant(
                  withoutPanels(state),
                  `Chat session not found: ${target.sessionId}`
                ),
                exit: false,
              };
    }

    const target = sessionIdFromTarget(state, sessionTarget);
    if (target.missingChoice) {
      return {
        state: appendAssistant(
          withSessionChoicesOnly(state),
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
          state: appendSwitchedSessionMessage(
            normalizeLoadedSessionState({ current: state, loaded, commandOptions }),
            targetSessionId
          ),
          exit: false,
        }
      : {
          state: appendAssistant(withoutPanels(state), `Chat session not found: ${targetSessionId}`),
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
    return (listWorkflowLocators
      ? listWorkflowLocators(scope, state.projectRoot)
      : listChatWorkflowLocators({
          cwd: state.cwd,
          scope,
          projectRoot: state.projectRoot ?? commandOptions.project,
          globalWorkflowDir: commandOptions.globalWorkflowsDir,
        }))
      .then((locators): ChatTurnResult => ({
        state: appendAssistant(
          withWorkflowChoices(state, locators.slice(0, 8)),
          formatWorkflowListMessage(locators, scope)
        ),
        exit: false,
      }))
      .catch((error: unknown): ChatTurnResult => listFailureResult(state, "Workflow list", error));
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

  const workflowTarget =
    workflowTargetFromCommand(trimmed) ?? workflowChoiceShortcutTargetFromInput(trimmed, state);
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
    if (choiceIndex !== undefined) {
      return {
        state: appendAssistant(
          withWorkflowChoicesOnly(state),
          "Workflow choice not found. Run /workflows first, then use /workflow 1."
        ),
        exit: false,
      };
    }
    const resolvingState = setChatStatus(state, "resolving");
    return resolveWorkflow(workflowTarget, state.projectRoot)
      .then((locator): ChatTurnResult => ({
        state: appendAssistant(
          withResolvedWorkflow(resolvingState, workflowTarget, locator),
          `Selected workflow ${locator.name} (${locator.scope}).`
        ),
        exit: false,
      }))
      .catch((error: unknown): ChatTurnResult => workflowResolveFailureResult(state, error));
  }

  if (isClearRunDetailsCommand(trimmed)) {
    return {
      state: appendAssistant(clearPanels(state), clearPanelMessage(state)),
      exit: false,
    };
  }

  if (trimmed === "/details") {
    const choice = state.runChoices?.at(0);
    const summary = choice ? runChoiceSummary(choice) : state.lastRunSummary;
    return summary
      ? {
          state: appendAssistant(
            withRetryContextFromRunDetail(
              withInspectedRunSummary(state, summary),
              choice,
              undefined
            ),
            openedRunDetailsMessage(summary, choice, undefined)
          ),
          exit: false,
        }
      : {
          state: appendAssistant(
            clearPanels(state),
            "No run details are available yet. Run a workflow first or use /runs to pick a persisted run."
          ),
          exit: false,
        };
  }

  const detailsExecutionId =
    detailsTargetFromCommand(trimmed) ?? runDetailShortcutTargetFromInput(trimmed, state);
  if (detailsExecutionId) {
    const choiceIndex = runChoiceIndexFromTarget(detailsExecutionId);
    const choice = choiceIndex === undefined ? undefined : runChoiceEntryAt(state, choiceIndex);
    const stateChoice =
      choice ??
      (choiceIndex === undefined ? findRunChoiceInState(state, detailsExecutionId) : undefined);
    if (choiceIndex !== undefined && !choice) {
      return {
        state: appendAssistant(
          withRunChoicesOnly(state),
          "Run choice not found. Run /runs first, then use /details 1."
        ),
        exit: false,
      };
    }
    const choiceSummary = stateChoice ? runChoiceSummary(stateChoice) : undefined;
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
        summary
          ? withRetryContextFromRunDetail(
              withInspectedRunSummary(state, summary, runChoices),
              stateChoice,
              persistedDetail
            )
          : clearPanels(state),
        summary
          ? openedRunDetailsMessage(summary, stateChoice, persistedDetail)
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
            withWorkflowChoicesOnly(state),
            "Workflow choice not found. Run /workflows first, then use /run #1 <task>."
          ),
          exit: false,
        };
  }

  const runOverride = runWorkflowOverrideFromInput(trimmed);
  if (runOverride) {
    return resolveWorkflow(runOverride.workflowTarget, state.projectRoot)
      .then((locator): Promise<ChatTurnResult> =>
        runChatTask({
          state: setChatStatus(state, "resolving"),
          workflowLocator: locator,
          message: runOverride.message,
          runWorkflow,
          commandOptions,
        })
      )
      .catch((error: unknown): ChatTurnResult => workflowResolveFailureResult(state, error));
  }

  if (!state.workflowLocator) {
    return {
      state: appendAssistant(
        withoutPanels(state),
        "Select a workflow first with /workflow <name-or-path>."
      ),
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
  readonly listRuns: (
    sessionId?: string,
    filter?: RunListFilter
  ) => Promise<ReadonlyArray<ChatRunDetail>>;
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
  const listRuns = (
    sessionId?: string,
    filter: RunListFilter = {}
  ): Promise<ReadonlyArray<ChatRunDetail>> =>
    listChatRunDetails({
      cwd: options.cwd,
      ...(sessionId ? { sessionId } : {}),
      ...(filter.projectRoot ? { projectRoot: filter.projectRoot } : {}),
      ...(filter.tag ? { tag: filter.tag } : {}),
      ...(filter.status ? { status: filter.status } : {}),
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
