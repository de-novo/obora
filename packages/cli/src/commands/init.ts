import { cp, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

import { handleCommandAction } from "../utils/error-handler.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

function resolveTemplatePath(templateName: string): string {
  const commandDir = dirname(fileURLToPath(import.meta.url));
  return resolve(commandDir, "../../templates", templateName);
}

export async function runInit(projectName: string, options: Record<string, unknown>): Promise<void> {
  const templateName = String(options.template ?? "default");
  const templatePath = resolveTemplatePath(templateName);
  const targetDir = resolve(process.cwd(), projectName);

  await mkdir(targetDir, { recursive: true });
  await cp(templatePath, targetDir, { recursive: true });

  if (options.json) {
    formatter.json({ initialized: true, path: targetDir, template: templateName });
  } else if (!options.quiet) {
    formatter.success(`Obora project initialized at ${targetDir}`);
  }
}

export function createInitCommand(): Command {
  return new Command("init")
    .description("Initialize a new Obora project")
    .argument("[project-name]", "Project directory name", ".")
    .option("--template <name>", "Project template", "default")
    .option("-y, --yes", "Skip prompts, use defaults")
    .action(async function (this: Command, projectName, options) {
      const mergedOptions = { ...getGlobalOpts(this), ...options };
      await handleCommandAction(async () => {
        await runInit(projectName, mergedOptions);
      }, { verbose: Boolean(mergedOptions.verbose) });
    });
}
