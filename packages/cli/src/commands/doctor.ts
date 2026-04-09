import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  buildResolutionSummary,
  detectLLMConfigFromEnv,
  formatResolutionSummary,
  loadConfig,
  resolveLLMConfig,
} from "@obora/sdk";
import { Command } from "commander";

import { handleCommandAction } from "../utils/error-handler.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

interface DoctorOptions {
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}

interface DoctorChecks {
  node: boolean;
  projectConfigPath: string;
  projectConfig: boolean;
  globalConfigPath: string;
  globalConfig: boolean;
}

const AUTH_ENV_EXAMPLES = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "ZAI_API_KEY",
] as const;

function buildAuthExampleHint(summary: { authSource: string }): string | null {
  if (summary.authSource !== "none") {
    return null;
  }

  return `Examples: export ${AUTH_ENV_EXAMPLES[0]}=***  |  export ${AUTH_ENV_EXAMPLES[1]}=***  |  export ${AUTH_ENV_EXAMPLES[2]}=***`;
}

function buildDoctorChecks(): DoctorChecks {
  const projectConfigPath = join(process.cwd(), ".obora", "config.yaml");
  const globalConfigPath = join(homedir(), ".obora", "config.yaml");

  return {
    node: true,
    projectConfigPath,
    projectConfig: existsSync(projectConfigPath),
    globalConfigPath,
    globalConfig: existsSync(globalConfigPath),
  };
}

function buildDoctorStatus(summary: {
  provider: string | null;
  model: string | null;
  authSource: string;
  configSource: string;
  fallbackStub: boolean;
}): { status: "ready" | "needs_config" | "stub_mode"; message: string } {
  if (!summary.fallbackStub && summary.provider && summary.model) {
    return {
      status: "ready",
      message: `Ready: ${summary.provider}/${summary.model}`,
    };
  }

  if (summary.authSource === "none") {
    return {
      status: "needs_config",
      message: "Needs auth: no provider credential detected",
    };
  }

  return {
    status: "stub_mode",
    message: "Stub mode: provider/model is not fully resolved yet",
  };
}

function buildDoctorRecommendations(checks: DoctorChecks, summary: {
  authSource: string;
  configSource: string;
  fallbackStub: boolean;
  warnings: string[];
}): string[] {
  const recommendations: string[] = [];

  if (!checks.projectConfig) {
    recommendations.push(`Run: obora init --quickstart  # creates ${checks.projectConfigPath}`);
  }

  if (summary.authSource === "none") {
    recommendations.push("Set one provider API key, then rerun: obora doctor");
    const authExampleHint = buildAuthExampleHint(summary);
    if (authExampleHint) {
      recommendations.push(authExampleHint);
    }
  }

  if (summary.configSource === "none") {
    recommendations.push("Add provider/model defaults in .obora/config.yaml");
  }

  if (summary.fallbackStub) {
    recommendations.push("Preview before execution: obora run judge.yaml --dry-run");
  }

  if (recommendations.length === 0 && summary.warnings.length === 0) {
    recommendations.push("Run your workflow: obora run judge.yaml");
  }

  return recommendations;
}

export async function runDoctor(options: DoctorOptions): Promise<void> {
  const checks = buildDoctorChecks();
  const loadedConfig = await loadConfig();
  const envLLM = detectLLMConfigFromEnv();
  const resolvedLLM = resolveLLMConfig(envLLM, loadedConfig);
  const summary = buildResolutionSummary({}, resolvedLLM, loadedConfig);
  const status = buildDoctorStatus(summary);
  const recommendations = buildDoctorRecommendations(checks, summary);

  if (options.json) {
    formatter.json({
      checks: {
        node: checks.node,
        projectConfig: checks.projectConfig,
        projectConfigPath: checks.projectConfigPath,
        globalConfig: checks.globalConfig,
        globalConfigPath: checks.globalConfigPath,
      },
      status,
      recommendations,
      resolution: summary,
    });
    return;
  }

  if (options.quiet) {
    return;
  }

  formatter.info("Obora doctor");
  formatter.step(`Status: ${status.message}`);
  formatter.step(`Node.js: ${checks.node ? "available" : "missing"}`);
  formatter.step(
    `Project config (.obora/config.yaml): ${checks.projectConfig ? "found" : "missing"}`,
  );
  formatter.step(
    `Global config (~/.obora/config.yaml): ${checks.globalConfig ? "found" : "missing"}`,
  );
  formatter.step(`Auth source: ${summary.authSource}`);
  formatter.step(`Config source: ${summary.configSource}`);
  formatter.step(`Fallback/stub: ${summary.fallbackStub ? "enabled" : "disabled"}`);

  formatter.info(formatResolutionSummary(summary));

  for (const warning of summary.warnings) {
    formatter.warn(warning);
  }

  formatter.info("Recommended next actions:");
  for (const recommendation of recommendations) {
    formatter.step(recommendation);
  }

  formatter.info(`Next step: ${summary.nextPlaceToEdit}`);
}

export function createDoctorCommand(): Command {
  return new Command("doctor")
    .description("Diagnose local Obora setup and onboarding readiness")
    .action(async function (this: Command) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          await runDoctor(globalOpts);
        },
        { verbose: Boolean(globalOpts.verbose) },
      );
    });
}
