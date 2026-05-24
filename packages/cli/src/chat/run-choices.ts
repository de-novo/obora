import type { WorkflowRunSummary } from "@obora/sdk";

import type { ChatRunChoice } from "./types.js";

export type ChatRunChoiceInput = ChatRunChoice | WorkflowRunSummary;

export interface ChatRunChoiceDetailInput {
  readonly sessionId: string;
  readonly messageId: string;
  readonly runSummary: WorkflowRunSummary;
}

const hasRunSummary = (choice: ChatRunChoiceInput): choice is ChatRunChoice =>
  "runSummary" in choice;

export const runChoiceSummary = (choice: ChatRunChoiceInput): WorkflowRunSummary =>
  hasRunSummary(choice) ? choice.runSummary : choice;

export const toChatRunChoice = (
  choice: ChatRunChoiceInput,
  sessionId?: string
): ChatRunChoice =>
  hasRunSummary(choice)
    ? choice
    : {
        runSummary: choice,
        ...(sessionId ? { sessionId } : {}),
        source: "session",
      };

export const chatRunChoicesFromSummaries = (
  summaries: ReadonlyArray<WorkflowRunSummary>,
  sessionId: string
): ReadonlyArray<ChatRunChoice> =>
  summaries.map((summary) => toChatRunChoice(summary, sessionId));

export const chatRunChoiceFromDetail = (detail: ChatRunChoiceDetailInput): ChatRunChoice => ({
  runSummary: detail.runSummary,
  sessionId: detail.sessionId,
  messageId: detail.messageId,
  source: "persisted",
});

export const chatRunChoicesFromDetails = (
  details: ReadonlyArray<ChatRunChoiceDetailInput>
): ReadonlyArray<ChatRunChoice> => details.map(chatRunChoiceFromDetail);
