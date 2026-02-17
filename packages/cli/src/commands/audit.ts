import { Command } from "commander";

import { OboraRuntime } from "@obora/sdk";

import { handleCommandAction } from "../utils/error-handler.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

export function createAuditCommand(): Command {
  const cmd = new Command("audit").description("Query and manage audit trail");

  cmd
    .command("query")
    .description("Query audit events")
    .option("--execution <id>", "Filter by execution ID")
    .option("--type <type>", "Filter by event type")
    .option("--limit <n>", "Max results", parseInt)
    .action(async function (this: Command, options) {
      await handleCommandAction(async () => {
        const globalOpts = getGlobalOpts(this);
        if (globalOpts.json) {
          formatter.json({ command: "audit query", options, stub: true });
        } else if (!globalOpts.quiet) {
          formatter.info(`[stub] obora audit query ${JSON.stringify(options)}`);
        }
      });
    });

  cmd
    .command("tail")
    .description("Stream audit events in real-time")
    .option("--execution <id>", "Filter by execution ID")
    .action(async function (this: Command, options) {
      await handleCommandAction(async () => {
        const globalOpts = getGlobalOpts(this);
        if (globalOpts.json) {
          formatter.json({ command: "audit tail", options, stub: true });
        } else if (!globalOpts.quiet) {
          formatter.info(`[stub] obora audit tail ${JSON.stringify(options)}`);
        }
      });
    });

  cmd
    .command("replay <executionId>")
    .description("Replay an execution")
    .option("--mode <mode>", "full or from_checkpoint", "full")
    .option("--checkpoint <step>", "Checkpoint step name")
    .option("--dry-run", "Simulate without executing")
    .action(async function (this: Command, executionId, options) {
      await handleCommandAction(async () => {
        const runtime = new OboraRuntime();
        const result = await runtime.replay(executionId, {
          mode: options.mode ?? "full",
          startFromStep: options.checkpoint,
          dryRun: options.dryRun ?? true,
          detectNonDeterminism: true,
        });

        const globalOpts = getGlobalOpts(this);
        if (globalOpts.json) {
          formatter.json({
            executionId,
            success: result.success,
            stepsRerun: result.stepResults.length,
            diff: result.diffReport.summary,
          });
          return;
        }

        if (!globalOpts.quiet) {
          formatter.success(`Replay complete. Success: ${result.success}`);
          formatter.info(`Steps rerun: ${result.stepResults.length}`);
          formatter.info(
            `Diff: ${result.diffReport.summary.changed} changed, ${result.diffReport.summary.unchanged} unchanged`,
          );
        }
      });
    });

  return cmd;
}
