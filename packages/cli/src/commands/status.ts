import { FileDLQStore, loadConfig, summarizeDLQ } from "@obora/sdk";
import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts, type GlobalOptions } from "../utils/global-opts.js";

import type { RepairLoopInspectSummary } from "./runs.js";
import { createRuntime, getCliRepairLoopState } from "./runs.js";

const DEFAULT_STATUS_LIMIT = 5;
const DEFAULT_DLQ_PATH = ".obora/dlq/dead-letters.json";

interface StatusCommandOptions {
  json?: boolean;
  workflow?: string;
  limit?: string;
}

interface PersistedRunRecord {
  id: string;
  workflowName?: string;
  status?: string;
  startedAt?: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

interface LinkedDlqEntry {
  id: string;
  createdAt: string;
  status: string;
  errorCode: string;
  errorMessage: string;
  repairAttempts: number;
  stepName?: string;
  lastStopCategory?: string;
}

interface StatusRunRow extends PersistedRunRecord {
  loopState?: string;
  triageCause?: string;
  linkedDlqEntry?: LinkedDlqEntry;
}

function shouldOutputJson(localJson: boolean | undefined, globalOpts: GlobalOptions): boolean {
  return Boolean(localJson || globalOpts.json);
}

function parseLimitOption(value: string | undefined): number {
  if (value === undefined) return DEFAULT_STATUS_LIMIT;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CLIError(`Invalid status limit: ${value}`, ExitCode.VALIDATION_ERROR);
  }
  return parsed;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
): Promise<Record<string, LinkedDlqEntry | undefined>> {
  const uniqueRunIds = [...new Set(runIds.filter(Boolean))];
  if (uniqueRunIds.length === 0) return {};

  try {
    const config = await loadConfig();
    const filePath = config?.dlq?.filePath ?? DEFAULT_DLQ_PATH;
    const store = new FileDLQStore(filePath);
    const snapshot = await store.load();
    const entryMap = new Map<string, LinkedDlqEntry>();

    for (const entry of [...snapshot.entries].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    )) {
      if (!uniqueRunIds.includes(entry.executionId) || entryMap.has(entry.executionId)) continue;
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
    }

    return Object.fromEntries(uniqueRunIds.map((runId) => [runId, entryMap.get(runId)]));
  } catch (error) {
    throw new CLIError(
      `Failed to load status DLQ snapshot: ${getErrorMessage(error)}`,
      ExitCode.EXECUTION_FAILED
    );
  }
}

async function loadDlqSummary(): Promise<Record<string, unknown>> {
  try {
    const config = await loadConfig();
    const filePath = config?.dlq?.filePath ?? DEFAULT_DLQ_PATH;
    const store = new FileDLQStore(filePath);
    const snapshot = await store.load();
    return {
      ...summarizeDLQ(snapshot),
      lastUpdated: snapshot.lastUpdated,
    };
  } catch (error) {
    throw new CLIError(
      `Failed to load status DLQ summary: ${getErrorMessage(error)}`,
      ExitCode.EXECUTION_FAILED
    );
  }
}

async function loadStatusRuns(options: {
  workflow?: string;
  limit: number;
}): Promise<StatusRunRow[]> {
  let runtime: { listRunRecords(query: Record<string, unknown>): Promise<PersistedRunRecord[]> };
  try {
    runtime = (await createRuntime()) as {
      listRunRecords(query: Record<string, unknown>): Promise<PersistedRunRecord[]>;
    };
  } catch (error) {
    throw new CLIError(
      `Failed to load status runtime: ${getErrorMessage(error)}`,
      ExitCode.EXECUTION_FAILED
    );
  }

  let runRecords: PersistedRunRecord[];
  try {
    runRecords = await runtime.listRunRecords({
      ...(options.workflow ? { workflow: options.workflow } : {}),
      limit: options.limit,
    });
  } catch (error) {
    throw new CLIError(
      `Failed to load status runs: ${getErrorMessage(error)}`,
      ExitCode.EXECUTION_FAILED
    );
  }

  const linkedDlqEntries = await loadLinkedDlqEntries(runRecords.map((run) => run.id));

  return runRecords.map((run) => {
    const repairLoop = extractPersistedRepairLoopSummary(run);
    const linkedDlqEntry = linkedDlqEntries[run.id];
    const triageCause =
      typeof repairLoop?.lastStopCategory === "string"
        ? repairLoop.lastStopCategory
        : linkedDlqEntry?.lastStopCategory;

    return {
      ...run,
      ...(repairLoop ? { loopState: getCliRepairLoopState(repairLoop) } : {}),
      ...(triageCause ? { triageCause } : {}),
      ...(linkedDlqEntry ? { linkedDlqEntry } : {}),
    };
  });
}

function summarizeRunStatuses(runs: StatusRunRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const run of runs) {
    const key = run.status ?? "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function formatLinkedDlqIndicator(linkedDlqEntry: LinkedDlqEntry | undefined): string {
  if (!linkedDlqEntry) return "-";
  return `${linkedDlqEntry.status}/${linkedDlqEntry.repairAttempts}`;
}

function buildStatusPayload(
  runs: StatusRunRow[],
  dlqSummary: Record<string, unknown>,
  workflow?: string
) {
  return {
    generatedAt: new Date().toISOString(),
    ...(workflow ? { workflow } : {}),
    runs: {
      totalListed: runs.length,
      byStatus: summarizeRunStatuses(runs),
      ...(runs[0] ? { latest: runs[0] } : {}),
      recent: runs,
    },
    dlq: dlqSummary,
  };
}

function printStatusText(payload: ReturnType<typeof buildStatusPayload>): void {
  const latest = (payload.runs as { latest?: StatusRunRow }).latest;
  const byStatus = (payload.runs as { byStatus: Record<string, number> }).byStatus;
  const recent = (payload.runs as { recent: StatusRunRow[] }).recent;
  const dlq = payload.dlq as {
    totalEntries?: number;
    pendingCount?: number;
    reviewedCount?: number;
    retriedCount?: number;
    dismissedCount?: number;
    lastUpdated?: string;
  };

  console.log("Status Overview");
  console.log(`  Generated At: ${payload.generatedAt}`);
  if (payload.workflow) {
    console.log(`  Workflow Filter: ${payload.workflow}`);
  }
  console.log(`  Runs Listed: ${payload.runs.totalListed}`);
  console.log(
    `  Run Status Counts: ${
      Object.entries(byStatus)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ") || "none"
    }`
  );

  if (latest) {
    console.log("\nLatest Run");
    console.log(`  ID: ${latest.id}`);
    console.log(`  Workflow: ${latest.workflowName ?? "-"}`);
    console.log(`  Status: ${latest.status ?? "-"}`);
    console.log(`  Started At: ${latest.startedAt ?? "-"}`);
    if (latest.completedAt) console.log(`  Completed At: ${latest.completedAt}`);
    if (latest.loopState) console.log(`  Loop State: ${latest.loopState}`);
    if (latest.triageCause) console.log(`  Cause: ${latest.triageCause}`);
    if (latest.linkedDlqEntry) {
      console.log(
        `  Linked DLQ: ${formatLinkedDlqIndicator(latest.linkedDlqEntry)} (${latest.linkedDlqEntry.id})`
      );
    }
  }

  console.log("\nDLQ Summary");
  console.log(`  Total Entries: ${dlq.totalEntries ?? 0}`);
  console.log(`  Pending: ${dlq.pendingCount ?? 0}`);
  console.log(`  Reviewed: ${dlq.reviewedCount ?? 0}`);
  console.log(`  Retried: ${dlq.retriedCount ?? 0}`);
  console.log(`  Dismissed: ${dlq.dismissedCount ?? 0}`);
  if (dlq.lastUpdated) console.log(`  Last Updated: ${dlq.lastUpdated}`);

  if (recent.length > 0) {
    console.log("\nRecent Runs");
    console.log(
      `${"ID".padEnd(38)} ${"Workflow".padEnd(20)} ${"Status".padEnd(12)} ${"Loop".padEnd(12)} ${"DLQ".padEnd(12)} Started At`
    );
    console.log("-".repeat(110));
    for (const run of recent) {
      console.log(
        `${run.id.padEnd(38)} ${(run.workflowName ?? "-").padEnd(20)} ${(run.status ?? "-").padEnd(12)} ${(run.loopState ?? "-").padEnd(12)} ${formatLinkedDlqIndicator(run.linkedDlqEntry).padEnd(12)} ${run.startedAt ?? "-"}`
      );
    }
  } else {
    console.log("\nRecent Runs\n  No persisted runs found.");
  }
}

export async function runStatus(
  options: StatusCommandOptions,
  globalOpts: GlobalOptions
): Promise<void> {
  const limit = parseLimitOption(options.limit);
  const runs = await loadStatusRuns({ workflow: options.workflow, limit });
  const dlqSummary = await loadDlqSummary();
  const payload = buildStatusPayload(runs, dlqSummary, options.workflow);

  if (shouldOutputJson(options.json, globalOpts)) {
    formatter.json(payload);
    return;
  }

  printStatusText(payload);
}

export function createStatusCommand(): Command {
  return new Command("status")
    .description("Show persisted run and DLQ status overview")
    .option("--json", "Output structured status JSON")
    .option("--workflow <name>", "Filter status view to one workflow")
    .option("--limit <n>", "Number of recent runs to show", String(DEFAULT_STATUS_LIMIT))
    .action(async function (this: Command, options: StatusCommandOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runStatus(options, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });
}
