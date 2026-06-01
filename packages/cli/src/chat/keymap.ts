import type { ChatSessionState } from "./types.js";

export interface ChatTuiKey {
  readonly name?: string;
  readonly value?: string;
  readonly ctrl?: boolean;
  readonly shift?: boolean;
}

type PickerKind = "run" | "session" | "workflow";

const activePicker = (state: ChatSessionState): PickerKind | undefined =>
  state.runChoices && state.runChoices.length > 0
    ? "run"
    : state.sessionChoices && state.sessionChoices.length > 0
      ? "session"
      : state.workflowChoices && state.workflowChoices.length > 0
        ? "workflow"
        : undefined;

const pickerCommand = (picker: PickerKind, action: "next" | "prev" | "open"): string =>
  picker === "run"
    ? action === "open"
      ? "/details open"
      : `/details ${action}`
    : picker === "session"
      ? `/session ${action}`
      : `/workflow ${action}`;

const keyAction = (key: ChatTuiKey): "next" | "prev" | "open" | undefined =>
  key.name === "tab" && key.shift
    ? "prev"
    : key.name === "tab"
      ? "next"
      : key.name === "down"
    ? "next"
    : key.name === "up"
      ? "prev"
      : key.name === "return" ||
          key.name === "enter" ||
          key.value === "\r" ||
          key.value === "\n"
        ? "open"
        : undefined;

const hasOpenPanel = (state: ChatSessionState): boolean =>
  Boolean(
    state.inspectedRunSummary ||
      state.runChoices?.length ||
      state.sessionChoices?.length ||
      state.workflowChoices?.length ||
      state.showHelpPanel
  );

const commandForPanelKey = (
  state: ChatSessionState,
  picker: PickerKind | undefined,
  key: ChatTuiKey
): string | undefined =>
  key.name === "escape" && hasOpenPanel(state)
    ? "/clear"
    : key.ctrl && key.name === "r"
      ? picker === "run"
        ? "/retry open"
        : state.inspectedRunSummary || state.lastRunTask
          ? "/retry"
          : undefined
      : undefined;

export const commandForChatTuiKey = (
  state: ChatSessionState,
  key: ChatTuiKey
): string | undefined => {
  const picker = activePicker(state);
  const action = keyAction(key);
  return picker && action ? pickerCommand(picker, action) : commandForPanelKey(state, picker, key);
};
