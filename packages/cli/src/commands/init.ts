import { access, copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
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

export async function runInit(
  projectNameOrOptions: string | Record<string, unknown>,
  maybeOptions?: Record<string, unknown>
): Promise<void> {
  const projectName = typeof projectNameOrOptions === "string" ? projectNameOrOptions : ".";
  const options =
    (typeof projectNameOrOptions === "string" ? maybeOptions : projectNameOrOptions) ?? {};

  const templateName = String(options.template ?? "default");
  const templatePath = resolveTemplatePath(templateName);
  const targetDir = resolve(process.cwd(), projectName);

  await mkdir(targetDir, { recursive: true });
  await cp(templatePath, targetDir, { recursive: true });

  // Backward-compatible scaffold layout expected by existing tests and docs
  const workflowsDir = join(targetDir, "workflows");
  const policiesDir = join(targetDir, "policies");
  await mkdir(workflowsDir, { recursive: true });
  await mkdir(policiesDir, { recursive: true });
  await mkdir(join(targetDir, "tests"), { recursive: true });

  const workflowSource = join(targetDir, "workflow.yaml");
  const workflowTarget = join(workflowsDir, "example.yaml");
  try {
    await access(workflowTarget);
  } catch {
    try {
      await copyFile(workflowSource, workflowTarget);
    } catch {
      // best effort
    }
  }

  const policySource = join(targetDir, "policy.yaml");
  const policyTarget = join(policiesDir, "default.yaml");
  try {
    await access(policyTarget);
  } catch {
    try {
      await copyFile(policySource, policyTarget);
    } catch {
      // best effort
    }
  }

  const configPath = join(targetDir, "obora.config.yaml");
  try {
    const configRaw = await readFile(configPath, "utf-8");
    const normalized = configRaw
      .replace(/^workflows:\s*\.\s*$/m, "workflows: ./workflows")
      .replace(/^policies:\s*\.\s*$/m, "policies: ./policies");
    if (normalized !== configRaw) {
      await writeFile(configPath, normalized, "utf-8");
    }
  } catch {
    // best effort
  }

  if (options.json) {
    formatter.json({ initialized: true, path: targetDir, template: templateName });
  } else if (!options.quiet) {
    formatter.success(`Obora project initialized. Path: ${targetDir}`);
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
      await handleCommandAction(
        async () => {
          await runInit(projectName, mergedOptions);
        },
        { verbose: Boolean(mergedOptions.verbose) }
      );
    });
}
