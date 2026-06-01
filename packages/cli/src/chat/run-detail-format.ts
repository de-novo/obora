import type { WorkflowRunStepSummary } from "@obora/sdk";

import { formatChatRunOptions } from "./run-options-format.js";
import type { ChatRunDetail } from "./store.js";

const values = (items: ReadonlyArray<string> | undefined): ReadonlyArray<string> => items ?? [];

const preview = (value: string, maxLength = 160): string =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;

const previewValues = (items: ReadonlyArray<string> | undefined): ReadonlyArray<string> =>
  values(items).map((item) => preview(item));

const joinedPreviewValues = (
  items: ReadonlyArray<string> | undefined,
  separator: string
): string | undefined =>
  previewValues(items).length > 0 ? previewValues(items).join(separator) : undefined;

const labeledLine = (label: string, value: string | undefined): string | undefined =>
  value ? `    ${label}: ${value}` : undefined;

const valueLine = (
  label: string,
  items: ReadonlyArray<string> | undefined,
  separator = ", "
): string | undefined =>
  labeledLine(label, joinedPreviewValues(items, separator));

const optionalLine = (label: string, value: string | undefined): string | undefined =>
  labeledLine(label, value ? preview(value) : undefined);

const stepTitle = (step: WorkflowRunStepSummary, index: number): string =>
  `  ${index + 1}. ${step.name} [${step.status}]${step.agent ? ` agent=${step.agent}` : ""}${step.model ? ` model=${step.model}` : ""}`;

const formatStep = (step: WorkflowRunStepSummary, index: number): ReadonlyArray<string> =>
  [
    stepTitle(step, index),
    optionalLine("task", step.task),
    `    output: ${preview(step.outputPreview)}`,
    `    format: ${step.outputFormat}`,
    optionalLine("method", step.methodology),
    optionalLine("rationale", step.rationale),
    valueLine("tools", step.toolsUsed),
    valueLine("artifacts", step.artifacts),
    valueLine("decisions", step.decisions, "; "),
    valueLine("dependencies", step.dependencies),
    valueLine("issues", step.issues, "; "),
  ].filter((line): line is string => Boolean(line));

const formatRetryWorkflowName = (detail: ChatRunDetail): string =>
  detail.runTask ? (detail.runWorkflowLocator?.name ?? detail.runSummary.workflowName) : "not available";

export const formatChatRunDetail = (detail: ChatRunDetail): string =>
  [
    `Run ${detail.runSummary.executionId}`,
    `Session: ${detail.sessionId}`,
    ...(detail.projectRoot ? [`Project: ${detail.projectRoot}`] : []),
    `Message: ${detail.messageId} at ${detail.messageCreatedAt}`,
    `Workflow: ${detail.runSummary.workflowName}`,
    `Status: ${detail.runSummary.status}`,
    `Steps: ${detail.runSummary.completedStepCount}/${detail.runSummary.totalStepCount}`,
    `Started: ${detail.runSummary.startedAt}`,
    ...(detail.runSummary.endedAt ? [`Ended: ${detail.runSummary.endedAt}`] : []),
    ...(detail.runSummary.durationMs === undefined
      ? []
      : [`Duration: ${detail.runSummary.durationMs}ms`]),
    ...(detail.runTask ? [`Task: ${detail.runTask}`] : []),
    ...(formatChatRunOptions(detail.runOptions)
      ? [`Run options: ${formatChatRunOptions(detail.runOptions)}`]
      : []),
    ...(detail.workflowTarget ? [`Workflow target: ${detail.workflowTarget}`] : []),
    `Retry: ${formatRetryWorkflowName(detail)}`,
    ...(detail.runWorkflowLocator
      ? [
          `Workflow locator: ${detail.runWorkflowLocator.name} (${detail.runWorkflowLocator.displayPath})`,
        ]
      : []),
    `Summary: ${detail.runSummary.message}`,
    ...(detail.runSummary.repositoryChanges
      ? [
          `Repository changes: ${detail.runSummary.repositoryChanges.summary}`,
          `Repository root: ${detail.runSummary.repositoryChanges.root}`,
        ]
      : []),
    ...(detail.runSummary.error ? [`Error: ${detail.runSummary.error}`] : []),
    "",
    "Step details:",
    ...(detail.runSummary.steps.length > 0
      ? detail.runSummary.steps.flatMap(formatStep)
      : ["  No steps recorded."]),
  ].join("\n");
