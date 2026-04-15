import { Command } from "commander";

import { handleCommandAction } from "../utils/error-handler.js";
import { getGlobalOpts } from "../utils/global-opts.js";

import { applyRunExecutionOptions, normalizeRunExecutionOptions, runRun } from "./run.js";

export function createJudgeCommand(): Command {
  return applyRunExecutionOptions(
    new Command("judge")
      .description("Run a judge-mode workflow (defaults to judge.yaml)")
      .argument("[workflow]", "Judge workflow path", "judge.yaml")
  ).action(async function (this: Command, workflow, options) {
    const globalOpts = getGlobalOpts(this);
    await handleCommandAction(
      async () => {
        const mergedOptions = normalizeRunExecutionOptions(globalOpts, options);
        await runRun(workflow, mergedOptions);
      },
      { verbose: Boolean(globalOpts.verbose || options.verbose) }
    );
  });
}
