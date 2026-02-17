import { Command } from "commander";

import { OboraError, OboraRuntime } from "@obora/sdk";

import { CLIError } from "../utils/cli-error.js";
import { ExitCode } from "../utils/exit-codes.js";

async function handleStub(fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    process.exitCode = ExitCode.SUCCESS;
  } catch (err: unknown) {
    if (err instanceof OboraError) {
      const cliError = CLIError.fromOboraError(err);
      console.error(cliError.message);
      process.exitCode = cliError.exitCode;
      return;
    }

    if (err instanceof CLIError) {
      console.error(err.message);
      process.exitCode = err.exitCode;
    } else {
      console.error("Unexpected error:", err);
      process.exitCode = ExitCode.CLI_ERROR;
    }
  }
}

export function createAuditCommand(): Command {
  const cmd = new Command("audit").description("Query and manage audit trail");

  cmd
    .command("query")
    .description("Query audit events")
    .option("--execution <id>", "Filter by execution ID")
    .option("--type <type>", "Filter by event type")
    .option("--limit <n>", "Max results", parseInt)
    .action(async (options) => {
      await handleStub(async () => {
        console.log("[stub] obora audit query", options);
      });
    });

  cmd
    .command("tail")
    .description("Stream audit events in real-time")
    .option("--execution <id>", "Filter by execution ID")
    .action(async (options) => {
      await handleStub(async () => {
        console.log("[stub] obora audit tail", options);
      });
    });

  cmd
    .command("replay <executionId>")
    .description("Replay an execution")
    .option("--mode <mode>", "full or from_checkpoint", "full")
    .option("--checkpoint <step>", "Checkpoint step name")
    .option("--dry-run", "Simulate without executing")
    .action(async (executionId, options) => {
      await handleStub(async () => {
        const runtime = new OboraRuntime();
        const result = await runtime.replay(executionId, {
          mode: options.mode ?? "full",
          startFromStep: options.checkpoint,
          dryRun: options.dryRun ?? true,
          detectNonDeterminism: true,
        });

        console.log(`✅ Replay complete. Success: ${result.success}`);
        console.log(`   Steps rerun: ${result.stepResults.length}`);
        console.log(
          `   Diff: ${result.diffReport.summary.changed} changed, ${result.diffReport.summary.unchanged} unchanged`,
        );
      });
    });

  return cmd;
}
