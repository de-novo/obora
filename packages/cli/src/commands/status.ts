/**
 * obora status - Show workflow status
 * @module @obora/cli/commands/status
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { log } from "@obora/core";
import { Command } from "commander";

/**
 * Status file structure
 */
interface StatusFile {
  feature: {
    name: string;
    created_at: string;
    workflow: string;
  };
  status: string;
  progress: {
    current_stage: string;
    completed_stages: string[];
  };
  metadata: {
    last_updated: string;
    notes: string;
  };
}

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
}

/**
 * Read and parse status.yaml
 */
function readStatus(featurePath: string): StatusFile | null {
  const statusPath = join(featurePath, "status.yaml");
  if (!existsSync(statusPath)) {
    return null;
  }

  const content = readFileSync(statusPath, "utf-8");
  const lines = content.split("\n");
  const status: StatusFile = {
    feature: { name: "", created_at: "", workflow: "" },
    status: "pending",
    progress: { current_stage: "planning", completed_stages: [] },
    metadata: { last_updated: "", notes: "" },
  };

  let currentSection: keyof StatusFile | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("feature:")) {
      currentSection = "feature";
      continue;
    }
    if (trimmed.startsWith("status:")) {
      currentSection = "status";
      status.status = trimmed.split(":")[1]?.trim() || "pending";
      continue;
    }
    if (trimmed.startsWith("progress:")) {
      currentSection = "progress";
      continue;
    }
    if (trimmed.startsWith("metadata:")) {
      currentSection = "metadata";
      continue;
    }

    if (currentSection === "feature" && trimmed.startsWith("name:")) {
      status.feature.name = trimmed.split(":")[1]?.trim().replace(/"/g, "") || "";
    }
    if (currentSection === "feature" && trimmed.startsWith("created_at:")) {
      status.feature.created_at = trimmed.split(":")[1]?.trim().replace(/"/g, "") || "";
    }
    if (currentSection === "feature" && trimmed.startsWith("workflow:")) {
      status.feature.workflow = trimmed.split(":")[1]?.trim().replace(/"/g, "") || "";
    }
    if (currentSection === "progress" && trimmed.startsWith("current_stage:")) {
      status.progress.current_stage = trimmed.split(":")[1]?.trim() || "planning";
    }
    if (currentSection === "metadata" && trimmed.startsWith("last_updated:")) {
      status.metadata.last_updated = trimmed.split(":")[1]?.trim().replace(/"/g, "") || "";
    }
    if (currentSection === "metadata" && trimmed.startsWith("notes:")) {
      status.metadata.notes = trimmed.split(":").slice(1).join(":").trim().replace(/"/g, "") || "";
    }
  }

  return status;
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

  // Read feature status
  const status = readStatus(featureDir);
  if (!status) {
    console.error(`Error: Feature '${featureName}' not found or has no status file.`);
    process.exit(1);
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

  const status = readStatus(featureDir);
  if (!status) {
    console.error(`Error: Feature '${featureName}' not found or has no status file.`);
    process.exit(1);
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
    process.exit(1);
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
    process.exit(3);
  }

  const format = options.format || "default";

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
    .option("--feature <name>", "Show status for a specific feature")
    .option("-v, --verbose", "Verbose output (show step details)")
    .action(async (options: StatusOptions) => {
      await runStatus(options);
    });

  return cmd;
}

export { runStatus };
