import type { ExecutionTrace, RuntimeExecution } from "../runtime-types.js";

export type WorkflowRunStepStatus = "completed" | "missing";

export interface WorkflowRunStepSummary {
  readonly name: string;
  readonly status: WorkflowRunStepStatus;
  readonly agent?: string;
  readonly model?: string;
  readonly outputPreview: string;
  readonly outputFormat: string;
  readonly toolsUsed: ReadonlyArray<string>;
  readonly artifacts: ReadonlyArray<string>;
  readonly task?: string;
  readonly methodology?: string;
  readonly rationale?: string;
  readonly decisions: ReadonlyArray<string>;
  readonly issues: ReadonlyArray<string>;
  readonly dependencies: ReadonlyArray<string>;
}

export interface WorkflowRunFileChange {
  readonly status: string;
  readonly path: string;
  readonly additions?: number;
  readonly deletions?: number;
  readonly diffPreview?: ReadonlyArray<string>;
}

export interface WorkflowRunRepositoryChanges {
  readonly root: string;
  readonly files: ReadonlyArray<WorkflowRunFileChange>;
  readonly summary: string;
}

export interface WorkflowRunSummary {
  readonly executionId: string;
  readonly workflowName: string;
  readonly status: RuntimeExecution["status"];
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly durationMs?: number;
  readonly completedStepCount: number;
  readonly totalStepCount: number;
  readonly message: string;
  readonly error?: string;
  readonly repositoryChanges?: WorkflowRunRepositoryChanges;
  readonly steps: ReadonlyArray<WorkflowRunStepSummary>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toIsoString = (value: Date | string | undefined): string | undefined =>
  value instanceof Date ? value.toISOString() : value;

const stringifyValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const normalizePreview = (value: string, maxLength = 220): string => {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
};

const previewValue = (value: unknown): string =>
  value === undefined ? "No output recorded." : normalizePreview(stringifyValue(value));

const uniqueStrings = (values: ReadonlyArray<string | undefined>): ReadonlyArray<string> =>
  Array.from(new Set(values.filter((value): value is string => Boolean(value))));

const getStepNames = (execution: RuntimeExecution): ReadonlyArray<string> =>
  uniqueStrings([
    ...execution.stepOrder,
    ...Object.keys(execution.outputs),
    ...Object.keys(execution.stepRecords),
  ]);

const getTrace = (
  execution: RuntimeExecution,
  stepName: string,
  record: Record<string, unknown> | undefined
): ExecutionTrace | undefined => {
  const fromExecution = execution.traces?.[stepName];
  const fromRecord = record?.trace;
  return fromExecution
    ? fromExecution
    : isRecord(fromRecord)
      ? (fromRecord as unknown as ExecutionTrace)
      : undefined;
};

const getRawRecord = (record: Record<string, unknown> | undefined): Record<string, unknown> | undefined =>
  isRecord(record?.raw) ? record.raw : undefined;

const getRecordedToolCalls = (
  raw: Record<string, unknown> | undefined
): ReadonlyArray<Record<string, unknown>> => {
  const message = isRecord(raw?.message) ? raw.message : undefined;
  const rawToolCalls = Array.isArray(raw?.toolCalls) ? raw.toolCalls : [];
  const messageToolCalls = Array.isArray(message?.toolCalls) ? message.toolCalls : [];
  return [...rawToolCalls, ...messageToolCalls].filter(isRecord);
};

const getToolCalls = (raw: Record<string, unknown> | undefined): ReadonlyArray<string> =>
  getRecordedToolCalls(raw)
    .map((toolCall) =>
      isRecord(toolCall.function) && typeof toolCall.function.name === "string"
        ? toolCall.function.name
        : undefined
    )
    .filter((name): name is string => Boolean(name));

const getFileWriteArtifacts = (raw: Record<string, unknown> | undefined): ReadonlyArray<string> =>
  getRecordedToolCalls(raw)
    .map((toolCall) => {
      const fn = isRecord(toolCall.function) ? toolCall.function : undefined;
      if (fn?.name !== "file_write" || typeof fn.arguments !== "string") {
        return undefined;
      }
      try {
        const args = JSON.parse(fn.arguments) as unknown;
        return isRecord(args) && typeof args.path === "string" ? args.path : undefined;
      } catch {
        return undefined;
      }
    })
    .filter((path): path is string => Boolean(path));

const getOutputFormat = (trace: ExecutionTrace | undefined, output: unknown): string =>
  trace?.output_format ??
  (typeof output === "string" ? "text" : output === undefined ? "none" : "structured");

const getStepSummary = (execution: RuntimeExecution, stepName: string): WorkflowRunStepSummary => {
  const recordValue = execution.stepRecords[stepName];
  const record = isRecord(recordValue) ? recordValue : undefined;
  const raw = getRawRecord(record);
  const trace = getTrace(execution, stepName, record);
  const output = execution.outputs[stepName];
  const model = typeof raw?.model === "string" ? raw.model : undefined;
  const completed = execution.completedSteps.includes(stepName);

  return {
    name: stepName,
    status: completed ? "completed" : "missing",
    ...(trace?.agent ? { agent: trace.agent } : {}),
    ...(model ? { model } : {}),
    outputPreview: trace?.output_summary ? normalizePreview(trace.output_summary) : previewValue(output),
    outputFormat: getOutputFormat(trace, output),
    toolsUsed: uniqueStrings([...(trace?.tools_used ?? []), ...getToolCalls(raw)]),
    artifacts: uniqueStrings([...(trace?.artifacts_created ?? []), ...getFileWriteArtifacts(raw)]),
    ...(trace?.task_summary ? { task: trace.task_summary } : {}),
    ...(trace?.methodology ? { methodology: trace.methodology } : {}),
    ...(trace?.decision_rationale ? { rationale: trace.decision_rationale } : {}),
    decisions: trace?.key_decisions ?? [],
    issues: trace?.issues_encountered ?? [],
    dependencies: (trace?.dependencies_used ?? []).map((dependency) => dependency.step),
  };
};

const buildMessage = (
  execution: RuntimeExecution,
  completedStepCount: number,
  totalStepCount: number
): string => {
  const statusLabel =
    execution.status === "completed"
      ? "completed"
      : execution.status === "failed"
        ? "failed"
        : execution.status;
  return `Workflow ${statusLabel}: ${completedStepCount}/${totalStepCount} steps completed.`;
};

export function buildWorkflowRunSummary(execution: RuntimeExecution): WorkflowRunSummary {
  const stepNames = getStepNames(execution);
  const startedAt = toIsoString(execution.startedAt) ?? new Date(0).toISOString();
  const endedAt = toIsoString(execution.endedAt);
  const durationMs =
    execution.endedAt instanceof Date && execution.startedAt instanceof Date
      ? execution.endedAt.getTime() - execution.startedAt.getTime()
      : undefined;
  const completedStepCount = execution.completedSteps.length;
  const totalStepCount = stepNames.length;

  return {
    executionId: execution.id,
    workflowName: execution.workflowName,
    status: execution.status,
    startedAt,
    ...(endedAt ? { endedAt } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    completedStepCount,
    totalStepCount,
    message: buildMessage(execution, completedStepCount, totalStepCount),
    ...(execution.error ? { error: execution.error } : {}),
    steps: stepNames.map((stepName) => getStepSummary(execution, stepName)),
  };
}
