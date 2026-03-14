import { readFile } from "node:fs/promises";

import { Workflow } from "@obora/sdk";
import { Command } from "commander";
import yaml from "yaml";

import { handleCommandAction } from "../utils/error-handler.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

function isJsonOutput(options: Record<string, unknown>): boolean {
  return Boolean(options.json);
}

function isQuietOutput(options: Record<string, unknown>): boolean {
  return Boolean(options.quiet);
}

export async function runExpand(path: string, options: Record<string, unknown>): Promise<void> {
  const raw = await readFile(path, "utf-8");
  const parsed = yaml.parse(raw);
  const expandedWorkflow = await Workflow.fromYaml(path);
  const stopSemantics = Workflow.getStopSemantics(parsed);

  if (isJsonOutput(options)) {
    formatter.json({
      source: path,
      workflow: expandedWorkflow.name,
      expandedWorkflow,
      stopSemantics,
    });
    return;
  }

  if (!isQuietOutput(options)) {
    formatter.info(`Expanded workflow: ${expandedWorkflow.name}`);
    formatter.json(expandedWorkflow);
    if (stopSemantics) {
      formatter.info("Stop semantics:");
      formatter.json(stopSemantics);
    }
  }
}

export function createExpandCommand(): Command {
  return new Command("expand")
    .description("Expand a one-file YAML workflow into its internal workflow graph")
    .argument("<file>", "Path to one-file YAML workflow")
    .action(async (file: string, _arg1: unknown, cmd: Command) => {
      await handleCommandAction(async () => {
        const options = { ...getGlobalOpts(cmd), ...cmd.opts() } as Record<string, unknown>;
        await runExpand(file, options);
      });
    });
}
