import { Command } from "commander";

import {
  FileDLQStore,
  loadConfig,
  resolveDLQEntry,
  summarizeDLQ,
  type DLQEntry,
  type DLQSnapshot,
} from "@obora/sdk";

import { createRuntime as createRunsRuntime } from "./runs.js";

import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts, type GlobalOptions } from "../utils/global-opts.js";

const DEFAULT_DLQ_PATH = ".obora/dlq/dead-letters.json";
const DLQ_RESOLUTION_STATUSES = ["reviewed", "retried", "dismissed"] as const;
const DLQ_ENTRY_STATUSES = ["pending", "reviewed", "retried", "dismissed"] as const;

type DlqEntryStatus = (typeof DLQ_ENTRY_STATUSES)[number];
type DlqResolutionStatus = (typeof DLQ_RESOLUTION_STATUSES)[number];

type DlqStoreLike = {
  load(): Promise<DLQSnapshot>;
  save(snapshot: DLQSnapshot): Promise<void>;
};

type RelatedRunSummary = {
  id: string;
  workflowName?: string;
  status?: string;
  startedAt?: string;
  completedAt?: string;
};

type RelatedArtifactSummary = {
  stepName: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

type RelatedInspectContext = {
  relatedRun?: RelatedRunSummary;
  relatedArtifacts: RelatedArtifactSummary[];
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseNumberOption(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new CLIError(`Invalid ${label}: ${value}`, ExitCode.VALIDATION_ERROR);
  }
  return parsed;
}

function isDlqEntryStatus(value: string | undefined): value is DlqEntryStatus {
  return typeof value === "string" && (DLQ_ENTRY_STATUSES as readonly string[]).includes(value);
}

function isDlqResolutionStatus(value: string | undefined): value is DlqResolutionStatus {
  return typeof value === "string" && (DLQ_RESOLUTION_STATUSES as readonly string[]).includes(value);
}

async function createDlqStore(filePath?: string): Promise<DlqStoreLike> {
  try {
    const config = await loadConfig();
    const resolvedPath = filePath ?? config?.dlq?.filePath ?? DEFAULT_DLQ_PATH;
    return new FileDLQStore(resolvedPath);
  } catch (error) {
    throw new CLIError(`Failed to resolve DLQ config: ${getErrorMessage(error)}`, ExitCode.EXECUTION_FAILED);
  }
}

async function loadDlqSnapshot(filePath?: string): Promise<{ store: DlqStoreLike; snapshot: DLQSnapshot }> {
  const store = await createDlqStore(filePath);
  try {
    const snapshot = await store.load();
    return { store, snapshot };
  } catch (error) {
    throw new CLIError(`Failed to load DLQ store: ${getErrorMessage(error)}`, ExitCode.EXECUTION_FAILED);
  }
}

async function saveDlqSnapshot(store: DlqStoreLike, snapshot: DLQSnapshot): Promise<void> {
  try {
    await store.save(snapshot);
  } catch (error) {
    throw new CLIError(`Failed to save DLQ store: ${getErrorMessage(error)}`, ExitCode.EXECUTION_FAILED);
  }
}

export function listDlqEntriesForCli(
  snapshot: DLQSnapshot,
  opts: { status?: DlqEntryStatus; limit?: number; offset?: number }
): {
  entries: DLQEntry[];
  total: number;
  limit: number;
  offset: number;
  pending: number;
  lastUpdated: string;
} {
  const filteredEntries = opts.status
    ? snapshot.entries.filter((entry) => entry.status === opts.status)
    : snapshot.entries;
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const entries = [...filteredEntries]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(offset, offset + limit);

  return {
    entries,
    total: filteredEntries.length,
    limit,
    offset,
    pending: snapshot.entries.filter((entry) => entry.status === "pending").length,
    lastUpdated: snapshot.lastUpdated,
  };
}

function formatStopCategory(entry: DLQEntry): string {
  const repairLoop = entry.metadata?.repairLoop;
  if (!repairLoop || typeof repairLoop !== "object" || Array.isArray(repairLoop)) return "-";
  const lastStopCategory = (repairLoop as Record<string, unknown>).lastStopCategory;
  return typeof lastStopCategory === "string" ? lastStopCategory : "-";
}

async function loadRelatedInspectContext(executionId: string): Promise<RelatedInspectContext> {
  try {
    const runtime = (await createRunsRuntime()) as {
      getRunRecord(runId: string): Promise<RelatedRunSummary | null>;
      getRunArtifacts?: (runId: string) => Promise<RelatedArtifactSummary[]>;
    };

    let relatedRun: RelatedRunSummary | undefined;
    try {
      const run = await runtime.getRunRecord(executionId);
      relatedRun = run
        ? {
            id: run.id,
            ...(run.workflowName ? { workflowName: run.workflowName } : {}),
            ...(run.status ? { status: run.status } : {}),
            ...(run.startedAt ? { startedAt: run.startedAt } : {}),
            ...(run.completedAt ? { completedAt: run.completedAt } : {}),
          }
        : undefined;
    } catch {
      relatedRun = undefined;
    }

    let relatedArtifacts: RelatedArtifactSummary[] = [];
    if (runtime.getRunArtifacts) {
      try {
        relatedArtifacts = (await runtime.getRunArtifacts(executionId))
          .slice(-5)
          .reverse()
          .map((artifact) => ({
            stepName: artifact.stepName,
            name: artifact.name,
            mimeType: artifact.mimeType,
            sizeBytes: artifact.sizeBytes,
          }));
      } catch {
        relatedArtifacts = [];
      }
    }

    return { relatedRun, relatedArtifacts };
  } catch {
    return { relatedArtifacts: [] };
  }
}

function formatTextList(entries: DLQEntry[]): void {
  console.log(
    `${"ID".padEnd(38)} ${"Workflow".padEnd(18)} ${"Status".padEnd(10)} ${"Attempts".padEnd(8)} ${"Stop".padEnd(24)} Created At`
  );
  console.log("-".repeat(112));
  for (const entry of entries) {
    console.log(
      `${entry.id.padEnd(38)} ${entry.workflowName.padEnd(18)} ${entry.status.padEnd(10)} ${String(entry.repairAttempts).padEnd(8)} ${formatStopCategory(entry).padEnd(24)} ${entry.createdAt}`
    );
  }
}

function printTextInspect(
  entry: DLQEntry,
  relatedRun?: RelatedRunSummary,
  relatedArtifacts: RelatedArtifactSummary[] = []
): void {
  console.log(`\nDLQ Entry: ${entry.id}`);
  console.log(`  Workflow:        ${entry.workflowName}`);
  console.log(`  Execution ID:    ${entry.executionId}`);
  console.log(`  Status:          ${entry.status}`);
  console.log(`  Created:         ${entry.createdAt}`);
  console.log(`  Error Code:      ${entry.errorCode}`);
  console.log(`  Error Message:   ${entry.errorMessage}`);
  console.log(`  Repair Attempts: ${entry.repairAttempts}`);
  if (entry.stepName) console.log(`  Step Name:       ${entry.stepName}`);
  if (entry.resolvedAt) console.log(`  Resolved At:     ${entry.resolvedAt}`);
  if (entry.resolvedBy) console.log(`  Resolved By:     ${entry.resolvedBy}`);
  if (entry.resolution) console.log(`  Resolution:      ${entry.resolution}`);
  if (entry.errorStack) console.log(`  Error Stack:     ${entry.errorStack}`);
  if (entry.metadata) {
    console.log(`  Metadata:        ${JSON.stringify(entry.metadata, null, 2)}`);
  }
  if (relatedRun) {
    console.log(`\nRelated Run:`);
    console.log(`  ID:              ${relatedRun.id}`);
    if (relatedRun.status) console.log(`  Status:          ${relatedRun.status}`);
    if (relatedRun.startedAt) console.log(`  Started:         ${relatedRun.startedAt}`);
    if (relatedRun.completedAt) console.log(`  Completed:       ${relatedRun.completedAt}`);
    console.log(`  Inspect:         obora runs inspect ${relatedRun.id}`);
  }
  if (relatedArtifacts.length > 0) {
    console.log(`\nRelated Artifacts (${relatedArtifacts.length}):`);
    for (const artifact of relatedArtifacts) {
      console.log(
        `  - ${artifact.stepName}/${artifact.name} (${artifact.mimeType}, ${artifact.sizeBytes} bytes)`
      );
      console.log(`    Fetch: obora artifact get ${entry.executionId} ${artifact.stepName} ${artifact.name}`);
    }
  }
}

function shouldOutputJson(localJson: boolean | undefined, globalOpts: GlobalOptions): boolean {
  return Boolean(localJson || globalOpts.json);
}

async function runListDlq(
  opts: { status?: string; limit?: string; offset?: string; file?: string; json?: boolean },
  globalOpts: GlobalOptions
): Promise<void> {
  if (opts.status && !isDlqEntryStatus(opts.status)) {
    throw new CLIError(
      "Invalid DLQ status. Must be one of: pending, reviewed, retried, dismissed",
      ExitCode.VALIDATION_ERROR
    );
  }

  const { snapshot } = await loadDlqSnapshot(opts.file);
  const payload = listDlqEntriesForCli(snapshot, {
    status: opts.status,
    limit: parseNumberOption(opts.limit, 50, "limit"),
    offset: parseNumberOption(opts.offset, 0, "offset"),
  });

  if (shouldOutputJson(opts.json, globalOpts)) {
    formatter.json(payload);
    return;
  }

  if (payload.entries.length === 0) {
    console.log("No DLQ entries found.");
    return;
  }

  formatTextList(payload.entries);
  console.log(`\n${payload.entries.length} entry(s) shown of ${payload.total} total. Pending: ${payload.pending}`);
}

async function runInspectDlq(
  entryId: string,
  opts: { file?: string; json?: boolean },
  globalOpts: GlobalOptions
): Promise<void> {
  const { snapshot } = await loadDlqSnapshot(opts.file);
  const entry = snapshot.entries.find((candidate) => candidate.id === entryId);

  if (!entry) {
    throw new CLIError(`DLQ entry not found: ${entryId}`, ExitCode.VALIDATION_ERROR);
  }

  const { relatedRun, relatedArtifacts } = await loadRelatedInspectContext(entry.executionId);

  if (shouldOutputJson(opts.json, globalOpts)) {
    formatter.json({
      entry,
      ...(relatedRun ? { relatedRun } : {}),
      ...(relatedArtifacts.length > 0 ? { relatedArtifacts } : {}),
    });
    return;
  }

  printTextInspect(entry, relatedRun, relatedArtifacts);
}

async function runSummaryDlq(opts: { file?: string; json?: boolean }, globalOpts: GlobalOptions): Promise<void> {
  const { snapshot } = await loadDlqSnapshot(opts.file);
  const summary = summarizeDLQ(snapshot);
  const payload = { ...summary, lastUpdated: snapshot.lastUpdated };

  if (shouldOutputJson(opts.json, globalOpts)) {
    formatter.json(payload);
    return;
  }

  console.log(`\nDLQ Summary`);
  console.log(`  Total Entries:   ${summary.totalEntries}`);
  console.log(`  Pending:         ${summary.pendingCount}`);
  console.log(`  Reviewed:        ${summary.reviewedCount}`);
  console.log(`  Retried:         ${summary.retriedCount}`);
  console.log(`  Dismissed:       ${summary.dismissedCount}`);
  if (summary.oldestPendingAt) {
    console.log(`  Oldest Pending:  ${summary.oldestPendingAt}`);
  }
  console.log(`  Last Updated:    ${snapshot.lastUpdated}`);
}

async function runResolveDlq(
  entryId: string,
  opts: {
    status: string;
    actor?: string;
    note?: string;
    file?: string;
    json?: boolean;
  },
  globalOpts: GlobalOptions
): Promise<void> {
  if (!isDlqResolutionStatus(opts.status)) {
    throw new CLIError(
      "Invalid resolution status. Must be one of: reviewed, retried, dismissed",
      ExitCode.VALIDATION_ERROR
    );
  }

  const { store, snapshot } = await loadDlqSnapshot(opts.file);
  const existingEntry = snapshot.entries.find((candidate) => candidate.id === entryId);
  if (!existingEntry) {
    throw new CLIError(`DLQ entry not found: ${entryId}`, ExitCode.VALIDATION_ERROR);
  }

  const updatedSnapshot = resolveDLQEntry(snapshot, entryId, {
    status: opts.status,
    actor: opts.actor,
    note: opts.note,
  });
  await saveDlqSnapshot(store, updatedSnapshot);
  const updatedEntry = updatedSnapshot.entries.find((candidate) => candidate.id === entryId);

  if (!updatedEntry) {
    throw new CLIError(`Failed to resolve DLQ entry: ${entryId}`, ExitCode.EXECUTION_FAILED);
  }

  if (shouldOutputJson(opts.json, globalOpts)) {
    formatter.json({ entry: updatedEntry });
    return;
  }

  formatter.success(`Resolved DLQ entry ${entryId} as ${updatedEntry.status}.`);
  if (updatedEntry.resolvedBy) console.log(`Actor: ${updatedEntry.resolvedBy}`);
  if (updatedEntry.resolution) console.log(`Note:  ${updatedEntry.resolution}`);
}

export function createDlqCommand(): Command {
  const cmd = new Command("dlq").description("Inspect and triage dead-letter queue entries");

  cmd
    .command("list")
    .description("List DLQ entries")
    .option("--status <status>", "Filter by status (pending|reviewed|retried|dismissed)")
    .option("--limit <n>", "Max results", "50")
    .option("--offset <n>", "Skip first N results", "0")
    .option("--file <path>", "Override DLQ file path")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, opts) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runListDlq(opts, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  cmd
    .command("inspect <entryId>")
    .description("Inspect a DLQ entry")
    .option("--file <path>", "Override DLQ file path")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, entryId: string, opts) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runInspectDlq(entryId, opts, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  cmd
    .command("summary")
    .description("Show DLQ summary")
    .option("--file <path>", "Override DLQ file path")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, opts) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runSummaryDlq(opts, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  cmd
    .command("resolve <entryId>")
    .description("Resolve a DLQ entry")
    .requiredOption("--status <status>", "Resolution status (reviewed|retried|dismissed)")
    .option("--actor <actor>", "Actor performing the resolution")
    .option("--note <note>", "Resolution note")
    .option("--file <path>", "Override DLQ file path")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, entryId: string, opts) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runResolveDlq(entryId, opts, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  return cmd;
}
