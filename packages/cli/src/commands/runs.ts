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

  for (const event of timeline) {
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
  }

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
  const allRuns: PersistedRunRecord[] = [];
  let offset = 0;

  while (allRuns.length < maxTotalRuns) {
    const page = await runtime.listRunRecords({
      status: opts.status,
      workflowName: opts.workflow,
      limit: pageSize,
      offset,
    });
    allRuns.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

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

export async function inspectPersistedRun(
  runtime: PersistedRunInspectRuntime,
  runId: string,
  opts: { json?: boolean; cost?: boolean; steps?: boolean }
): Promise<void> {
  const run = await runtime.getRunRecord(runId);
  if (!run) {
    console.error(`Run not found: ${runId}`);
    process.exit(1);
  }

  const steps = opts.steps !== false ? await runtime.getRunSteps(runId) : [];
  const artifacts = await runtime.getRunArtifacts(runId);
  const costSummary = opts.cost ? await runtime.getRunCostSummary(runId) : undefined;
  const persistedRepairLoop = extractPersistedRepairLoopSummary(run);
  const auditTimeline = persistedRepairLoop ? undefined : await runtime.getRunAuditTimeline(runId);
  const repairLoop = persistedRepairLoop ?? summarizeRepairLoopTimeline(auditTimeline ?? []);

  if (opts.json) {
    const payload: Record<string, unknown> = {
      run,
      artifacts,
      ...(auditTimeline ? { auditTimeline } : {}),
      ...(repairLoop ? { repairLoop } : {}),
      ...(costSummary ? { costSummary } : {}),
    };
    if (opts.steps !== false) payload.steps = steps;
    console.log(JSON.stringify(payload, null, 2));
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
        for (const check of failure.failedChecks.slice(0, 3)) {
          console.log(
            `     - ${check.name ?? "check"}${check.file ? ` [${check.file}]` : ""}${check.message ? `: ${check.message}` : ""}`
          );
        }
      });
    }
  }

  if (opts.steps !== false && steps.length > 0) {
    console.log(`\nSteps (${steps.length}):`);
    for (const step of steps) {
      const duration = step.durationMs ? ` (${step.durationMs}ms)` : "";
      console.log(`  ${step.stepName.padEnd(20)} ${step.status.padEnd(12)}${duration}`);
      if (step.error) {
        console.log(`    Error: [${step.error.code}] ${step.error.message}`);
      }
    }
  }

  if (artifacts.length > 0) {
    console.log(`\nArtifacts (${artifacts.length}):`);
    for (const a of artifacts) {
      console.log(`  ${a.stepName}/${a.name} (${a.mimeType}, ${a.sizeBytes} bytes)`);
    }
  }

  if (costSummary) {
    console.log(`\nCost Summary:`);
    console.log(`  Total Tokens: ${costSummary.totalTokens}`);
    console.log(`  Total Cost:   $${costSummary.totalCostUsd.toFixed(6)}`);
    if (costSummary.byStep.length > 0) {
      console.log("  By Step:");
      for (const item of costSummary.byStep) {
        console.log(`    - ${item.stepName}: ${item.tokens} tokens, $${item.costUsd.toFixed(6)}`);
      }
    }
    if (costSummary.byModel.length > 0) {
      console.log("  By Model:");
      for (const item of costSummary.byModel) {
        console.log(`    - ${item.model}: ${item.tokens} tokens, $${item.costUsd.toFixed(6)}`);
      }
    }
  }
}

export function createRunsCommand(): Command {
  const runs = new Command("runs").description("Query persisted run records");

  runs
    .command("list")
    .description("List persisted runs")
    .option("--status <status>", "Filter by status (running|completed|failed|suspended)")
    .option("--workflow <name>", "Filter by workflow name")
    .option("--repair-loop <mode>", "Filter by repair-loop state (with|without|stalled|exhausted)")
    .option("--sort <field>", "Sort by startedAt|validationFailed|repairStarted", "startedAt")
    .option("--order <dir>", "Sort order asc|desc", "desc")
    .option("--limit <n>", "Max results", "20")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const runtime = await createRuntime();
      const runRecords = await listRunsForCli(runtime, {
        status: opts.status,
        workflow: opts.workflow,
        repairLoop: opts.repairLoop,
        sortBy: opts.sort,
        order: opts.order,
        limit: Number(opts.limit),
      });

      if (opts.json) {
        console.log(JSON.stringify(runRecords, null, 2));
        return;
      }

      if (runRecords.length === 0) {
        console.log("No runs found.");
        return;
      }

      console.log(
        `${"ID".padEnd(38)} ${"Workflow".padEnd(20)} ${"Status".padEnd(12)} ${"Loop State".padEnd(12)} ${"Repair Loop".padEnd(40)} Started At`
      );
      console.log("-".repeat(145));
      for (const run of runRecords) {
        const repairLoop = extractPersistedRepairLoopSummary(run);
        const repairState = getCliRepairLoopState(repairLoop);
        const repairSummary = formatRepairLoopListSummary(repairLoop);
        console.log(
          `${run.id.padEnd(38)} ${(run.workflowName ?? "-").padEnd(20)} ${(run.status ?? "-").padEnd(12)} ${repairState.padEnd(12)} ${repairSummary.padEnd(40)} ${run.startedAt ?? "-"}`
        );
      }
      console.log(`\n${runRecords.length} run(s)`);
    });

  runs
    .command("inspect <runId>")
    .description("Inspect a run with step details")
    .option("--json", "Output as JSON")
    .option("--cost", "Include detailed cost summary")
    .action(async (runId: string, opts) => {
      const runtime = await createRuntime();
      await inspectPersistedRun(runtime, runId, { json: opts.json, cost: opts.cost, steps: true });
    });

  return runs;
}
