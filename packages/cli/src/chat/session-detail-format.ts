import type { ChatMessage, ChatSessionState } from "./types.js";
import { formatCompactChatRunOptions } from "./run-options-format.js";

const preview = (value: string, maxLength = 96): string =>
  value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;

const formatTags = (tags: ReadonlyArray<string> | undefined): string =>
  tags && tags.length > 0 ? tags.join(", ") : "none";

const userTurnCount = (state: ChatSessionState): number =>
  state.messages.filter((message) => message.role === "user").length;

const workflowText = (state: ChatSessionState): string =>
  state.workflowLocator
    ? `${state.workflowLocator.name} (${state.workflowLocator.scope})`
    : state.workflowTarget
      ? `${state.workflowTarget} (unresolved)`
      : "none";

const lastResultText = (state: ChatSessionState): string =>
  state.lastRunSummary
    ? `${state.lastRunSummary.status} ${state.lastRunSummary.completedStepCount}/${state.lastRunSummary.totalStepCount}`
    : "none";

const retryWorkflowName = (state: ChatSessionState): string | undefined =>
  state.lastRunWorkflowLocator?.name ?? state.lastRunSummary?.workflowName;

const retryText = (state: ChatSessionState): string =>
  state.lastRunTask && retryWorkflowName(state)
    ? `${retryWorkflowName(state)} -> ${state.lastRunTask}`
    : "none";

const retryCommand = (state: ChatSessionState): string | undefined =>
  state.lastRunWorkflowLocator
    ? `obora run ${state.lastRunWorkflowLocator.displayPath}`
    : retryWorkflowName(state)
      ? `obora run ${retryWorkflowName(state)}`
      : undefined;

const messageLine = (message: ChatMessage): string =>
  `- ${message.role} ${message.createdAt}: ${preview(message.content.replace(/\s+/g, " "))}`;

const recentMessageLines = (messages: ReadonlyArray<ChatMessage>): ReadonlyArray<string> =>
  messages.length > 0
    ? ["Recent messages:", ...messages.slice(-5).map(messageLine)]
    : ["Recent messages: none"];

export const formatChatSessionDetail = (state: ChatSessionState): string =>
  [
    `Session ${state.sessionId}`,
    `Status: ${state.status}`,
    `Project: ${state.projectRoot ?? state.cwd}`,
    `Directory: ${state.cwd}`,
    `Tags: ${formatTags(state.tags)}`,
    `Workflow: ${workflowText(state)}`,
    `Mode: ${state.dryRun ? "dry-run" : "live"}`,
    `Provider: ${state.providerName ?? "default"}`,
    `Model: ${state.modelName ?? "default"}`,
    `Messages: ${state.messages.length}`,
    `User turns: ${userTurnCount(state)}`,
    `Retry: ${retryText(state)}`,
    ...(retryCommand(state) ? [`Retry command: ${retryCommand(state)}`] : []),
    ...(state.lastRunProjectRoot && state.lastRunProjectRoot !== (state.projectRoot ?? state.cwd)
      ? [`Retry project: ${state.lastRunProjectRoot}`]
      : []),
    ...(formatCompactChatRunOptions(state.lastRunOptions)
      ? [`Retry options: ${formatCompactChatRunOptions(state.lastRunOptions)}`]
      : []),
    `Last result: ${lastResultText(state)}`,
    ...(state.lastRunSummary ? [`Details: /details ${state.lastRunSummary.executionId}`] : []),
    "",
    ...recentMessageLines(state.messages),
  ].join("\n");
