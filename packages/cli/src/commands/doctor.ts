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

function buildDoctorChecks() {
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

export async function runDoctor(options: DoctorOptions): Promise<void> {
  const checks = buildDoctorChecks();
  const loadedConfig = await loadConfig();
  const envLLM = detectLLMConfigFromEnv();
  const resolvedLLM = resolveLLMConfig(envLLM, loadedConfig);
  const summary = buildResolutionSummary({}, resolvedLLM, loadedConfig);

  if (options.json) {
    formatter.json({
      checks: {
        node: checks.node,
        projectConfig: checks.projectConfig,
        projectConfigPath: checks.projectConfigPath,
        globalConfig: checks.globalConfig,
        globalConfigPath: checks.globalConfigPath,
      },
      resolution: summary,
    });
    return;
  }

  if (options.quiet) {
    return;
  }

  formatter.info("Obora doctor");
  formatter.step(`Node.js: ${checks.node ? "available" : "missing"}`);
  formatter.step(
    `Project config (.obora/config.yaml): ${checks.projectConfig ? "found" : "missing"}`,
  );
  formatter.step(
    `Global config (~/.obora/config.yaml): ${checks.globalConfig ? "found" : "missing"}`,
  );

  formatter.info(formatResolutionSummary(summary));

  for (const warning of summary.warnings) {
    formatter.warn(warning);
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
