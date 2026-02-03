/**
 * obora done - Mark feature as done and archive
 * @module @obora/cli/commands/done
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { log } from "@obora/core";
import { Command } from "commander";
import fs from "fs-extra";

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
 * Done options
 */
interface DoneOptions {
  commit?: boolean;
  message?: string;
  noArchive?: boolean;
  dryRun?: boolean;
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
  }

  return status;
}

/**
 * Get workflow runs from DuckDB (placeholder)
 */
async function getWorkflowRuns(featureName: string): Promise<WorkflowRun[]> {
  log(`  [DuckDB] Querying workflow runs for ${featureName}...`);

  // Placeholder: In production, this would query DuckDB
  return [
    {
      id: "run-1738617600000",
      feature_name: featureName,
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
 * Update workflow run status in DuckDB (placeholder)
 */
async function updateWorkflowRunStatus(runId: string, status: string): Promise<void> {
  log(`  [DuckDB] Updating run ${runId} status to ${status}...`);
  // Placeholder: In production, this would update DuckDB
}

/**
 * Generate execution log content
 */
function generateExecutionLog(status: StatusFile, runs: WorkflowRun[]): string {
  const lines: string[] = [];

  lines.push(`# Execution Log: ${status.feature.name}`);
  lines.push("");
  lines.push(`> Feature: ${status.feature.name}`);
  lines.push(`> Workflow: ${status.feature.workflow}`);
  lines.push(`> Created: ${status.feature.created_at}`);
  lines.push(`> Completed: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`Final Status: ${status.status}`);
  lines.push(`Current Stage: ${status.progress.current_stage}`);
  lines.push(`Completed Stages: ${status.progress.completed_stages.join(", ") || "none"}`);
  lines.push("");

  if (runs.length > 0) {
    lines.push("## Workflow Runs");
    lines.push("");

    for (const run of runs) {
      lines.push(`### Run: ${run.id}`);
      lines.push("");
      lines.push(`- Workflow: ${run.workflow_name}`);
      lines.push(`- Started: ${run.started_at}`);
      lines.push(`- Completed: ${run.completed_at || "N/A"}`);
      lines.push(`- Status: ${run.status}`);
      lines.push(`- Progress: ${run.completed_steps}/${run.total_steps} steps`);
      lines.push("");
    }
  }

  lines.push("## Artifacts");
  lines.push("");
  lines.push("- [ ] proposal.md");
  lines.push("- [ ] design.md");
  lines.push("- [ ] tasks.md");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("*Generated by obora done*");

  return lines.join("\n");
}

/**
 * Write execution log
 */
async function writeExecutionLog(featurePath: string, content: string): Promise<void> {
  const logPath = join(featurePath, "execution.log");
  await fs.writeFile(logPath, content, "utf-8");
}

/**
 * Move feature to archive
 */
async function moveToArchive(
  featuresDir: string,
  archiveDir: string,
  featureName: string
): Promise<void> {
  const sourcePath = join(featuresDir, featureName);
  const targetPath = join(archiveDir, featureName);

  // Check if target already exists
  if (existsSync(targetPath)) {
    // Add timestamp suffix
    const timestamp = Date.now();
    const timestampedPath = join(archiveDir, `${featureName}-${timestamp}`);
    await fs.move(sourcePath, timestampedPath, { overwrite: true });
    log(`  Moved to archive as ${featureName}-${timestamp}`);
  } else {
    await fs.move(sourcePath, targetPath, { overwrite: true });
    log(`  Moved to archive as ${featureName}`);
  }
}

/**
 * Update status to done
 */
async function updateStatusToDone(featurePath: string): Promise<void> {
  const statusPath = join(featurePath, "status.yaml");
  let content = readFileSync(statusPath, "utf-8");

  // Update status
  content = content.replace(/^status:.*$/m, `status: done`);

  await fs.writeFile(statusPath, content, "utf-8");
}

/**
 * Create git commit (placeholder)
 * In production, this would use git commands
 */
async function createGitCommit(featureName: string, message?: string): Promise<void> {
  log(`  [Git] Creating commit for ${featureName}...`);

  // Placeholder: In production, this would:
  // 1. git add the feature directory
  // 2. git commit with message
  // 3. Return commit hash

  const commitMessage = message || `feat: complete ${featureName}`;
  log(`    Commit message: ${commitMessage}`);
  // Simulated commit hash
  return;
}

/**
 * Validate feature can be marked as done
 */
function validateFeatureDone(status: StatusFile): { valid: boolean; reason?: string } {
  // Check if already done
  if (status.status === "done") {
    return { valid: false, reason: "Feature is already marked as done" };
  }

  // Check if still running
  if (status.status === "running") {
    return {
      valid: false,
      reason: "Feature is still running. Use 'obora run' to check progress or wait for completion.",
    };
  }

  // Check if failed
  if (status.status === "failed") {
    return {
      valid: false,
      reason: "Feature workflow failed. Fix issues and re-run before marking as done.",
    };
  }

  return { valid: true };
}

/**
 * Main done command logic
 */
async function runDone(featureName: string, options: DoneOptions): Promise<void> {
  const cwd = process.cwd();
  const oboraDir = join(cwd, ".obora");
  const featuresDir = join(oboraDir, "features");
  const archiveDir = join(oboraDir, "archive");
  const featureDir = join(featuresDir, featureName);

  // Validate .obora exists
  if (!existsSync(oboraDir)) {
    console.error("Error: Not in an obora project. Run 'obora init' first.");
    process.exit(3);
  }

  // Validate feature exists
  if (!existsSync(featureDir)) {
    console.error(`Error: Feature '${featureName}' not found.`);
    process.exit(1);
  }

  console.log(`Marking feature as done: ${featureName}`);
  console.log("");

  // Read status
  const status = readStatus(featureDir);
  if (!status) {
    console.error(`Error: Status file not found for feature '${featureName}'.`);
    process.exit(1);
  }

  log(`  Current status: ${status.status}`);
  log(`  Current stage: ${status.progress.current_stage}`);

  // Validate can be marked as done
  const validation = validateFeatureDone(status);
  if (!validation.valid) {
    console.error(`Error: ${validation.reason}`);
    process.exit(1);
  }

  // Get workflow runs from DuckDB
  const runs = await getWorkflowRuns(featureName);
  log(`  Found ${runs.length} workflow run(s)`);

  if (options.dryRun) {
    console.log("");
    console.log("Dry-run mode: would perform the following actions:");
    console.log(`  1. Update status to 'done'`);
    console.log(`  2. Generate execution.log`);
    if (!options.noArchive) {
      console.log(`  3. Move to archive/`);
    }
    if (options.commit) {
      console.log(`  4. Create git commit`);
    }
    return;
  }

  // Update status to done
  console.log("Updating status...");
  await updateStatusToDone(featureDir);

  // Generate execution log
  console.log("Generating execution log...");
  const logContent = generateExecutionLog(status, runs);
  await writeExecutionLog(featureDir, logContent);

  // Update workflow run status in DuckDB
  if (runs.length > 0) {
    await updateWorkflowRunStatus(runs[0].id, "done");
  }

  // Move to archive
  if (!options.noArchive) {
    console.log("Moving to archive...");
    await moveToArchive(featuresDir, archiveDir, featureName);
  }

  // Create git commit
  if (options.commit) {
    console.log("Creating git commit...");
    await createGitCommit(featureName, options.message);
  }

  console.log("");
  console.log("✓ Feature marked as done successfully!");
  console.log("");
  console.log("Summary:");
  console.log(`  Feature: ${featureName}`);
  console.log(`  Status: done`);
  console.log(`  Workflow runs: ${runs.length}`);
  if (!options.noArchive) {
    console.log(`  Archived: yes`);
  }
  if (options.commit) {
    console.log(`  Git commit: ${options.message || `feat: complete ${featureName}`}`);
  }
  console.log("");
  console.log("The feature is ready for review and deployment.");
}

/**
 * Create the done command
 */
export function createDoneCommand(): Command {
  const cmd = new Command("done")
    .description("Mark feature as done and archive")
    .argument("<name>", "Feature name")
    .option("-c, --commit", "Create git commit after archiving")
    .option("-m, --message <text>", "Git commit message")
    .option("--no-archive", "Skip moving to archive directory")
    .option("--dry-run", "Show what would be done without making changes")
    .action(async (name: string, options: DoneOptions) => {
      await runDone(name, options);
    });

  return cmd;
}

export { runDone };
