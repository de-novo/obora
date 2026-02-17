import { Command } from "commander";

import { createRunCommand } from "./commands/run.js";
import { createTestCommand } from "./commands/test.js";
import { createPluginCommand } from "./commands/plugin.js";
import { createAuditCommand } from "./commands/audit.js";
import { createPolicyCommand } from "./commands/policy.js";
import { createInitCommand } from "./commands/init.js";
import { createRunsCommand } from "./commands/runs.js";

/**
 * Create top-level `obora inspect <runId>` alias.
 * Design spec: `obora inspect <runId>` (m6-production-memory-design § CLI).
 * Delegates to `obora runs inspect`.
 */
function createInspectCommand(): Command {
  return new Command("inspect")
    .description("Inspect a run (alias for 'runs inspect')")
    .argument("<runId>", "Run ID to inspect")
    .option("--json", "Output as JSON")
    .option("--no-steps", "Hide step details")
    .action(async (runId: string, opts) => {
      const { OboraRuntime, loadConfig } = await import("@obora/sdk");

      const config = await loadConfig();
      const persistence = (config as Record<string, unknown>).persistence as
        | { enabled?: boolean; adapter?: string; sqlite?: { path?: string }; custom?: unknown }
        | undefined;

      const runtime = new OboraRuntime({
        persistence: {
          enabled: persistence?.enabled ?? true,
          adapter: (persistence?.adapter as "sqlite" | "custom") ?? "sqlite",
          sqlite: { path: persistence?.sqlite?.path ?? "./data/obora.db" },
          ...(persistence?.custom ? { custom: persistence.custom as { instance: import("@obora/runtime").StorageAdapter } } : {}),
        },
      });

      const run = await runtime.getRunRecord(runId);
      if (!run) {
        console.error(`Run not found: ${runId}`);
        process.exit(1);
      }

      const steps = opts.steps !== false ? await runtime.getRunSteps(runId) : [];
      const artifacts = await runtime.getRunArtifacts(runId);

      if (opts.json) {
        const payload: Record<string, unknown> = { run, artifacts };
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
    });
}

export function createCLI(): Command {
  const program = new Command("obora")
    .description("Obora AI Control Runtime CLI")
    .version("0.1.0")
    .option("--json", "Output in JSON format")
    .option("-q, --quiet", "Suppress non-essential output")
    .option("--verbose", "Show detailed progress and diagnostics")
    .option("--no-color", "Disable ANSI colors in output");

  program.addCommand(createInitCommand());
  program.addCommand(createRunCommand());
  program.addCommand(createTestCommand());
  program.addCommand(createPluginCommand());
  program.addCommand(createAuditCommand());
  program.addCommand(createPolicyCommand());
  program.addCommand(createRunsCommand());
  program.addCommand(createInspectCommand());

  return program;
}
