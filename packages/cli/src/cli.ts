import { Command } from "commander";

import packageJson from "../package.json" with { type: "json" };

import { createArtifactCommand } from "./commands/artifact.js";
import { createAuditCommand } from "./commands/audit.js";
import { createAgentsCommand } from "./commands/agents.js";
import { createAuthCommand } from "./commands/auth.js";
import { createDlqCommand } from "./commands/dlq.js";
import { createDoctorCommand } from "./commands/doctor.js";
import { createExpandCommand } from "./commands/expand.js";
import { createInitCommand } from "./commands/init.js";
import { createJudgeCommand } from "./commands/judge.js";
import { createKnowledgeCommand } from "./commands/knowledge.js";
import { createModelsCommand } from "./commands/models.js";
import { createPluginCommand } from "./commands/plugin.js";
import { createPolicyCommand } from "./commands/policy.js";
import { createQuickstartCommand } from "./commands/quickstart.js";
import { createResumeCommand } from "./commands/resume.js";
import { createRunCommand } from "./commands/run.js";
import {
  createRunsCommand,
  createRuntime as createRunsRuntime,
  inspectPersistedRun,
} from "./commands/runs.js";
import { createStatusCommand } from "./commands/status.js";
import { createTestCommand } from "./commands/test.js";
import { createValidateCommand } from "./commands/validate.js";
import { handleCommandAction } from "./utils/error-handler.js";
import { getGlobalOpts } from "./utils/global-opts.js";

/**
 * Create top-level `obora inspect <runId>` alias.
 * Design spec: `obora inspect <runId>` (m6-production-memory-design § CLI).
 * Delegates to `obora runs inspect`.
 */
function createInspectCommand(): Command {
  return new Command("inspect")
    .description("Inspect a run (alias for 'runs inspect')")
    .argument("<runId>", "Run ID to inspect")
    .option("--json", "Output as JSON")
    .option("--no-steps", "Hide step details")
    .option("--cost", "Include detailed cost summary")
    .action(async function (
      this: Command,
      runId: string,
      opts: { json?: boolean; cost?: boolean; steps?: boolean }
    ) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const runtime = await createRunsRuntime();
          await inspectPersistedRun(runtime, runId, {
            json: Boolean(opts.json || globalOpts.json),
            cost: opts.cost,
            steps: opts.steps !== false,
          });
        },
        {
          verbose: Boolean(globalOpts.verbose),
        }
      );
    });
}

export function createCLI(): Command {
  const program = new Command("obora")
    .description("Obora AI Control Runtime CLI")
    .version(packageJson.version)
    .option("--json", "Output in JSON format")
    .option("-q, --quiet", "Suppress non-essential output")
    .option("--verbose", "Show detailed progress and diagnostics")
    .option("--no-color", "Disable ANSI colors in output");

  program.addCommand(createInitCommand());
  program.addCommand(createQuickstartCommand());
  program.addCommand(createJudgeCommand());
  program.addCommand(createModelsCommand());
  program.addCommand(createAgentsCommand());
  program.addCommand(createDoctorCommand());
  program.addCommand(createAuthCommand());
  program.addCommand(createExpandCommand());
  program.addCommand(createRunCommand());
  program.addCommand(createStatusCommand());
  program.addCommand(createValidateCommand());
  program.addCommand(createTestCommand());
  program.addCommand(createPluginCommand());
  program.addCommand(createAuditCommand());
  program.addCommand(createPolicyCommand());
  program.addCommand(createDlqCommand());
  program.addCommand(createRunsCommand());
  program.addCommand(createResumeCommand());
  program.addCommand(createInspectCommand());
  program.addCommand(createArtifactCommand());
  program.addCommand(createKnowledgeCommand());

  return program;
}
