import type { ChatSessionState } from "./types.js";

export interface ChatTuiKey {
  readonly name?: string;
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
  key.name === "down"
    ? "next"
    : key.name === "up"
      ? "prev"
      : key.name === "return" || key.name === "enter"
        ? "open"
        : undefined;

export const commandForChatTuiKey = (
  state: ChatSessionState,
  key: ChatTuiKey
): string | undefined => {
  const picker = activePicker(state);
  const action = keyAction(key);
  return picker && action ? pickerCommand(picker, action) : undefined;
};
