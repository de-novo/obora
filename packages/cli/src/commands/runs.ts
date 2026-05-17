/**
 * M6-01: CLI commands for run persistence queries
 *
 * `obora runs list` — List persisted runs
 * `obora runs inspect <runId>` — Show run details with steps
 *
 * All queries go through SDK's OboraRuntime, which resolves the correct
 * StorageAdapter (sqlite / custom) based on config — preserving the
 * pluggable adapter contract.
 */

import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts, type GlobalOptions } from "../utils/global-opts.js";

const RUN_STATUSES = ["running", "completed", "failed", "suspended"] as const;
const RUN_REPAIR_LOOP_FILTERS = [
  "with",
  "without",
  "stalled",
  "exhausted",
  "critical",
  "no-progress",
] as const;
const RUN_SORT_FIELDS = ["startedAt", "validationFailed", "repairStarted"] as const;
const RUN_SORT_ORDERS = ["asc", "desc"] as const;

interface ValidationFailureDetail {
  stepName?: string;
  summary?: string;
  errorCode?: string;
  logPath?: string;
  failedChecks: Array<{
    name?: string;
    message?: string;
    severity?: string;
    file?: string;
  }>;
}

interface PersistedRunRecord {
  id: string;
  workflowName?: string;
  status?: string;
  startedAt?: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

interface PersistedRunStep {
  stepName: string;
  status: string;
  durationMs?: number;
  error?: {
    code: string;
    message: string;
  };
}

interface PersistedArtifactRecord {
  stepName: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

interface PersistedCostBreakdownItem {
  stepName?: string;
  model?: string;
  tokens: number;
  costUsd: number;
}

interface PersistedCostSummary {
  totalTokens: number;
  totalCostUsd: number;
  byStep: PersistedCostBreakdownItem[];
  byModel: PersistedCostBreakdownItem[];
}

interface LinkedDlqInspectEntry {
  id: string;
  createdAt: string;
  status: string;
  errorCode: string;
  errorMessage: string;
  repairAttempts: number;
  stepName?: string;
  lastStopCategory?: string;
}

interface PersistedRunListRow extends PersistedRunRecord {
  triageCause?: string;
  linkedDlqEntry?: LinkedDlqInspectEntry;
}

interface PersistedRunsRuntime {
  listRunRecords(query: Record<string, unknown>): Promise<PersistedRunRecord[]>;
}

interface PersistedRunInspectRuntime {
  getRunRecord(runId: string): Promise<PersistedRunRecord | null>;
  getRunSteps(runId: string): Promise<PersistedRunStep[]>;
  getRunArtifacts(runId: string): Promise<PersistedArtifactRecord[]>;
  getRunCostSummary(runId: string): Promise<PersistedCostSummary>;
  getRunAuditTimeline(runId: string): Promise<StructuredAuditEventLike[]>;
}

export interface RepairLoopInspectSummary {
  validationFailed: number;
  validationPassed: number;
  repairStarted: number;
  repairCompleted: number;
  repairNoProgress: number;
  backEdgeTriggered: number;
  backEdgeExhausted: number;
  lastValidationSummary?: string;
  lastValidationStep?: string;
  lastRepairStep?: string;
  lastAttempt?: number;
  lastNoProgressReason?: string;
  lastExhaustReason?: string;
  lastStopCategory?: string;
  recentValidationFailures: ValidationFailureDetail[];
}

interface StructuredAuditEventLike {
  action?: string;
  stepName?: string;
  detail?: Record<string, unknown>;
}

export async function createRuntime() {
  const { OboraRuntime, loadConfig } = await import("@obora/sdk");

  const config = await loadConfig();
  const persistence = (config as Record<string, unknown>).persistence as
    | { enabled?: boolean; adapter?: string; sqlite?: { path?: string }; custom?: unknown }
    | undefined;

  return new OboraRuntime({
    persistence: {
      enabled: persistence?.enabled ?? true,
      adapter: (persistence?.adapter as "sqlite" | "custom") ?? "sqlite",
      sqlite: { path: persistence?.sqlite?.path ?? "./data/obora.db" },
      ...(persistence?.custom
        ? { custom: persistence.custom as { instance: import("@obora/runtime").StorageAdapter } }
        : {}),
    },
  });
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseNumberOption(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CLIError(`Invalid runs ${label}: ${value}`, ExitCode.VALIDATION_ERROR);
  }
  return parsed;
}

function shouldOutputJson(localJson: boolean | undefined, globalOpts: GlobalOptions): boolean {
  return Boolean(localJson || globalOpts.json);
}

function isRunStatus(value: string | undefined): value is (typeof RUN_STATUSES)[number] {
  return typeof value === "string" && (RUN_STATUSES as readonly string[]).includes(value);
}

function isRunRepairLoopFilter(
  value: string | undefined
): value is (typeof RUN_REPAIR_LOOP_FILTERS)[number] {
  return (
    typeof value === "string" && (RUN_REPAIR_LOOP_FILTERS as readonly string[]).includes(value)
  );
}

function isRunSortField(value: string | undefined): value is (typeof RUN_SORT_FIELDS)[number] {
  return typeof value === "string" && (RUN_SORT_FIELDS as readonly string[]).includes(value);
}

function isRunSortOrder(value: string | undefined): value is (typeof RUN_SORT_ORDERS)[number] {
  return typeof value === "string" && (RUN_SORT_ORDERS as readonly string[]).includes(value);
}

function toValidationFailureDetail(event: StructuredAuditEventLike): ValidationFailureDetail {
  const detail = event.detail ?? {};
  const rawChecks = Array.isArray(detail.failedChecks) ? detail.failedChecks : [];
  const failedChecks = rawChecks
    .filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object" && !Array.isArray(entry)
    )
    .map((entry) => ({
      ...(typeof entry.name === "string" ? { name: entry.name } : {}),
      ...(typeof entry.message === "string" ? { message: entry.message } : {}),
      ...(typeof entry.severity === "string" ? { severity: entry.severity } : {}),
      ...(typeof entry.file === "string" ? { file: entry.file } : {}),
    }));

  return {
    ...(event.stepName ? { stepName: event.stepName } : {}),
    ...(typeof detail.summary === "string" ? { summary: detail.summary } : {}),
    ...(typeof detail.errorCode === "string" ? { errorCode: detail.errorCode } : {}),
    ...(typeof detail.logPath === "string" ? { logPath: detail.logPath } : {}),
    failedChecks,
  };
}

export function summarizeRepairLoopTimeline(
  timeline: StructuredAuditEventLike[]
): RepairLoopInspectSummary | undefined {
  const summary: RepairLoopInspectSummary = {
    validationFailed: 0,
    validationPassed: 0,
    repairStarted: 0,
    repairCompleted: 0,
    repairNoProgress: 0,
    backEdgeTriggered: 0,
    backEdgeExhausted: 0,
    recentValidationFailures: [],
  };

  timeline.forEach((event) => {
    const detail = event.detail ?? {};
    switch (event.action) {
      case "workflow.validation_failed":
        summary.validationFailed += 1;
        summary.lastValidationStep = event.stepName;
        summary.lastValidationSummary =
          typeof detail.summary === "string" ? detail.summary : summary.lastValidationSummary;
        summary.recentValidationFailures.push(toValidationFailureDetail(event));
        if (summary.recentValidationFailures.length > 5) {
          summary.recentValidationFailures.shift();
        }
        break;
      case "workflow.validation_passed":
        summary.validationPassed += 1;
        summary.lastValidationStep = event.stepName;
        summary.lastValidationSummary =
          typeof detail.summary === "string" ? detail.summary : summary.lastValidationSummary;
        break;
      case "workflow.repair_started":
        summary.repairStarted += 1;
        summary.lastRepairStep =
          typeof detail.stepName === "string" ? detail.stepName : event.stepName;
        summary.lastAttempt =
          typeof detail.attempt === "number" ? detail.attempt : summary.lastAttempt;
        break;
      case "workflow.repair_completed":
        summary.repairCompleted += 1;
        summary.lastRepairStep =
          typeof detail.stepName === "string" ? detail.stepName : event.stepName;
        summary.lastAttempt =
          typeof detail.attempt === "number" ? detail.attempt : summary.lastAttempt;
        break;
      case "workflow.repair_no_progress":
        summary.repairNoProgress += 1;
        summary.lastNoProgressReason =
          typeof detail.reason === "string" ? detail.reason : summary.lastNoProgressReason;
        break;
      case "workflow.back_edge_triggered":
        summary.backEdgeTriggered += 1;
        break;
      case "workflow.back_edge_exhausted":
        summary.backEdgeExhausted += 1;
        summary.lastExhaustReason =
          typeof detail.reason === "string" ? detail.reason : summary.lastExhaustReason;
        break;
      default:
        break;
    }
  });

  const hasActivity =
    summary.validationFailed > 0 ||
    summary.validationPassed > 0 ||
    summary.repairStarted > 0 ||
    summary.repairCompleted > 0 ||
    summary.repairNoProgress > 0 ||
    summary.backEdgeTriggered > 0 ||
    summary.backEdgeExhausted > 0;

  return hasActivity ? summary : undefined;
}

function matchesRepairLoopFilter(
  summary: RepairLoopInspectSummary | undefined,
  filter: string | undefined
): boolean {
  if (!filter) return true;
  switch (filter) {
    case "with":
      return Boolean(summary);
    case "without":
      return !summary;
    case "stalled":
      return (summary?.repairNoProgress ?? 0) > 0;
    case "exhausted":
      return (summary?.backEdgeExhausted ?? 0) > 0;
    case "critical":
      return summary?.lastStopCategory === "repeated_critical_issue";
    case "no-progress":
      return summary?.lastStopCategory === "no_progress";
    default:
      return true;
  }
}

function getCliSortValue(
  run: PersistedRunRecord,
  sortBy: "startedAt" | "validationFailed" | "repairStarted"
): number | string {
  const repairLoop = extractPersistedRepairLoopSummary(run);
  switch (sortBy) {
    case "validationFailed":
      return repairLoop?.validationFailed ?? -1;
    case "repairStarted":
      return repairLoop?.repairStarted ?? -1;
    case "startedAt":
    default:
      return run.startedAt ?? "";
  }
}

export function sortRunsForCli(
  runs: PersistedRunRecord[],
  sortBy: "startedAt" | "validationFailed" | "repairStarted" = "startedAt",
  order: "asc" | "desc" = "desc"
): PersistedRunRecord[] {
  const sign = order === "asc" ? 1 : -1;
  return [...runs].sort((a, b) => {
    const aValue = getCliSortValue(a, sortBy);
    const bValue = getCliSortValue(b, sortBy);
    if (typeof aValue === "number" && typeof bValue === "number") {
      return (aValue - bValue) * sign;
    }
    return String(aValue).localeCompare(String(bValue)) * sign;
  });
}

export async function listRunsForCli(
  runtime: PersistedRunsRuntime,
  opts: {
    status?: string;
    workflow?: string;
    limit?: number;
    repairLoop?: string;
    sortBy?: "startedAt" | "validationFailed" | "repairStarted";
    order?: "asc" | "desc";
  }
): Promise<PersistedRunRecord[]> {
  const needsPostProcessing =
    Boolean(opts.repairLoop) ||
    (opts.sortBy && opts.sortBy !== "startedAt") ||
    opts.order === "asc";

  if (!needsPostProcessing) {
    return runtime.listRunRecords({
      status: opts.status,
      workflowName: opts.workflow,
      limit: opts.limit,
    });
  }

  const pageSize = 200;
  const maxTotalRuns = 10_000;
  const collectPages = async (
    offset = 0,
    collected: PersistedRunRecord[] = []
  ): Promise<PersistedRunRecord[]> => {
    if (collected.length >= maxTotalRuns) {
      return collected;
    }
    const page = await runtime.listRunRecords({
      status: opts.status,
      workflowName: opts.workflow,
      limit: pageSize,
      offset,
    });
    const nextCollected = [...collected, ...page];
    return page.length < pageSize ? nextCollected : collectPages(offset + pageSize, nextCollected);
  };
  const allRuns = await collectPages();

  const filtered = allRuns.filter((run) =>
    matchesRepairLoopFilter(extractPersistedRepairLoopSummary(run), opts.repairLoop)
  );

  const sorted = sortRunsForCli(filtered, opts.sortBy ?? "startedAt", opts.order ?? "desc");
  return sorted.slice(0, opts.limit ?? 20);
}

export function getCliRepairLoopState(summary: RepairLoopInspectSummary | undefined): string {
  if (!summary) return "-";
  if (summary.backEdgeExhausted > 0) return "EXHAUSTED";
  if (summary.repairNoProgress > 0) return "STALLED";
  if (summary.validationFailed > 0 && summary.validationPassed > 0) return "CONVERGED";
  if (summary.repairStarted > 0 || summary.repairCompleted > 0) return "REPAIRED";
  return "PASSED";
}

function formatRepairLoopListSummary(summary: RepairLoopInspectSummary | undefined): string {
  if (!summary) return "-";
  const parts: string[] = [];
  if (summary.validationFailed > 0) parts.push(`F${summary.validationFailed}`);
  if (summary.repairStarted > 0) parts.push(`R${summary.repairStarted}`);
  if (summary.validationPassed > 0) parts.push(`P${summary.validationPassed}`);
  if (summary.repairNoProgress > 0) parts.push(`N${summary.repairNoProgress}`);
  if (summary.backEdgeExhausted > 0) parts.push(`X${summary.backEdgeExhausted}`);
  const prefix = parts.length > 0 ? parts.join("/") : "loop";
  const last = summary.lastValidationSummary
    ? summary.lastValidationSummary.length > 28
      ? `${summary.lastValidationSummary.slice(0, 27)}…`
      : summary.lastValidationSummary
    : undefined;
  return last ? `${prefix} ${last}` : prefix;
}

function extractPersistedRepairLoopSummary(
  run: PersistedRunRecord | null | undefined
): RepairLoopInspectSummary | undefined {
  const metadata = run?.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const repairLoop = metadata.repairLoop;
  if (!repairLoop || typeof repairLoop !== "object" || Array.isArray(repairLoop)) return undefined;
  return repairLoop as RepairLoopInspectSummary;
}

async function loadLinkedDlqEntries(
  runIds: string[]
): Promise<Record<string, LinkedDlqInspectEntry | undefined>> {
  const uniqueRunIds = [...new Set(runIds.filter(Boolean))];
  if (uniqueRunIds.length === 0) return {};

  try {
    const { FileDLQStore, loadConfig } = await import("@obora/sdk");
    const config = await loadConfig();
    const filePath = config?.dlq?.filePath ?? ".obora/dlq/dead-letters.json";
    const store = new FileDLQStore(filePath);
    const snapshot = await store.load();
    const entryMap = new Map<string, LinkedDlqInspectEntry>();

    [...snapshot.entries].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    ).forEach((entry) => {
      if (!uniqueRunIds.includes(entry.executionId) || entryMap.has(entry.executionId)) return;
      const repairLoop =
        entry.metadata?.repairLoop &&
        typeof entry.metadata.repairLoop === "object" &&
        !Array.isArray(entry.metadata.repairLoop)
          ? (entry.metadata.repairLoop as Record<string, unknown>)
          : undefined;
      entryMap.set(entry.executionId, {
        id: entry.id,
        createdAt: entry.createdAt,
        status: entry.status,
        errorCode: entry.errorCode,
        errorMessage: entry.errorMessage,
        repairAttempts: entry.repairAttempts,
        ...(entry.stepName ? { stepName: entry.stepName } : {}),
        ...(typeof repairLoop?.lastStopCategory === "string"
          ? { lastStopCategory: repairLoop.lastStopCategory }
          : {}),
      });
    });

    return Object.fromEntries(uniqueRunIds.map((runId) => [runId, entryMap.get(runId)]));
  } catch {
    return {};
  }
}

async function loadLinkedDlqEntry(runId: string): Promise<LinkedDlqInspectEntry | undefined> {
  return (await loadLinkedDlqEntries([runId]))[runId];
}

function formatLinkedDlqIndicator(linkedDlqEntry: LinkedDlqInspectEntry | undefined): string {
  if (!linkedDlqEntry) return "-";
  return `${linkedDlqEntry.status}/${linkedDlqEntry.repairAttempts}`;
}

function getRunTriageCause(run: PersistedRunListRow): string | undefined {
  const repairLoop = extractPersistedRepairLoopSummary(run);
  if (typeof repairLoop?.lastStopCategory === "string") return repairLoop.lastStopCategory;
  return run.linkedDlqEntry?.lastStopCategory;
}

export async function inspectPersistedRun(
  runtime: PersistedRunInspectRuntime,
  runId: string,
  opts: { json?: boolean; cost?: boolean; steps?: boolean }
): Promise<void> {
  const run = await runtime.getRunRecord(runId);
  if (!run) {
    throw new CLIError(`Run not found: ${runId}`, ExitCode.VALIDATION_ERROR);
  }

  const steps = opts.steps !== false ? await runtime.getRunSteps(runId) : [];
  const artifacts = await runtime.getRunArtifacts(runId);
  const costSummary = opts.cost ? await runtime.getRunCostSummary(runId) : undefined;
  const persistedRepairLoop = extractPersistedRepairLoopSummary(run);
  const auditTimeline = persistedRepairLoop ? undefined : await runtime.getRunAuditTimeline(runId);
  const repairLoop = persistedRepairLoop ?? summarizeRepairLoopTimeline(auditTimeline ?? []);
  const linkedDlqEntry = await loadLinkedDlqEntry(runId);

  if (opts.json) {
    const payload: Record<string, unknown> = {
      run,
      artifacts,
      ...(auditTimeline ? { auditTimeline } : {}),
      ...(repairLoop ? { repairLoop } : {}),
      ...(linkedDlqEntry ? { linkedDlqEntry } : {}),
      ...(costSummary ? { costSummary } : {}),
    };
    if (opts.steps !== false) payload.steps = steps;
    formatter.json(payload);
    return;
  }

  console.log(`\nRun: ${run.id}`);
  console.log(`  Workflow: ${run.workflowName}`);
  console.log(`  Status:   ${run.status}`);
  console.log(`  Started:  ${run.startedAt}`);
  if (run.completedAt) console.log(`  Completed: ${run.completedAt}`);
  if (run.metadata) console.log(`  Metadata: ${JSON.stringify(run.metadata)}`);

  if (repairLoop) {
    console.log(`\nRepair Loop Summary:`);
    console.log(`  Validation Failed:   ${repairLoop.validationFailed}`);
    console.log(`  Validation Passed:   ${repairLoop.validationPassed}`);
    console.log(`  Repair Started:      ${repairLoop.repairStarted}`);
    console.log(`  Repair Completed:    ${repairLoop.repairCompleted}`);
    console.log(`  No Progress Events:  ${repairLoop.repairNoProgress}`);
    console.log(`  Back-edges:          ${repairLoop.backEdgeTriggered}`);
    console.log(`  Exhausted:           ${repairLoop.backEdgeExhausted}`);
    if (repairLoop.lastAttempt !== undefined)
      console.log(`  Last Attempt:        ${repairLoop.lastAttempt}`);
    if (repairLoop.lastValidationStep)
      console.log(`  Last Validator:      ${repairLoop.lastValidationStep}`);
    if (repairLoop.lastRepairStep)
      console.log(`  Last Repair Step:    ${repairLoop.lastRepairStep}`);
    if (repairLoop.lastValidationSummary)
      console.log(`  Last Validation:     ${repairLoop.lastValidationSummary}`);
    if (repairLoop.lastStopCategory) {
      console.log(`  Last Stop Category:  ${repairLoop.lastStopCategory}`);
    }
    if (repairLoop.lastNoProgressReason)
      console.log(`  Last No-Progress:    ${repairLoop.lastNoProgressReason}`);
    if (repairLoop.lastExhaustReason)
      console.log(`  Last Exhaust Reason: ${repairLoop.lastExhaustReason}`);

    if (repairLoop.recentValidationFailures.length > 0) {
      console.log(`\nRecent Validation Failures (${repairLoop.recentValidationFailures.length}):`);
      repairLoop.recentValidationFailures.forEach((failure, index) => {
        console.log(
          `  ${index + 1}. ${failure.stepName ?? "validate"}${failure.summary ? ` — ${failure.summary}` : ""}`
        );
        if (failure.errorCode) console.log(`     Code: ${failure.errorCode}`);
        if (failure.logPath) console.log(`     Log:  ${failure.logPath}`);
        failure.failedChecks.slice(0, 3).forEach((check) => {
          console.log(
            `     - ${check.name ?? "check"}${check.file ? ` [${check.file}]` : ""}${check.message ? `: ${check.message}` : ""}`
          );
        });
      });
    }
  }

  if (opts.steps !== false && steps.length > 0) {
    console.log(`\nSteps (${steps.length}):`);
    steps.forEach((step) => {
      const duration = step.durationMs ? ` (${step.durationMs}ms)` : "";
      console.log(`  ${step.stepName.padEnd(20)} ${step.status.padEnd(12)}${duration}`);
      if (step.error) {
        console.log(`    Error: [${step.error.code}] ${step.error.message}`);
      }
    });
  }

  if (artifacts.length > 0) {
    console.log(`\nArtifacts (${artifacts.length}):`);
    artifacts.forEach((artifact) => {
      console.log(`  ${artifact.stepName}/${artifact.name} (${artifact.mimeType}, ${artifact.sizeBytes} bytes)`);
    });
  }

  if (linkedDlqEntry) {
    console.log(`\nLinked DLQ Entry:`);
    console.log(`  ID:               ${linkedDlqEntry.id}`);
    console.log(`  Status:           ${linkedDlqEntry.status}`);
    console.log(`  Error Code:       ${linkedDlqEntry.errorCode}`);
    console.log(`  Repair Attempts:  ${linkedDlqEntry.repairAttempts}`);
    if (linkedDlqEntry.stepName) console.log(`  Step Name:        ${linkedDlqEntry.stepName}`);
    if (linkedDlqEntry.lastStopCategory)
      console.log(`  Stop Category:    ${linkedDlqEntry.lastStopCategory}`);
    console.log(`  Inspect:          obora dlq inspect ${linkedDlqEntry.id}`);
  }

  if (costSummary) {
    console.log(`\nCost Summary:`);
    console.log(`  Total Tokens: ${costSummary.totalTokens}`);
    console.log(`  Total Cost:   $${costSummary.totalCostUsd.toFixed(6)}`);
    if (costSummary.byStep.length > 0) {
      console.log("  By Step:");
      costSummary.byStep.forEach((item) => {
        console.log(`    - ${item.stepName}: ${item.tokens} tokens, $${item.costUsd.toFixed(6)}`);
      });
    }
    if (costSummary.byModel.length > 0) {
      console.log("  By Model:");
      costSummary.byModel.forEach((item) => {
        console.log(`    - ${item.model}: ${item.tokens} tokens, $${item.costUsd.toFixed(6)}`);
      });
    }
  }
}

async function runListRuns(
  opts: {
    status?: string;
    workflow?: string;
    repairLoop?: string;
    sort?: string;
    order?: string;
    limit?: string;
    json?: boolean;
  },
  globalOpts: GlobalOptions
): Promise<void> {
  if (opts.status && !isRunStatus(opts.status)) {
    throw new CLIError(
      `Invalid runs status. Must be one of: ${RUN_STATUSES.join(", ")}`,
      ExitCode.VALIDATION_ERROR
    );
  }
  if (opts.repairLoop && !isRunRepairLoopFilter(opts.repairLoop)) {
    throw new CLIError(
      `Invalid runs repair-loop filter. Must be one of: ${RUN_REPAIR_LOOP_FILTERS.join(", ")}`,
      ExitCode.VALIDATION_ERROR
    );
  }
  if (opts.sort && !isRunSortField(opts.sort)) {
    throw new CLIError(
      `Invalid runs sort field. Must be one of: ${RUN_SORT_FIELDS.join(", ")}`,
      ExitCode.VALIDATION_ERROR
    );
  }
  if (opts.order && !isRunSortOrder(opts.order)) {
    throw new CLIError(
      `Invalid runs sort order. Must be one of: ${RUN_SORT_ORDERS.join(", ")}`,
      ExitCode.VALIDATION_ERROR
    );
  }

  const status = isRunStatus(opts.status) ? opts.status : undefined;
  const repairLoop = isRunRepairLoopFilter(opts.repairLoop) ? opts.repairLoop : undefined;
  const sortBy = isRunSortField(opts.sort) ? opts.sort : "startedAt";
  const order = isRunSortOrder(opts.order) ? opts.order : "desc";
  const limit = parseNumberOption(opts.limit, 20, "limit");

  const runRecords = await (async (): Promise<PersistedRunRecord[]> => {
    try {
      const runtime = await createRuntime();
      return await listRunsForCli(runtime, {
        status,
        workflow: opts.workflow,
        repairLoop,
        sortBy,
        order,
        limit,
      });
    } catch (error) {
      if (error instanceof CLIError) throw error;
      throw new CLIError(
        `Failed to load persisted runs: ${getErrorMessage(error)}`,
        ExitCode.EXECUTION_FAILED
      );
    }
  })();

  const linkedDlqEntries = await loadLinkedDlqEntries(runRecords.map((run) => run.id));
  const runRows: PersistedRunListRow[] = runRecords.map((run) => {
    const row: PersistedRunListRow = {
      ...run,
      ...(linkedDlqEntries[run.id] ? { linkedDlqEntry: linkedDlqEntries[run.id] } : {}),
    };
    const triageCause = getRunTriageCause(row);
    return {
      ...row,
      ...(triageCause ? { triageCause } : {}),
    };
  });

  if (shouldOutputJson(opts.json, globalOpts)) {
    formatter.json(runRows);
    return;
  }

  if (runRows.length === 0) {
    console.log("No runs found.");
    return;
  }

  console.log(
    `${"ID".padEnd(38)} ${"Workflow".padEnd(20)} ${"Status".padEnd(12)} ${"Loop State".padEnd(12)} ${"Cause".padEnd(24)} ${"DLQ".padEnd(12)} ${"Repair Loop".padEnd(40)} Started At`
  );
  console.log("-".repeat(183));
  runRows.forEach((run) => {
    const repairLoopSummary = extractPersistedRepairLoopSummary(run);
    const repairState = getCliRepairLoopState(repairLoopSummary);
    const repairSummary = formatRepairLoopListSummary(repairLoopSummary);
    const linkedDlqIndicator = formatLinkedDlqIndicator(run.linkedDlqEntry);
    const triageCause = run.triageCause ?? "-";
    console.log(
      `${run.id.padEnd(38)} ${(run.workflowName ?? "-").padEnd(20)} ${(run.status ?? "-").padEnd(12)} ${repairState.padEnd(12)} ${triageCause.padEnd(24)} ${linkedDlqIndicator.padEnd(12)} ${repairSummary.padEnd(40)} ${run.startedAt ?? "-"}`
    );
  });
  console.log(`\n${runRows.length} run(s)`);
}

async function runInspectPersistedRun(
  runId: string,
  opts: { json?: boolean; cost?: boolean },
  globalOpts: GlobalOptions
): Promise<void> {
  try {
    const runtime = await createRuntime();
    await inspectPersistedRun(runtime, runId, {
      json: shouldOutputJson(opts.json, globalOpts),
      cost: opts.cost,
      steps: true,
    });
  } catch (error) {
    if (error instanceof CLIError) throw error;
    throw new CLIError(
      `Failed to inspect persisted run: ${getErrorMessage(error)}`,
      ExitCode.EXECUTION_FAILED
    );
  }
}

export function createRunsCommand(): Command {
  const runs = new Command("runs").description("Query persisted run records");

  runs
    .command("list")
    .description("List persisted runs")
    .option("--status <status>", "Filter by status (running|completed|failed|suspended)")
    .option("--workflow <name>", "Filter by workflow name")
    .option(
      "--repair-loop <mode>",
      "Filter by repair-loop state (with|without|stalled|exhausted|critical|no-progress)"
    )
    .option("--sort <field>", "Sort by startedAt|validationFailed|repairStarted", "startedAt")
    .option("--order <dir>", "Sort order asc|desc", "desc")
    .option("--limit <n>", "Max results", "20")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, opts) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runListRuns(opts, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  runs
    .command("inspect <runId>")
    .description("Inspect a run with step details")
    .option("--json", "Output as JSON")
    .option("--cost", "Include detailed cost summary")
    .action(async function (this: Command, runId: string, opts) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runInspectPersistedRun(runId, opts, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  return runs;
}
