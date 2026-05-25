import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { WorkflowLocator, WorkflowRunStepSummary, WorkflowRunSummary } from "@obora/sdk";

import { chatCommandHelpSections, chatPromptCommandRows } from "./commands.js";
import { runChoiceSummary } from "./run-choices.js";
import { visibleChatMessages } from "./state.js";
import type { ChatMessage, ChatRunChoice, ChatSessionState, ChatSessionStatus } from "./types.js";
import type { ChatSessionSummary } from "./store.js";

export interface ChatViewOptions {
  readonly rendererLabel?: string;
  readonly columns?: number;
}

const MIN_WIDTH = 78;
const MAX_WIDTH = 132;
const CARD_MAX_WIDTH = 92;

const ansi = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  gray: "\x1b[38;5;245m",
  muted: "\x1b[38;5;103m",
  cyan: "\x1b[38;5;117m",
  green: "\x1b[38;5;114m",
  yellow: "\x1b[38;5;229m",
  red: "\x1b[38;5;203m",
  violet: "\x1b[38;5;147m",
  inputBg: "\x1b[48;5;236m",
  inputFg: "\x1b[38;5;252m",
} as const;

const paint = (code: string, text: string): string => `${code}${text}${ansi.reset}`;
const bold = (text: string): string => paint(ansi.bold, text);
const dim = (text: string): string => paint(ansi.dim, text);
const gray = (text: string): string => paint(ansi.gray, text);
const muted = (text: string): string => paint(ansi.muted, text);
const cyan = (text: string): string => paint(ansi.cyan, text);
const green = (text: string): string => paint(ansi.green, text);
const yellow = (text: string): string => paint(ansi.yellow, text);
const red = (text: string): string => paint(ansi.red, text);
const violet = (text: string): string => paint(ansi.violet, text);
const inputBg = (text: string): string => paint(`${ansi.inputBg}${ansi.inputFg}`, text);

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const repeat = (char: string, count: number): string => char.repeat(Math.max(0, count));

const fit = (text: string, width: number): string => truncateToWidth(text, width, "…", true);

const homeDir = process.env.HOME;

const compactPath = (path: string, width: number): string =>
  truncateToWidth(homeDir ? path.replace(homeDir, "~") : path, width, "…");

const normalizeText = (text: string): string => text.replace(/\s+/g, " ").trim();

const wrapLine = (text: string, width: number): ReadonlyArray<string> =>
  wrapTextWithAnsi(normalizeText(text), width);

const cardBorder = (title: string, width: number, edge: "top" | "bottom"): string => {
  const titleText = edge === "top" ? ` ${title} ` : "";
  const left = edge === "top" ? "╭─" : "╰─";
  const right = edge === "top" ? "╮" : "╯";
  const fill = repeat("─", Math.max(0, width - visibleWidth(left) - visibleWidth(titleText) - 1));
  return gray(`${left}${titleText}${fill}${right}`);
};

const cardLine = (line: string, width: number): string =>
  `${gray("│")} ${fit(line, width - 4)} ${gray("│")}`;

const card = (
  title: string,
  lines: ReadonlyArray<string>,
  width: number
): ReadonlyArray<string> => [
  cardBorder(title, width, "top"),
  ...lines.flatMap((line) => wrapLine(line, width - 4).map((wrapped) => cardLine(wrapped, width))),
  cardBorder(title, width, "bottom"),
];

const statusLabels: Readonly<Record<ChatSessionStatus, string>> = {
  idle: "idle",
  resolving: "resolving",
  ready: "ready",
  running: "running",
  completed: "done",
  failed: "failed",
};

const statusColor: Readonly<Record<ChatSessionStatus, (text: string) => string>> = {
  idle: muted,
  resolving: yellow,
  ready: green,
  running: cyan,
  completed: green,
  failed: red,
};

const statusPill = (status: ChatSessionStatus): string => statusColor[status](statusLabels[status]);

const formatWorkflow = (state: ChatSessionState): string =>
  state.workflowLocator
    ? `${state.workflowLocator.name} (${state.workflowLocator.scope})`
    : state.workflowTarget
      ? `${state.workflowTarget} (unresolved)`
      : "no workflow selected";

const formatTime = (createdAt: string): string => new Date(createdAt).toISOString().slice(11, 16);

const formatUpdatedTime = (updatedAt: string): string =>
  Number.isNaN(Date.parse(updatedAt)) ? updatedAt : updatedAt.replace("T", " ").slice(0, 16);

const roleBadge = (role: ChatMessage["role"]): string =>
  role === "assistant" ? cyan("obora") : role === "user" ? violet("you") : muted("system");

const formatRunDuration = (summary: WorkflowRunSummary): string =>
  summary.durationMs === undefined ? "duration -" : `duration ${summary.durationMs}ms`;

const formatStepNames = (summary: WorkflowRunSummary): string =>
  summary.steps.map((step) => step.name).join(", ");

const stepValues = (values: ReadonlyArray<string> | undefined): ReadonlyArray<string> =>
  values ?? [];

const formatStepToolLine = (step: WorkflowRunStepSummary): string | undefined =>
  stepValues(step.toolsUsed).length > 0
    ? `${muted("tools")} ${stepValues(step.toolsUsed).join(", ")}`
    : undefined;

const formatStepArtifactLine = (step: WorkflowRunStepSummary): string | undefined =>
  stepValues(step.artifacts).length > 0
    ? `${muted("artifacts")} ${stepValues(step.artifacts).join(", ")}`
    : undefined;

const formatStepDecisionLine = (step: WorkflowRunStepSummary): string | undefined =>
  stepValues(step.decisions).length > 0
    ? `${muted("why")} ${stepValues(step.decisions).join("; ")}`
    : undefined;

const formatStepDependencyLine = (step: WorkflowRunStepSummary): string | undefined =>
  stepValues(step.dependencies).length > 0
    ? `${muted("depends")} ${stepValues(step.dependencies).join(", ")}`
    : undefined;

const runSummaryTeaser = (summary: WorkflowRunSummary): ReadonlyArray<string> => [
  `${muted(">")} ${summary.completedStepCount}/${summary.totalStepCount} steps · ${formatRunDuration(summary)}`,
  `${muted(">")} ${formatStepNames(summary) || "no steps recorded"}`,
  `${muted(">")} details /details ${summary.executionId}`,
];

const renderHeader = (state: ChatSessionState, width: number): ReadonlyArray<string> => [
  dim(compactPath(state.cwd, width)),
  `${bold("obora")} ${muted("workflow chat")}  ${dim("session")} ${state.sessionId}`,
  "",
];

const inspectedRunStatus = (state: ChatSessionState): string | undefined =>
  state.inspectedRunSummary
    ? `${muted("viewing run")} ${state.inspectedRunSummary.executionId}   ${muted("open")} /details ${state.inspectedRunSummary.executionId}`
    : undefined;

const renderHero = (
  state: ChatSessionState,
  rendererLabel: string,
  width: number
): ReadonlyArray<string> =>
  card(
    "session",
    [
      `${muted(">_")} ${bold("Workflow")} ${formatWorkflow(state)}`,
      `${muted("status")} ${statusPill(state.status)}   ${muted("mode")} ${state.dryRun ? yellow("dry-run") : green("live")}   ${muted("model")} ${state.modelName ?? "default"}`,
      `${muted("provider")} ${state.providerName ?? "default"}   ${muted("renderer")} ${rendererLabel}`,
      inspectedRunStatus(state),
    ].filter((line): line is string => Boolean(line)),
    width
  );

const workflowLines = (state: ChatSessionState): ReadonlyArray<string> =>
  [
    ...(state.workflowLocator
      ? [
        `${muted("name")} ${state.workflowLocator.name}`,
        `${muted("scope")} ${state.workflowLocator.scope}   ${muted("steps")} ${state.workflowLocator.stepCount}   ${muted("editable")} ${state.workflowLocator.editable ? "yes" : "no"}`,
        `${muted("path")} ${state.workflowLocator.displayPath}`,
        `${muted("project")} ${compactPath(state.projectRoot ?? state.cwd, 72)}`,
        `${muted("tags")} ${state.tags && state.tags.length > 0 ? state.tags.join(", ") : "none"}`,
      ]
      : [
        `${muted("target")} ${state.workflowTarget ?? "none"}`,
        `${muted("state")} select with /workflow <name-or-path>`,
        `${muted("scope")} project, global, or all`,
        `${muted("project")} ${compactPath(state.projectRoot ?? state.cwd, 72)}`,
        `${muted("tags")} ${state.tags && state.tags.length > 0 ? state.tags.join(", ") : "none"}`,
      ]),
    ...(state.workflowChoices && state.workflowChoices.length > 0
      ? [
          `${muted("quick")} ${state.workflowChoices
            .slice(0, 4)
            .map((locator, index) => `#${index + 1} ${locator.name}`)
            .join("   ")}`,
        ]
      : []),
  ];

const activityLines = (state: ChatSessionState): ReadonlyArray<string> => [
  `${muted("last run")} ${state.lastRunCommand ?? "none"}`,
  `${muted("last result")} ${state.lastRunSummary ? `${state.lastRunSummary.status} ${state.lastRunSummary.completedStepCount}/${state.lastRunSummary.totalStepCount}` : "none"}`,
  `${muted("error")} ${state.lastError ? red(state.lastError) : "none"}`,
  `${muted("turns")} ${state.messages.filter((message) => message.role === "user").length}`,
  `${muted("audit")} command, workflow, cwd, provider, and model are visible`,
];

const renderMeta = (state: ChatSessionState, width: number): ReadonlyArray<string> =>
  card("workflow", [...workflowLines(state), "", ...activityLines(state)], width);

const inspectedRunSummary = (state: ChatSessionState): WorkflowRunSummary | undefined =>
  state.inspectedRunSummary;

const runDetailHeaderLines = (summary: WorkflowRunSummary): ReadonlyArray<string> => [
  `${muted("id")} ${summary.executionId}   ${muted("status")} ${summary.status}   ${muted("steps")} ${summary.completedStepCount}/${summary.totalStepCount}`,
  `${muted("workflow")} ${summary.workflowName}   ${formatRunDuration(summary)}`,
  `${muted("summary")} ${summary.message}`,
  `${muted("open")} /details ${summary.executionId}`,
  ...(summary.error ? [`${muted("error")} ${red(summary.error)}`] : []),
];

const attentionSteps = (
  summary: WorkflowRunSummary
): ReadonlyArray<readonly [WorkflowRunStepSummary, number]> =>
  summary.steps
    .map((step, index) => [step, index] as const)
    .filter(
      ([step]) => step.status !== "completed" || stepValues(step.issues).length > 0
    );

const runDetailAttentionLines = (summary: WorkflowRunSummary): ReadonlyArray<string> =>
  attentionSteps(summary).flatMap(([step, index]) => [
    `${muted("attention")} #${index + 1} ${step.name} ${step.status}`,
    ...(stepValues(step.issues).length > 0
      ? [`${muted("cause")} ${stepValues(step.issues).join("; ")}`]
      : []),
  ]);

const runDetailStepLines = (
  step: WorkflowRunStepSummary,
  index: number
): ReadonlyArray<string> =>
  [
    `${cyan(`#${index + 1}`)} ${bold(step.name)} ${step.status}${step.agent ? ` · ${step.agent}` : ""}${step.model ? ` · ${step.model}` : ""}`,
    ...(step.task ? [`${muted("task")} ${step.task}`] : []),
    `${muted("output")} ${step.outputPreview}`,
    `${muted("format")} ${step.outputFormat}`,
    ...(step.methodology ? [`${muted("method")} ${step.methodology}`] : []),
    formatStepToolLine(step),
    formatStepArtifactLine(step),
    formatStepDecisionLine(step),
    step.rationale ? `${muted("rationale")} ${step.rationale}` : undefined,
    formatStepDependencyLine(step),
    stepValues(step.issues).length > 0
      ? `${muted("issues")} ${stepValues(step.issues).join("; ")}`
      : undefined,
  ].filter((line): line is string => Boolean(line));

const renderRunInspector = (
  state: ChatSessionState,
  width: number
): ReadonlyArray<string> => {
  const summary = inspectedRunSummary(state);
  return summary
    ? [
        "",
        ...card(
          "run details",
          [
            ...runDetailHeaderLines(summary),
            ...runDetailAttentionLines(summary),
            "",
            ...summary.steps.flatMap(runDetailStepLines),
          ],
          width
        ),
      ]
    : [];
};

const runHistoryMarker = (state: ChatSessionState, summary: WorkflowRunSummary): string =>
  state.inspectedRunSummary?.executionId === summary.executionId ? green("●") : muted("○");

const renderRunHistoryLine = (
  state: ChatSessionState,
  choice: ChatRunChoice,
  index: number
): string => {
  const summary = runChoiceSummary(choice);
  return [
    runHistoryMarker(state, summary),
    cyan(`#${index + 1}`),
    bold(summary.executionId),
    summary.status,
    muted(summary.workflowName),
    `${muted("steps")} ${summary.completedStepCount}/${summary.totalStepCount}`,
  ].join(" ");
};

const renderRunHistorySource = (state: ChatSessionState, choice: ChatRunChoice): string =>
  choice.sessionId && choice.sessionId !== state.sessionId
    ? `${muted("session")} ${choice.sessionId}   ${muted("switch")} /session ${choice.sessionId}`
    : muted("session current");

const renderRunHistoryMeta = (state: ChatSessionState, choice: ChatRunChoice): string => {
  const summary = runChoiceSummary(choice);
  return [
    renderRunHistorySource(state, choice),
    `${muted("started")} ${formatUpdatedTime(summary.startedAt)}`,
    formatRunDuration(summary),
    `${muted("open")} /details ${summary.executionId}`,
  ].join("   ");
};

const runFilterHint = (state: ChatSessionState): string =>
  [
    `${muted("project")} /runs --project`,
    ...(state.tags && state.tags.length > 0
      ? [`${muted("tag")} /runs --tag ${state.tags[0]}`]
      : [`${muted("tag")} /runs --tag <tag>`]),
    `${muted("status")} /runs --status failed`,
  ].join("   ");

const renderRunHistory = (
  state: ChatSessionState,
  width: number
): ReadonlyArray<string> =>
  state.runChoices && state.runChoices.length > 0
    ? [
        "",
        ...card(
          "runs",
          [
            `${muted("select")} 1   ${muted("by id")} /details <runId>   ${muted("refresh")} /runs   ${muted("close")} /clear`,
            runFilterHint(state),
            ...state.runChoices.slice(0, 8).flatMap((choice, index) => [
              renderRunHistoryLine(state, choice, index),
              renderRunHistoryMeta(state, choice),
            ]),
          ],
          width
        ),
      ]
    : [];

const renderHelpPanel = (state: ChatSessionState, width: number): ReadonlyArray<string> =>
  state.showHelpPanel
    ? [
        "",
        ...card(
          "help",
          [
            `${muted("close")} /clear   ${muted("run")} /run <task>   ${muted("history")} /runs`,
            "",
            ...chatCommandHelpSections.flatMap((section) => [
              bold(section.title),
              ...section.entries.map(
                (entry) => `${muted(entry.command)} ${entry.description}`
              ),
              "",
            ]),
          ],
          width
        ),
      ]
    : [];

const sessionTagText = (summary: ChatSessionSummary): string =>
  summary.tags.length > 0 ? summary.tags.join(",") : "untagged";

const sessionWorkflowText = (summary: ChatSessionSummary): string =>
  summary.workflowTarget ?? "no workflow";

const sessionProjectText = (summary: ChatSessionSummary, width: number): string =>
  compactPath(summary.projectRoot ?? summary.cwd, width);

const renderSessionChoiceLine = (
  state: ChatSessionState,
  summary: ChatSessionSummary,
  index: number
): string =>
  [
    summary.sessionId === state.sessionId ? green("●") : muted("○"),
    cyan(`#${index + 1}`),
    bold(summary.sessionId),
    statusPill(summary.status),
    muted(sessionWorkflowText(summary)),
  ].join(" ");

const renderSessionChoiceMeta = (
  summary: ChatSessionSummary,
  width: number
): string =>
  [
    `${muted("project")} ${sessionProjectText(summary, Math.max(16, width - 28))}`,
    `${muted("tags")} ${sessionTagText(summary)}`,
    `${muted("messages")} ${summary.messageCount}`,
    `${muted("updated")} ${formatUpdatedTime(summary.updatedAt)}`,
  ].join("   ");

const renderSessionPicker = (
  state: ChatSessionState,
  width: number
): ReadonlyArray<string> =>
  state.sessionChoices && state.sessionChoices.length > 0
    ? [
        "",
        ...card(
          "sessions",
          [
            `${muted("select")} /session 1   ${muted("rename")} /session rename 1 <id>   ${muted("delete")} /session delete 1   ${muted("close")} /clear`,
            ...state.sessionChoices.slice(0, 8).flatMap((summary, index) => [
              renderSessionChoiceLine(state, summary, index),
              renderSessionChoiceMeta(summary, width - 4),
            ]),
          ],
          width
        ),
      ]
    : [];

const workflowMarker = (state: ChatSessionState, locator: WorkflowLocator): string =>
  state.workflowLocator?.id === locator.id ? green("●") : muted("○");

const renderWorkflowChoiceLine = (
  state: ChatSessionState,
  locator: WorkflowLocator,
  index: number
): string =>
  [
    workflowMarker(state, locator),
    cyan(`#${index + 1}`),
    bold(locator.name),
    statusPill(state.workflowLocator?.id === locator.id ? "ready" : "idle"),
    muted(locator.scope),
    `${muted("steps")} ${locator.stepCount}`,
  ].join(" ");

const renderWorkflowChoiceMeta = (locator: WorkflowLocator, width: number): string =>
  [
    `${muted("path")} ${compactPath(locator.displayPath, Math.max(16, width - 24))}`,
    `${muted("editable")} ${locator.editable ? "yes" : "no"}`,
    ...(locator.description ? [`${muted("about")} ${locator.description}`] : []),
  ].join("   ");

const renderWorkflowPicker = (
  state: ChatSessionState,
  width: number
): ReadonlyArray<string> =>
  state.workflowChoices && state.workflowChoices.length > 0
    ? [
        "",
        ...card(
          "workflows",
          [
            `${muted("select")} /workflow 1   ${muted("run once")} /run #1 <task>   ${muted("refresh")} /workflows [scope]   ${muted("close")} /clear`,
            ...state.workflowChoices.slice(0, 8).flatMap((locator, index) => [
              renderWorkflowChoiceLine(state, locator, index),
              renderWorkflowChoiceMeta(locator, width - 4),
            ]),
          ],
          width
        ),
      ]
    : [];

const renderMessage = (message: ChatMessage, width: number): ReadonlyArray<string> => [
  `${dim(formatTime(message.createdAt))} ${roleBadge(message.role)}`,
  ...wrapLine(message.content, width - 4).map((line) => `${muted("│")} ${line}`),
  ...(message.runSummary
    ? runSummaryTeaser(message.runSummary).flatMap((line) =>
        wrapLine(line, width - 4).map((wrapped) => `${muted("│")} ${wrapped}`)
      )
    : []),
];

const renderTranscript = (state: ChatSessionState, width: number): ReadonlyArray<string> => [
  muted("conversation"),
  ...visibleChatMessages(state, 8).flatMap((message) => ["", ...renderMessage(message, width)]),
];

const promptLabel = (state: ChatSessionState): string =>
  state.workflowLocator
    ? `${state.workflowLocator.name} ready · type task or /run`
    : state.workflowChoices && state.workflowChoices.length > 0
      ? "Choose /workflow 1 or run once with /run #1 <task>"
      : "Select /workflow <name> first";

const renderPrompt = (state: ChatSessionState, width: number): ReadonlyArray<string> => {
  const prompt = `› ${promptLabel(state)}`;
  const commandRows = chatPromptCommandRows(state);
  const footer = `${state.modelName ?? "default"}  ·  ${compactPath(state.cwd, Math.max(12, width - 28))}`;
  const contextFooter = state.inspectedRunSummary
    ? `viewing run ${state.inspectedRunSummary.executionId}  ·  /details ${state.inspectedRunSummary.executionId}`
    : footer;
  return [
    "",
    inputBg(fit(prompt, width)),
    ...commandRows.map((row) => dim(fit(row, width))),
    dim(fit(contextFooter, width)),
  ];
};

export const renderChatView = (
  state: ChatSessionState,
  options: ChatViewOptions = {}
): ReadonlyArray<string> => {
  const width = clamp(options.columns ?? 100, MIN_WIDTH, MAX_WIDTH);
  const cardWidth = clamp(width - 2, MIN_WIDTH, Math.min(width, CARD_MAX_WIDTH));
  const rendererLabel = options.rendererLabel ?? "initializing";

  return [
    ...renderHeader(state, width),
    ...renderHero(state, rendererLabel, cardWidth),
    ...renderSessionPicker(state, cardWidth),
    ...renderWorkflowPicker(state, cardWidth),
    ...renderRunHistory(state, cardWidth),
    ...renderHelpPanel(state, cardWidth),
    "",
    ...renderTranscript(state, cardWidth),
    ...renderRunInspector(state, cardWidth),
    "",
    ...renderMeta(state, cardWidth),
    ...renderPrompt(state, width),
  ];
};
