import type { ChatMessage, ChatSessionState } from "./types.js";
import { visibleChatMessages } from "./state.js";

export interface ChatViewOptions {
  readonly rendererLabel?: string;
  readonly columns?: number;
}

const MIN_WIDTH = 78;
const MAX_WIDTH = 140;
const PANEL_GAP = 2;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const repeat = (char: string, count: number): string => char.repeat(Math.max(0, count));

const clipText = (text: string, width: number): string =>
  width <= 0
    ? ""
    : text.length <= width
      ? text
      : width === 1
        ? "~"
        : `${text.slice(0, width - 1)}~`;

const fitText = (text: string, width: number): string => clipText(text, width).padEnd(width, " ");

const normalizeText = (text: string): string => text.replace(/\s+/g, " ").trim();

const wrapText = (text: string, width: number): ReadonlyArray<string> => {
  const normalized = normalizeText(text);
  if (!normalized) return [""];
  if (width <= 0 || normalized.length <= width) return [normalized];

  const search = normalized.slice(0, width + 1);
  const breakAt = search.lastIndexOf(" ");
  const splitAt = breakAt > Math.floor(width * 0.45) ? breakAt : width;
  const head = normalized.slice(0, splitAt).trim();
  const tail = normalized.slice(splitAt).trim();
  return [head, ...wrapText(tail, width)];
};

const frameLine = (width: number, char = "-"): string => `+${repeat(char, width - 2)}+`;

const contentLine = (width: number, text = ""): string => `| ${fitText(text, width - 4)} |`;

const titledPanel = (
  title: string,
  lines: ReadonlyArray<string>,
  width: number
): ReadonlyArray<string> => [
  frameLine(width),
  contentLine(width, `[${title}]`),
  ...lines.flatMap((line) =>
    wrapText(line, width - 4).map((wrapped) => contentLine(width, wrapped))
  ),
  frameLine(width),
];

const statusMark = (state: ChatSessionState): string =>
  state.status === "ready"
    ? "READY"
    : state.status === "running"
      ? "RUNNING"
      : state.status === "failed"
        ? "FAILED"
        : state.status === "completed"
          ? "DONE"
          : state.status === "resolving"
            ? "RESOLVING"
            : "IDLE";

const formatWorkflow = (state: ChatSessionState): string =>
  state.workflowLocator
    ? `${state.workflowLocator.name} (${state.workflowLocator.scope})`
    : state.workflowTarget
      ? `${state.workflowTarget} (unresolved)`
      : "no workflow selected";

const formatTime = (createdAt: string): string => new Date(createdAt).toISOString().slice(11, 19);

const roleLabel = (role: ChatMessage["role"]): string =>
  role === "assistant" ? "obora" : role === "user" ? "you" : "system";

const renderMessage = (message: ChatMessage, width: number): ReadonlyArray<string> => {
  const bodyWidth = width - 8;
  const header = `${roleLabel(message.role).toUpperCase()} ${formatTime(message.createdAt)}`;
  return [`> ${header}`, ...wrapText(message.content, bodyWidth).map((line) => `  ${line}`)];
};

const compactPath = (path: string): string =>
  path.length <= 42 ? path : `...${path.slice(Math.max(0, path.length - 39))}`;

const renderHeader = (state: ChatSessionState, width: number): ReadonlyArray<string> => [
  frameLine(width, "="),
  contentLine(
    width,
    `OBORA CHAT  |  workflow operator console  |  ${statusMark(state)}  |  ${state.dryRun ? "DRY RUN" : "LIVE"}`
  ),
  contentLine(
    width,
    `workflow: ${formatWorkflow(state)}  |  session: ${state.sessionId}  |  model: ${state.modelName ?? "default"}`
  ),
  frameLine(width, "="),
];

const renderSessionPanel = (
  state: ChatSessionState,
  rendererLabel: string,
  width: number
): ReadonlyArray<string> =>
  titledPanel(
    "SESSION",
    [
      `id: ${state.sessionId}`,
      `status: ${statusMark(state)}`,
      `mode: ${state.dryRun ? "dry-run verification" : "live workflow execution"}`,
      `provider: ${state.providerName ?? "default"}`,
      `model: ${state.modelName ?? "default"}`,
      `renderer: ${rendererLabel}`,
      `cwd: ${compactPath(state.cwd)}`,
    ],
    width
  );

const renderWorkflowPanel = (state: ChatSessionState, width: number): ReadonlyArray<string> =>
  titledPanel(
    "WORKFLOW",
    state.workflowLocator
      ? [
          `name: ${state.workflowLocator.name}`,
          `scope: ${state.workflowLocator.scope}`,
          `steps: ${state.workflowLocator.stepCount}`,
          `editable: ${state.workflowLocator.editable ? "yes" : "no"}`,
          `path: ${state.workflowLocator.displayPath}`,
        ]
      : [
          `target: ${state.workflowTarget ?? "none"}`,
          "state: select with /workflow <name-or-path>",
          "scope: project, global, or all",
        ],
    width
  );

const renderActivityPanel = (state: ChatSessionState, width: number): ReadonlyArray<string> =>
  titledPanel(
    "ACTIVITY",
    [
      state.lastRunCommand ? `last run: ${state.lastRunCommand}` : "last run: none",
      state.lastError ? `error: ${state.lastError}` : "error: none",
      `turns: ${Math.max(0, state.messages.filter((message) => message.role === "user").length)}`,
      "audit: command, workflow, cwd, provider, and model are visible",
    ],
    width
  );

const renderCommandPanel = (width: number): ReadonlyArray<string> =>
  titledPanel(
    "COMMAND PALETTE",
    [
      "/run <task> executes the selected workflow",
      "/workflow <name-or-path> switches workflow in this session",
      "/help lists commands | /exit closes the session",
    ],
    width
  );

const padPanel = (
  lines: ReadonlyArray<string>,
  width: number,
  height: number
): ReadonlyArray<string> =>
  Array.from({ length: height }, (_, index) => fitText(lines[index] ?? "", width));

const sideBySide = (
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
  leftWidth: number,
  rightWidth: number
): ReadonlyArray<string> => {
  const height = Math.max(left.length, right.length);
  const leftPadded = padPanel(left, leftWidth, height);
  const rightPadded = padPanel(right, rightWidth, height);
  return Array.from(
    { length: height },
    (_, index) => `${leftPadded[index]}${repeat(" ", PANEL_GAP)}${rightPadded[index]}`
  );
};

const renderTranscriptPanel = (state: ChatSessionState, width: number): ReadonlyArray<string> =>
  titledPanel(
    "TRANSCRIPT",
    visibleChatMessages(state, 8).flatMap((message) => renderMessage(message, width)),
    width
  );

export const renderChatView = (
  state: ChatSessionState,
  options: ChatViewOptions = {}
): ReadonlyArray<string> => {
  const width = clamp(options.columns ?? 100, MIN_WIDTH, MAX_WIDTH);
  const rendererLabel = options.rendererLabel ?? "initializing";
  const useInspector = width >= 112;
  const inspectorWidth = useInspector ? clamp(Math.floor(width * 0.38), 46, 54) : width;
  const mainWidth = useInspector ? width - inspectorWidth - PANEL_GAP : width;
  const inspector = [
    ...renderSessionPanel(state, rendererLabel, inspectorWidth),
    "",
    ...renderWorkflowPanel(state, inspectorWidth),
    "",
    ...renderActivityPanel(state, inspectorWidth),
  ];
  const main = [...renderTranscriptPanel(state, mainWidth), "", ...renderCommandPanel(mainWidth)];

  return [
    ...renderHeader(state, width),
    "",
    ...(useInspector
      ? sideBySide(main, inspector, mainWidth, inspectorWidth)
      : [
          ...renderSessionPanel(state, rendererLabel, width),
          "",
          ...renderWorkflowPanel(state, width),
          "",
          ...renderActivityPanel(state, width),
          "",
          ...main,
        ]),
  ];
};
