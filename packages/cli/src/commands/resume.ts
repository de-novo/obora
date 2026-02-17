/**
 * M6-02: `obora resume <runId>` CLI command
 *
 * Resumes a failed/suspended run from the last checkpoint.
 */

import { Command, Option } from "commander";

export function createResumeCommand(): Command {
  return new Command("resume")
    .description("Resume a failed or suspended run from its last checkpoint")
    .argument("<runId>", "Run ID to resume")
    .option("--from-step <stepName>", "Resume from a specific step (default: last failed)")
    .addOption(
      new Option("--drift-policy <policy>", "How to handle policy drift")
        .choices(["reject", "warn", "ignore"])
        .default("warn"),
    )
    .option("--json", "Output as JSON")
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
          ...(persistence?.custom
            ? { custom: persistence.custom as { instance: import("@obora/runtime").StorageAdapter } }
            : {}),
        },
      });

      try {
        const result = await runtime.resume(runId, {
          fromStep: opts.fromStep,
          driftPolicy: opts.driftPolicy as "reject" | "warn" | "ignore",
        });

        if (opts.json) {
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        console.log(`\n✅ Run resumed: ${result.execution.id}`);
        console.log(`  Status: ${result.execution.status}`);
        console.log(`  Restored steps: ${result.restoredSteps.join(", ") || "(none)"}`);
        console.log(`  Re-run steps: ${result.rerunSteps.join(", ") || "(none)"}`);
        if (result.driftDetected) {
          console.log(`  ⚠️  Policy drift detected (action: ${opts.driftPolicy})`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`\n❌ Resume failed: ${message}`);
        process.exit(1);
      }
    });
}
