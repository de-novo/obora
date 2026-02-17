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
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(async () => {
        const message = "audit query is not yet connected to an audit store.";
        if (globalOpts.json) {
          formatter.json({ command: "audit query", options, connected: false, message });
        } else if (!globalOpts.quiet) {
          formatter.warn(message);
        }
      }, { verbose: Boolean(globalOpts.verbose) });
    });

  cmd
    .command("tail")
    .description("Stream audit events in real-time")
    .option("--execution <id>", "Filter by execution ID")
    .action(async function (this: Command, options) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(async () => {
        const message = "audit tail is not yet connected to an audit store.";
        if (globalOpts.json) {
          formatter.json({ command: "audit tail", options, connected: false, message });
        } else if (!globalOpts.quiet) {
          formatter.warn(message);
        }
      }, { verbose: Boolean(globalOpts.verbose) });
    });

  cmd
    .command("replay <executionId>")
    .description("Replay an execution")
    .option("--mode <mode>", "full or from_checkpoint", "full")
    .option("--checkpoint <step>", "Checkpoint step name")
    .option("--dry-run", "Simulate without executing")
    .action(async function (this: Command, executionId, options) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(async () => {
        const runtime = new OboraRuntime();
        const result = await runtime.replay(executionId, {
          mode: options.mode ?? "full",
          startFromStep: options.checkpoint,
          dryRun: options.dryRun ?? true,
          detectNonDeterminism: true,
        });

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
      }, { verbose: Boolean(globalOpts.verbose) });
    });

  return cmd;
}
