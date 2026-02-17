import { Command } from "commander";

export async function runInit(options: Record<string, unknown>): Promise<void> {
  console.log("[stub] obora init", options);
}

export function createInitCommand(): Command {
  return new Command("init")
    .description("Initialize a new Obora project")
    .option("--template <name>", "Project template", "default")
    .option("-y, --yes", "Skip prompts, use defaults")
    .action(async (options) => {
      await runInit(options);
    });
}
