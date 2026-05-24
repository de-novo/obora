import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { WorkflowLocator, WorkflowRunStepSummary, WorkflowRunSummary } from "@obora/sdk";

import { visibleChatMessages } from "./state.js";
import type { ChatMessage, ChatSessionState, ChatSessionStatus } from "./types.js";
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

const formatStepToolLine = (step: WorkflowRunStepSummary): string | undefined =>
  step.toolsUsed.length > 0 ? `${muted("tools")} ${step.toolsUsed.join(", ")}` : undefined;

const formatStepArtifactLine = (step: WorkflowRunStepSummary): string | undefined =>
  step.artifacts.length > 0 ? `${muted("artifacts")} ${step.artifacts.join(", ")}` : undefined;

const formatStepDecisionLine = (step: WorkflowRunStepSummary): string | undefined =>
  step.decisions.length > 0 ? `${muted("why")} ${step.decisions.join("; ")}` : undefined;

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
    ],
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

const runStepLines = (step: WorkflowRunStepSummary): ReadonlyArray<string> =>
  [
    `${muted(">")} ${bold(step.name)} ${step.status}${step.agent ? ` · ${step.agent}` : ""}${step.model ? ` · ${step.model}` : ""}`,
    `${muted("output")} ${step.outputPreview}`,
    formatStepToolLine(step),
    formatStepArtifactLine(step),
    formatStepDecisionLine(step),
    step.rationale ? `${muted("rationale")} ${step.rationale}` : undefined,
    step.issues.length > 0 ? `${muted("issues")} ${step.issues.join("; ")}` : undefined,
  ].filter((line): line is string => Boolean(line));

const runResultLines = (state: ChatSessionState): ReadonlyArray<string> =>
  state.lastRunSummary
    ? [
        "",
        `${muted("run")} ${state.lastRunSummary.message}`,
        `${muted("id")} ${state.lastRunSummary.executionId}   ${formatRunDuration(state.lastRunSummary)}`,
        ...(state.lastRunSummary.error ? [`${muted("error")} ${red(state.lastRunSummary.error)}`] : []),
        ...state.lastRunSummary.steps.flatMap(runStepLines),
      ]
    : [];

const renderMeta = (state: ChatSessionState, width: number): ReadonlyArray<string> =>
  card("workflow", [...workflowLines(state), "", ...activityLines(state), ...runResultLines(state)], width);

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
            `${muted("select")} /session 1   ${muted("rename")} /session rename 1 <id>   ${muted("delete")} /session delete 1`,
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
            `${muted("select")} /workflow 1   ${muted("run once")} /run #1 <task>   ${muted("refresh")} /workflows [scope]`,
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

const promptPrimaryCommands = (state: ChatSessionState): string =>
  state.workflowLocator
    ? "/run <task>  /details <runId>  /workflows  /workflow 1"
    : state.workflowChoices && state.workflowChoices.length > 0
      ? "/workflow 1  /run #1 <task>  /workflows [scope]"
      : "/workflows  /workflow <name-or-path>  /project [path]";

const renderPrompt = (state: ChatSessionState, width: number): ReadonlyArray<string> => {
  const prompt = `› ${promptLabel(state)}`;
  const primaryCommands = promptPrimaryCommands(state);
  const secondaryCommands =
    "/session  /session 1  /session rename 1 <id>  /session delete 1  /project  /sessions  /tags  /help";
  const footer = `${state.modelName ?? "default"}  ·  ${compactPath(state.cwd, Math.max(12, width - 28))}`;
  return [
    "",
    inputBg(fit(prompt, width)),
    dim(fit(primaryCommands, width)),
    dim(fit(secondaryCommands, width)),
    dim(fit(footer, width)),
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
    "",
    ...renderTranscript(state, cardWidth),
    "",
    ...renderMeta(state, cardWidth),
    ...renderPrompt(state, width),
  ];
};
