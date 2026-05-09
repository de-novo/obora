/**
 * M6-02: `obora resume <runId>` CLI command
 *
 * Resumes a failed/suspended run from the last checkpoint.
 */

import { access } from "node:fs/promises";
import { resolve } from "node:path";

import { Command, Option } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts, type GlobalOptions } from "../utils/global-opts.js";

interface ResumeRuntimeLike {
  getRunRecord(runId: string): Promise<{ workflowName: string } | null>;
  loadWorkflow(path: string): Promise<unknown>;
  resume(
    runId: string,
    opts: { fromStep?: string; driftPolicy: "reject" | "warn" | "ignore" }
  ): Promise<{
    execution: { id: string; status: string };
    restoredSteps: string[];
    rerunSteps: string[];
    driftDetected?: boolean;
  }>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shouldOutputJson(localJson: boolean | undefined, globalOpts: GlobalOptions): boolean {
  return Boolean(localJson || globalOpts.json);
}

async function createResumeRuntime(): Promise<ResumeRuntimeLike> {
  try {
    const { OboraRuntime, loadConfig } = await import("@obora/sdk");

    const config = await loadConfig();
    const persistence = (config as Record<string, unknown>).persistence as
      | { enabled?: boolean; adapter?: string; sqlite?: { path?: string }; custom?: unknown }
      | undefined;

    return new OboraRuntime({
      persistence: {
        enabled: persistence?.enabled ?? true,
        adapter: (persistence?.adapter as "sqlite" | "custom") ?? "sqlite",
        sqlite: { path: persistence?.sqlite?.path ?? "./data/obora.db" },
        ...(persistence?.custom
          ? {
              custom: persistence.custom as { instance: import("@obora/runtime").StorageAdapter },
            }
          : {}),
      },
    }) as ResumeRuntimeLike;
  } catch (error) {
    throw new CLIError(
      `Failed to initialize resume runtime: ${getErrorMessage(error)}`,
      ExitCode.EXECUTION_FAILED
    );
  }
}

async function loadResumeWorkflow(
  runtime: ResumeRuntimeLike,
  workflowName: string
): Promise<boolean> {
  const workflowCandidates = [
    workflowName,
    `${workflowName}.yaml`,
    `${workflowName}.yml`,
    `.obora/workflows/${workflowName}.yaml`,
    `.obora/workflows/${workflowName}.yml`,
  ].map((candidate) => resolve(process.cwd(), candidate));

  const loadCandidate = async (candidates: string[]): Promise<boolean> => {
    const [candidate, ...rest] = candidates;
    if (!candidate) {
      return false;
    }

    const exists = await access(candidate).then(() => true, () => false);
    if (!exists) {
      return loadCandidate(rest);
    }

    await runtime.loadWorkflow(candidate);
    return true;
  };

  return loadCandidate(workflowCandidates);
}

async function runResume(
  runId: string,
  opts: { fromStep?: string; driftPolicy: "reject" | "warn" | "ignore"; json?: boolean },
  globalOpts: GlobalOptions
): Promise<void> {
  const runtime = await createResumeRuntime();

  const run = await runtime.getRunRecord(runId);
  if (!run) {
    throw new CLIError(`Run not found: ${runId}`, ExitCode.VALIDATION_ERROR);
  }

  const workflowLoaded = await loadResumeWorkflow(runtime, run.workflowName);
  if (!workflowLoaded) {
    formatter.warn(
      `Workflow file not found for '${run.workflowName}'. Resume may fail if rerun steps are required.`
    );
  }

  const result = await runtime.resume(runId, {
      fromStep: opts.fromStep,
      driftPolicy: opts.driftPolicy,
    }).catch((error: unknown) => {
    throw new CLIError(`Resume failed: ${getErrorMessage(error)}`, ExitCode.EXECUTION_FAILED);
  });

  if (shouldOutputJson(opts.json, globalOpts)) {
    formatter.json(result);
    return;
  }

  console.log(`\n✅ Run resumed: ${result.execution.id}`);
  console.log(`  Status: ${result.execution.status}`);
  console.log(`  Restored steps: ${result.restoredSteps.join(", ") || "(none)"}`);
  console.log(`  Re-run steps: ${result.rerunSteps.join(", ") || "(none)"}`);
  if (result.driftDetected) {
    console.log(`  ⚠️  Policy drift detected (action: ${opts.driftPolicy})`);
  }
}

export function createResumeCommand(): Command {
  return new Command("resume")
    .description("Resume a failed or suspended run from its last checkpoint")
    .argument("<runId>", "Run ID to resume")
    .option("--from-step <stepName>", "Resume from a specific step (default: last failed)")
    .addOption(
      new Option("--drift-policy <policy>", "How to handle policy drift")
        .choices(["reject", "warn", "ignore"])
        .default("warn")
    )
    .option("--json", "Output as JSON")
    .action(async function (
      this: Command,
      runId: string,
      opts: { fromStep?: string; driftPolicy: "reject" | "warn" | "ignore"; json?: boolean }
    ) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runResume(runId, opts, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });
}
