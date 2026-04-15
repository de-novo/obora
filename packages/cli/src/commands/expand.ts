import { readFile } from "node:fs/promises";

import { Workflow } from "@obora/sdk";
import { Command } from "commander";
import yaml from "yaml";

import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts, type GlobalOptions } from "../utils/global-opts.js";

interface ExpandOptions {
  json?: boolean;
  quiet?: boolean;
}

function isJsonOutput(options: ExpandOptions): boolean {
  return Boolean(options.json);
}

function isQuietOutput(options: ExpandOptions): boolean {
  return Boolean(options.quiet);
}

function shouldOutputJson(localJson: boolean | undefined, globalOpts: GlobalOptions): boolean {
  return Boolean(localJson || globalOpts.json);
}

export async function runExpand(path: string, options: ExpandOptions): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT")) {
      throw new CLIError(`Expand source not found: ${path}`, ExitCode.VALIDATION_ERROR);
    }
    throw new CLIError(`Failed to read expand source: ${message}`, ExitCode.EXECUTION_FAILED);
  }

  let parsed: unknown;
  try {
    parsed = yaml.parse(raw);
  } catch {
    throw new CLIError(`Invalid expand YAML: ${path}`, ExitCode.VALIDATION_ERROR);
  }

  let expandedWorkflow;
  try {
    expandedWorkflow = await Workflow.fromYaml(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CLIError(`Failed to expand workflow: ${message}`, ExitCode.EXECUTION_FAILED);
  }

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
    .option("--json", "Output as JSON")
    .action(async function (this: Command, file: string, options: ExpandOptions = {}) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        () =>
          runExpand(file, {
            json: shouldOutputJson(options.json, globalOpts),
            quiet: globalOpts.quiet,
          }),
        { verbose: Boolean(globalOpts.verbose) }
      );
    });
}
