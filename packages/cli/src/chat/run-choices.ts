import type { WorkflowRunSummary } from "@obora/sdk";

import type { ChatRunChoice } from "./types.js";

export type ChatRunChoiceInput = ChatRunChoice | WorkflowRunSummary;

export interface ChatRunChoiceDetailInput {
  readonly sessionId: string;
  readonly projectRoot?: string;
  readonly messageId: string;
  readonly runSummary: WorkflowRunSummary;
  readonly runTask?: ChatRunChoice["runTask"];
  readonly runWorkflowLocator?: ChatRunChoice["runWorkflowLocator"];
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
  ...(detail.projectRoot ? { projectRoot: detail.projectRoot } : {}),
  messageId: detail.messageId,
  source: "persisted",
  ...(detail.runTask ? { runTask: detail.runTask } : {}),
  ...(detail.runWorkflowLocator ? { runWorkflowLocator: detail.runWorkflowLocator } : {}),
});

export const chatRunChoicesFromDetails = (
  details: ReadonlyArray<ChatRunChoiceDetailInput>
): ReadonlyArray<ChatRunChoice> => details.map(chatRunChoiceFromDetail);
