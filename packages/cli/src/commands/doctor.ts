import {
  buildResolutionSummary,
  detectLLMConfigFromEnv,
  loadConfig,
  resolveLLMConfig,
} from "@obora/sdk";
import { Command } from "commander";

import { handleCommandAction } from "../utils/error-handler.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

import {
  buildAuthDiagnostics,
  buildConfigDiagnostics,
  buildDoctorActions,
  buildDoctorChecks,
  buildDoctorDiagnosticsBundle,
  buildDoctorGuidance,
  buildDoctorOutputSections,
  buildDoctorOverview,
  buildDoctorRecommendations,
  buildDoctorStatus,
  buildRecommendedProviderHint,
  printResolutionSection,
  type DoctorOptions,
} from "./doctor-shared.js";

export async function runDoctor(options: DoctorOptions): Promise<void> {
  const checks = buildDoctorChecks();
  const loadedConfig = await loadConfig();
  const envLLM = detectLLMConfigFromEnv();
  const resolvedLLM = resolveLLMConfig(envLLM, loadedConfig);
  const summary = buildResolutionSummary({}, resolvedLLM, loadedConfig);
  const status = buildDoctorStatus(summary);
  const providerHint = buildRecommendedProviderHint(summary, loadedConfig);
  const authDiagnostics = buildAuthDiagnostics(providerHint, summary);
  const configDiagnostics = buildConfigDiagnostics(checks, summary);
  const recommendations = buildDoctorRecommendations(
    checks,
    summary,
    providerHint,
    authDiagnostics
  );
  const actions = buildDoctorActions(checks, summary, providerHint, authDiagnostics);
  const sections = buildDoctorOutputSections(
    checks,
    status,
    summary,
    loadedConfig,
    configDiagnostics,
    authDiagnostics,
    recommendations
  );
  const overview = buildDoctorOverview(status, loadedConfig, summary, authDiagnostics);
  const diagnostics = buildDoctorDiagnosticsBundle(
    checks,
    authDiagnostics,
    configDiagnostics,
    summary
  );
  const guidance = buildDoctorGuidance(recommendations, actions);

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
      actions,
      overview,
      diagnostics,
      guidance,
      resolution: summary,
      auth: authDiagnostics,
      config: configDiagnostics,
      sections,
      recommendedProvider: providerHint.recommendedProvider,
      recommendedAuthEnvKey: providerHint.recommendedAuthEnvKey,
    });
    return;
  }

  if (options.quiet) {
    return;
  }

  formatter.info("Obora doctor");

  formatter.info(sections.status.heading);
  formatter.step(sections.status.message);

  formatter.info(sections.configuration.heading);
  formatter.step(`Node.js: ${sections.configuration.node ? "available" : "missing"}`);
  formatter.step(
    `Project config (.obora/config.yaml): ${sections.configuration.projectConfig ? "found" : "missing"}`
  );
  formatter.step(
    `Global config (~/.obora/config.yaml): ${sections.configuration.globalConfig ? "found" : "missing"}`
  );
  if (sections.configuration.configuredProvider) {
    formatter.step(`Configured provider: ${sections.configuration.configuredProvider}`);
  }
  if (sections.configuration.configuredModel) {
    formatter.step(`Configured model: ${sections.configuration.configuredModel}`);
  }
  formatter.step(`Auth source: ${sections.configuration.authSource}`);
  formatter.step(`Config source: ${sections.configuration.configSource}`);
  if (sections.configuration.mergedSources) {
    formatter.step(`Merged sources: ${sections.configuration.mergedSources}`);
  }
  if (sections.configuration.activeConfigPath) {
    formatter.step(`Active config: ${sections.configuration.activeConfigPath}`);
  }

  printResolutionSection(summary);

  if (sections.warnings.items.length > 0) {
    formatter.info(sections.warnings.heading);
  }
  for (const warning of sections.warnings.items) {
    formatter.warn(warning);
  }

  formatter.info(sections.recommendedNextActions.heading);
  for (const recommendation of sections.recommendedNextActions.items) {
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
        { verbose: Boolean(globalOpts.verbose) }
      );
    });
}
