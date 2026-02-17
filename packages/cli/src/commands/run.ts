import { Command } from "commander";

export async function runRun(workflow: string, options: Record<string, unknown>): Promise<void> {
  console.log(`[stub] obora run ${workflow}`, options);
}

export function setAgentResolver(_resolver: any): void {
  // TODO: wire resolver lifecycle in SDK-backed runtime
}

export async function bootstrapAgentResolver(_cwd: string = process.cwd()): Promise<any> {
  // TODO: wire resolver bootstrap in SDK-backed runtime
  return null;
}

export function createRunCommand(): Command {
  return new Command("run")
    .description("Execute a workflow")
    .argument("<workflow>", "Workflow name or YAML path")
    .option("-i, --input <json>", "Input data as JSON string")
    .option("-v, --var <key=value...>", "Variables (repeatable)")
    .option("--policy <path>", "Policy file path")
    .option("--dry-run", "Validate without executing")
    .option("--timeout <ms>", "Execution timeout in milliseconds", parseInt)
    .action(async (workflow, options) => {
      // TODO: Wire to SDK OboraRuntime.run()
      await runRun(workflow, options);
      process.exit(0);
    });
}
