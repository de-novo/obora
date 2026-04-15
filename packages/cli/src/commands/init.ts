import { access, copyFile, cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

const PROVIDER_AUTH_ENV_KEY_MAP: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  google: "GOOGLE_API_KEY",
  groq: "GROQ_API_KEY",
  huggingface: "HUGGINGFACE_API_KEY",
  "github-copilot": "GITHUB_COPILOT_API_KEY",
  "kimi-coding": "KIMI_CODING_API_KEY",
  mistral: "MISTRAL_API_KEY",
  minimax: "MINIMAX_API_KEY",
  "minimax-cn": "MINIMAX_CN_API_KEY",
  opencode: "OPENCODE_API_KEY",
  openai: "OPENAI_API_KEY",
  "openai-codex": "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  xai: "XAI_API_KEY",
  zai: "ZAI_API_KEY",
  "vercel-ai-gateway": "VERCEL_AI_GATEWAY_API_KEY",
};

function resolveTemplatePath(templateName: string): string {
  const commandDir = dirname(fileURLToPath(import.meta.url));
  return resolve(commandDir, "../../templates", templateName);
}

function inferAuthEnvKey(provider: string): string {
  return (
    PROVIDER_AUTH_ENV_KEY_MAP[provider] ??
    `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`
  );
}

async function detectQuickstartProvider(targetDir: string): Promise<string | null> {
  try {
    const configRaw = await readFile(join(targetDir, ".obora", "config.yaml"), "utf-8");
    const match = configRaw.match(/^\s*provider:\s*([^\s#]+)\s*$/m);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function runInit(
  projectNameOrOptions: string | Record<string, unknown>,
  maybeOptions?: Record<string, unknown>
): Promise<void> {
  const projectName = typeof projectNameOrOptions === "string" ? projectNameOrOptions : ".";
  const options =
    (typeof projectNameOrOptions === "string" ? maybeOptions : projectNameOrOptions) ?? {};

  const templateName = options.quickstart ? "quickstart" : String(options.template ?? "default");
  const templatePath = resolveTemplatePath(templateName);
  const targetDir = resolve(process.cwd(), projectName);

  try {
    await mkdir(targetDir, { recursive: true });
    await cp(templatePath, targetDir, { recursive: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CLIError(`Failed to initialize scaffold: ${message}`, ExitCode.EXECUTION_FAILED);
  }

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

    if (templateName === "quickstart") {
      const relativeTarget = projectName === "." ? "." : projectName;
      const quickstartProvider = await detectQuickstartProvider(targetDir);
      formatter.info("Next steps:");
      if (relativeTarget !== ".") {
        formatter.step(`cd ${relativeTarget}`);
      }
      if (quickstartProvider) {
        formatter.step(`This template defaults to ${quickstartProvider}`);
        formatter.step(`export ${inferAuthEnvKey(quickstartProvider)}=***`);
      }
      formatter.step("obora doctor");
      formatter.step("obora judge --dry-run");
      formatter.step("obora judge");
    }
  }
}

export function createInitCommand(): Command {
  return new Command("init")
    .description("Initialize a new Obora project")
    .argument("[project-name]", "Project directory name", ".")
    .option("--template <name>", "Project template", "default")
    .option("--quickstart", "Initialize a quickstart judge-mode scaffold")
    .option("--json", "Output as JSON")
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
