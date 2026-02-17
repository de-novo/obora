import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { ExitCode } from "../utils/exit-codes.js";

async function handleStub(fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    process.exitCode = ExitCode.SUCCESS;
  } catch (err: unknown) {
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
        console.log(`[stub] obora audit replay ${executionId}`, options);
      });
    });

  return cmd;
}
