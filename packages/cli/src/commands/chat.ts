import { Command } from "commander";

import { runChatSession } from "../chat/session.js";
import type { ChatCommandOptions } from "../chat/types.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

export function createChatCommand(): Command {
  return new Command("chat")
    .description("Start an interactive workflow chat TUI")
    .argument("[workflow]", "Workflow name or YAML path to run for chat messages")
    .option("--workflow <workflow>", "Workflow name or YAML path")
    .option("--scope <scope>", "Workflow scope to resolve (project, global, all)")
    .option("--project <path>", "Project root for scoped workflow discovery")
    .option("--global-workflows-dir <path>", "Global workflow directory override")
    .option("--session <id>", "Chat session id")
    .option("--once <message>", "Run one chat message and exit")
    .option("--dry-run", "Validate the selected workflow without live execution")
    .option("--provider <name>", "LLM provider override for workflow runs")
    .option("--model <name>", "LLM model override for workflow runs")
    .option("--config <path>", "obora config.yaml path")
    .option("--agents <path>", "agents.yaml path")
    .option("--policy <path>", "Policy file path")
    .option("--timeout <ms>", "Execution timeout in milliseconds")
    .option("--json", "Output final chat state as JSON")
    .action(async function (
      this: Command,
      workflow: string | undefined,
      options: ChatCommandOptions & { json?: boolean }
    ) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const finalState = await runChatSession({
            cwd: process.cwd(),
            input: process.stdin,
            output: process.stdout,
            commandOptions: {
              ...options,
              workflow: options.workflow ?? workflow,
            },
          });

          if (options.json || globalOpts.json) {
            formatter.json(finalState);
          }
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });
}
