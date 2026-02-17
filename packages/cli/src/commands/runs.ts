/**
 * M6-01: CLI commands for run persistence queries
 *
 * `obora runs list` — List persisted runs
 * `obora runs inspect <runId>` — Show run details with steps
 */

import { Command } from "commander";

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
      const { SQLiteStorageAdapter } = await import("@obora/runtime");
      const { loadConfig } = await import("@obora/sdk");

      const config = await loadConfig();
      const dbPath = (config as Record<string, unknown>)?.persistence
        ? ((config as Record<string, Record<string, Record<string, string>>>).persistence?.sqlite?.path ?? "./data/obora.db")
        : "./data/obora.db";

      const adapter = new SQLiteStorageAdapter({ path: dbPath });
      try {
        const runs = await adapter.listRuns({
          status: opts.status,
          workflowName: opts.workflow,
          limit: Number(opts.limit),
        });

        if (opts.json) {
          console.log(JSON.stringify(runs, null, 2));
          return;
        }

        if (runs.length === 0) {
          console.log("No runs found.");
          return;
        }

        console.log(`${"ID".padEnd(38)} ${"Workflow".padEnd(20)} ${"Status".padEnd(12)} Started At`);
        console.log("-".repeat(90));
        for (const run of runs) {
          console.log(
            `${run.id.padEnd(38)} ${run.workflowName.padEnd(20)} ${run.status.padEnd(12)} ${run.startedAt}`
          );
        }
        console.log(`\n${runs.length} run(s)`);
      } finally {
        adapter.close();
      }
    });

  runs
    .command("inspect <runId>")
    .description("Inspect a run with step details")
    .option("--json", "Output as JSON")
    .action(async (runId: string, opts) => {
      const { SQLiteStorageAdapter } = await import("@obora/runtime");
      const { loadConfig } = await import("@obora/sdk");

      const config = await loadConfig();
      const dbPath = (config as Record<string, unknown>)?.persistence
        ? ((config as Record<string, Record<string, Record<string, string>>>).persistence?.sqlite?.path ?? "./data/obora.db")
        : "./data/obora.db";

      const adapter = new SQLiteStorageAdapter({ path: dbPath });
      try {
        const run = await adapter.getRun(runId);
        if (!run) {
          console.error(`Run not found: ${runId}`);
          process.exit(1);
        }

        const steps = await adapter.getSteps(runId);
        const artifacts = await adapter.getArtifacts(runId);

        if (opts.json) {
          console.log(JSON.stringify({ run, steps, artifacts }, null, 2));
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
      } finally {
        adapter.close();
      }
    });

  return runs;
}
