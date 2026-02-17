import { Command } from "commander";

export function createAuditCommand(): Command {
  const cmd = new Command("audit").description("Query and manage audit trail");
  cmd
    .command("query")
    .description("Query audit events")
    .option("--execution <id>", "Filter by execution ID")
    .option("--type <type>", "Filter by event type")
    .option("--limit <n>", "Max results", parseInt)
    .action(async (options) => {
      console.log("[stub] obora audit query", options);
    });
  cmd
    .command("tail")
    .description("Stream audit events in real-time")
    .option("--execution <id>", "Filter by execution ID")
    .action(async (options) => {
      console.log("[stub] obora audit tail", options);
    });
  cmd
    .command("replay <executionId>")
    .description("Replay an execution")
    .option("--mode <mode>", "full or from_checkpoint", "full")
    .option("--checkpoint <step>", "Checkpoint step name")
    .option("--dry-run", "Simulate without executing")
    .action(async (executionId, options) => {
      console.log(`[stub] obora audit replay ${executionId}`, options);
    });
  return cmd;
}
