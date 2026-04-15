import { Command } from "commander";

import { handleCommandAction } from "../utils/error-handler.js";
import { getGlobalOpts } from "../utils/global-opts.js";

import { runInit } from "./init.js";

export function createQuickstartCommand(): Command {
  return new Command("quickstart")
    .description("Create a minimal quickstart judge-mode project")
    .argument("[project-name]", "Project directory name", ".")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, projectName, options: { json?: boolean } = {}) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          await runInit(projectName, {
            ...globalOpts,
            json: Boolean(options.json || globalOpts.json),
            quickstart: true,
          });
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });
}
