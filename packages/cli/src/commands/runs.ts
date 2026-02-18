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

async function createRuntime() {
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
      ...(persistence?.custom ? { custom: persistence.custom as { instance: import("@obora/runtime").StorageAdapter } } : {}),
    },
  });
}

export function createRunsCommand(): Command {
  const runs = new Command("runs").description("Query persisted run records");

  runs
    .command("list")
    .description("List persisted runs")
    .option("--status <status>", "Filter by status (running|completed|failed|suspended)")
    .option("--workflow <name>", "Filter by workflow name")
    .option("--limit <n>", "Max results", "20")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      const runtime = await createRuntime();
      const runRecords = await runtime.listRunRecords({
        status: opts.status,
        workflowName: opts.workflow,
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

      console.log(`${"ID".padEnd(38)} ${"Workflow".padEnd(20)} ${"Status".padEnd(12)} Started At`);
      console.log("-".repeat(90));
      for (const run of runRecords) {
        console.log(
          `${run.id.padEnd(38)} ${run.workflowName.padEnd(20)} ${run.status.padEnd(12)} ${run.startedAt}`
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
      const run = await runtime.getRunRecord(runId);
      if (!run) {
        console.error(`Run not found: ${runId}`);
        process.exit(1);
      }

      const steps = await runtime.getRunSteps(runId);
      const artifacts = await runtime.getRunArtifacts(runId);
      const costSummary = opts.cost ? await runtime.getRunCostSummary(runId) : undefined;

      if (opts.json) {
        console.log(JSON.stringify({ run, steps, artifacts, ...(costSummary ? { costSummary } : {}) }, null, 2));
        return;
      }

      console.log(`\nRun: ${run.id}`);
      console.log(`  Workflow: ${run.workflowName}`);
      console.log(`  Status:   ${run.status}`);
      console.log(`  Started:  ${run.startedAt}`);
      if (run.completedAt) console.log(`  Completed: ${run.completedAt}`);
      if (run.metadata) console.log(`  Metadata: ${JSON.stringify(run.metadata)}`);

      if (steps.length > 0) {
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
    });

  return runs;
}
