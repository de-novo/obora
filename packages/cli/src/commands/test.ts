import { Command } from "commander";

import { handleCommandAction } from "../utils/error-handler.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

export function createTestCommand(): Command {
  return new Command("test")
    .description("Run workflow tests")
    .argument("[target]", "Workflow or test suite path")
    .option("--fixture <path>", "YAML fixture file")
    .option("--filter <pattern>", "Filter test cases by name")
    .action(async function (this: Command, target, options) {
      await handleCommandAction(async () => {
        const globalOpts = getGlobalOpts(this);
        if (globalOpts.json) {
          formatter.json({
            command: "test",
            target: target ?? "all",
            options,
            stub: true,
          });
          return;
        }

        if (!globalOpts.quiet) {
          formatter.info(`[stub] obora test ${target ?? "all"}`);
        }
      });
    });
}
