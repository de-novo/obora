/**
 * obora status - Show workflow status
 * @module @obora/cli/commands/status
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { log, getAllDiagnoses, formatDiagnosis, getDiagnosis } from "@obora/runtime";
import { Command } from "commander";

import { CLIError } from "../../errors.js";
import { validatePathComponent } from "../../utils/path-utils.js";
import { type StatusFile, readStatus } from "../../utils/status.js";

/**
 * Workflow run record from DuckDB
 */
interface WorkflowRun {
  id: string;
  feature_name: string;
  workflow_name: string;
  started_at: string;
  completed_at?: string;
  status: string;
  total_steps: number;
  completed_steps: number;
}

/**
 * Step run record from DuckDB
 */
interface StepRun {
  id: string;
  workflow_run_id: string;
  step_name: string;
  agent: string;
  started_at: string;
  completed_at?: string;
  status: string;
  output?: string;
  error_message?: string;
  retry_count: number;
}

/**
 * Status options
 */
interface StatusOptions {
  format?: "default" | "json" | "minimal";
  feature?: string;
  verbose?: boolean;
  diagnose?: boolean;
}

/**
 * Get workflow runs from DuckDB (placeholder)
 * In production, this would query the actual database
 */
async function getWorkflowRuns(featureName?: string): Promise<WorkflowRun[]> {
  log(`  [DuckDB] Querying workflow runs${featureName ? ` for ${featureName}` : ""}...`);

  // Placeholder: In production, this would query DuckDB
  // Returns mock data for demonstration
  return [
    {
      id: "run-1738617600000",
      feature_name: featureName || "example-feature",
      workflow_name: "simple",
      started_at: "2026-02-04T00:00:00Z",
      completed_at: "2026-02-04T00:05:00Z",
      status: "completed",
      total_steps: 4,
      completed_steps: 4,
    },
  ];
}

/**
 * Get step runs from DuckDB (placeholder)
 * In production, this would query the actual database
 */
async function getStepRuns(workflowRunId: string): Promise<StepRun[]> {
  log(`  [DuckDB] Querying step runs for ${workflowRunId}...`);

  // Placeholder: In production, this would query DuckDB
  return [
    {
      id: "step-1",
      workflow_run_id: workflowRunId,
      step_name: "plan",
      agent: "architect",
      started_at: "2026-02-04T00:00:00Z",
      completed_at: "2026-02-04T00:01:00Z",
      status: "completed",
      retry_count: 0,
    },
    {
      id: "step-2",
      workflow_run_id: workflowRunId,
      step_name: "implement",
      agent: "coder",
      started_at: "2026-02-04T00:01:00Z",
      completed_at: "2026-02-04T00:03:00Z",
      status: "completed",
      retry_count: 0,
    },
    {
      id: "step-3",
      workflow_run_id: workflowRunId,
      step_name: "test",
      agent: "tester",
      started_at: "2026-02-04T00:03:00Z",
      completed_at: "2026-02-04T00:04:00Z",
      status: "completed",
      retry_count: 0,
    },
    {
      id: "step-4",
      workflow_run_id: workflowRunId,
      step_name: "done",
      agent: "reviewer",
      started_at: "2026-02-04T00:04:00Z",
      completed_at: "2026-02-04T00:05:00Z",
      status: "completed",
      retry_count: 0,
    },
  ];
}

/**
 * Calculate progress percentage
 */
function calculateProgress(total: number, completed: number): number {
  if (total === 0) return 0;
  return Math.round((completed / total) * 100);
}

/**
 * Format status with emoji
 */
function formatStatus(status: string): string {
  const statusMap: Record<string, string> = {
    pending: "⏳",
    running: "🔄",
    completed: "✅",
    failed: "❌",
    blocked: "🚫",
    paused: "⏸️",
    cancelled: "🗑️",
    planned: "📋",
  };
  return statusMap[status] || status;
}

/**
 * Display status in default format
 */
async function displayDefaultStatus(featureName: string, verbose: boolean): Promise<void> {
  const cwd = process.cwd();
  const oboraDir = join(cwd, ".obora");
  const featuresDir = join(oboraDir, "features");
  const featureDir = join(featuresDir, featureName);

  // Validate feature name for path traversal
  validatePathComponent(featureName);

  // Read feature status
  const status = readStatus(featureDir);
  if (!status) {
    console.error(`Error: Feature '${featureName}' not found or has no status file.`);
    throw new CLIError(`Feature '${featureName}' not found or has no status file.`, 1);
  }

  console.log(`Feature: ${status.feature.name}`);
  console.log(`Workflow: ${status.feature.workflow}`);
  console.log(`Status: ${formatStatus(status.status)} ${status.status}`);
  console.log(`Current Stage: ${status.progress.current_stage}`);
  console.log(`Last Updated: ${status.metadata.last_updated}`);

  if (status.metadata.notes) {
    console.log(`Notes: ${status.metadata.notes}`);
  }

  // Get workflow runs from DuckDB
  const runs = await getWorkflowRuns(featureName);
  if (runs.length > 0) {
    const latestRun = runs[0];
    const progress = calculateProgress(latestRun.total_steps, latestRun.completed_steps);

    console.log("");
    console.log("Latest Run:");
    console.log(`  ID: ${latestRun.id}`);
    console.log(`  Started: ${latestRun.started_at}`);
    if (latestRun.completed_at) {
      console.log(`  Completed: ${latestRun.completed_at}`);
    }
    console.log(
      `  Progress: ${progress}% (${latestRun.completed_steps}/${latestRun.total_steps} steps)`
    );

    if (verbose) {
      console.log("");
      console.log("Steps:");
      const stepRuns = await getStepRuns(latestRun.id);

      for (const step of stepRuns) {
        const stepStatus = formatStatus(step.status);
        console.log(`  ${stepStatus} ${step.step_name}`);
        console.log(`    Agent: ${step.agent}`);
        console.log(`    Status: ${step.status}`);
        if (step.error_message) {
          console.log(`    Error: ${step.error_message}`);
        }
        if (step.retry_count > 0) {
          console.log(`    Retries: ${step.retry_count}`);
        }
      }
    }
  } else {
    console.log("");
    console.log("No workflow runs found.");
  }
}

/**
 * Display status in minimal format
 */
async function displayMinimalStatus(featureName: string): Promise<void> {
  const cwd = process.cwd();
  const oboraDir = join(cwd, ".obora");
  const featuresDir = join(oboraDir, "features");
  const featureDir = join(featuresDir, featureName);

  // Validate feature name for path traversal
  validatePathComponent(featureName);

  const status = readStatus(featureDir);
  if (!status) {
    console.log("not found");
    return;
  }

  const runs = await getWorkflowRuns(featureName);
  let progress = "0%";
  if (runs.length > 0) {
    const latestRun = runs[0];
    progress = `${calculateProgress(latestRun.total_steps, latestRun.completed_steps)}%`;
  }

  console.log(`${formatStatus(status.status)} ${status.status} ${progress}`);
}

/**
 * Display status in JSON format
 */
async function displayJsonStatus(featureName: string, verbose: boolean): Promise<void> {
  const cwd = process.cwd();
  const oboraDir = join(cwd, ".obora");
  const featuresDir = join(oboraDir, "features");
  const featureDir = join(featuresDir, featureName);

  // Validate feature name for path traversal
  validatePathComponent(featureName);

  const status = readStatus(featureDir);
  if (!status) {
    console.error(`Error: Feature '${featureName}' not found or has no status file.`);
    throw new CLIError(`Feature '${featureName}' not found or has no status file.`, 1);
  }

  const runs = await getWorkflowRuns(featureName);
  const output: {
    feature: StatusFile;
    runs?: WorkflowRun[];
    steps?: StepRun[];
  } = {
    feature: status,
    runs: runs.length > 0 ? runs : undefined,
  };

  if (verbose && runs.length > 0) {
    output.steps = await getStepRuns(runs[0].id);
  }

  console.log(JSON.stringify(output, null, 2));
}

/**
 * Display all features status
 */
async function displayAllFeaturesStatus(format: string, _verbose: boolean): Promise<void> {
  const cwd = process.cwd();
  const oboraDir = join(cwd, ".obora");
  const featuresDir = join(oboraDir, "features");

  if (!existsSync(featuresDir)) {
    console.error("Error: Features directory not found.");
    throw new CLIError("Features directory not found.", 1);
  }

  const featureNames = readdirSync(featuresDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("."))
    .map((d) => d.name);

  if (featureNames.length === 0) {
    console.log("No features found.");
    return;
  }

  if (format === "json") {
    const allStatus: Record<string, StatusFile> = {};
    for (const name of featureNames) {
      const status = readStatus(join(featuresDir, name));
      if (status) {
        allStatus[name] = status;
      }
    }
    console.log(JSON.stringify(allStatus, null, 2));
  } else {
    console.log("Features:");
    for (const name of featureNames) {
      const status = readStatus(join(featuresDir, name));
      if (status) {
        const runs = await getWorkflowRuns(name);
        let progress = "0%";
        if (runs.length > 0) {
          const latestRun = runs[0];
          progress = `${calculateProgress(latestRun.total_steps, latestRun.completed_steps)}%`;
        }
        console.log(`  ${formatStatus(status.status)} ${name} - ${status.status} (${progress})`);
      }
    }
  }
}

/**
 * Main status command logic
 */
async function runStatus(options: StatusOptions): Promise<void> {
  const cwd = process.cwd();
  const oboraDir = join(cwd, ".obora");

  // Validate .obora exists
  if (!existsSync(oboraDir)) {
    console.error("Error: Not in an obora project. Run 'obora init' first.");
    throw new CLIError("Not in an obora project. Run 'obora init' first.", 3);
  }

  const format = options.format || "default";

  // --diagnose: show diagnosis templates for failed features or all known errors
  if (options.diagnose) {
    if (options.feature) {
      // Show diagnosis for a specific feature's last error
      const featuresDir = join(oboraDir, "features");
      const featureDir = join(featuresDir, options.feature);
      validatePathComponent(options.feature);
      const status = readStatus(featureDir);
      if (status && status.status === "failed") {
        // Use the feature's last recorded error code when available;
        // fall back to showing all diagnosis templates if unknown.
        const lastCode = status.metadata?.last_error_code;
        if (lastCode) {
          console.log(`Diagnosis for failed feature '${options.feature}' (${lastCode}):\n`);
          const diag = getDiagnosis(lastCode);
          if (diag) {
            console.log(formatDiagnosis(diag));
          } else {
            console.log(`No diagnosis template found for ${lastCode}.`);
          }
        } else {
          // No recorded error code — show all relevant diagnoses
          console.log(`Diagnosis guides for failed feature '${options.feature}':\n`);
          for (const diag of getAllDiagnoses()) {
            console.log(formatDiagnosis(diag));
          }
        }
      } else {
        console.log(`Feature '${options.feature}' is not in failed state (status: ${status?.status || "unknown"}).`);
      }
    } else {
      // Show all diagnosis templates
      console.log("Available diagnosis guides:\n");
      for (const diag of getAllDiagnoses()) {
        console.log(formatDiagnosis(diag));
      }
    }
    return;
  }

  if (options.feature) {
    // Show status for specific feature
    switch (format) {
      case "minimal":
        await displayMinimalStatus(options.feature);
        break;
      case "json":
        await displayJsonStatus(options.feature, options.verbose || false);
        break;
      default:
        await displayDefaultStatus(options.feature, options.verbose || false);
    }
  } else {
    // Show all features
    await displayAllFeaturesStatus(format, options.verbose || false);
  }
}

/**
 * Create the status command
 */
export function createStatusCommand(): Command {
  const cmd = new Command("status")
    .description("Show workflow status")
    .option("-f, --format <type>", "Output format: default, json, minimal", "default")
    .option("-F, --feature <name>", "Show status for a specific feature")
    .option("-v, --verbose", "Verbose output (show step details)")
    .option("-d, --diagnose", "Show actionable diagnosis guides for errors")
    .action(async (options: StatusOptions) => {
      await runStatus(options);
    });

  return cmd;
}

export { runStatus };
