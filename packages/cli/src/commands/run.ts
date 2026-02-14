/**
 * obora run - Execute workflow
 * @module @obora/cli/commands/run
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as path from "node:path";

import {
  log,
  parseWorkflow,
  topologicalSort,
  buildGraph,
  groupByLevel,
  OboraError,
  getDiagnosis,
  formatDiagnosis,
} from "@obora/core";
import type { Workflow, Step, WorkflowConfig } from "@obora/core";
import { Command } from "commander";
import fs from "fs-extra";
import yaml from "yaml";

import { CLIError } from "../errors.js";
import { validatePathComponent } from "../utils/path-utils.js";
import { type StatusFile, readStatus } from "../utils/status.js";

/**
 * Run options
 */
interface RunOptions {
  dryRun?: boolean;
  fromStep?: string;
  verbose?: boolean;
  continueOnError?: boolean;
  feature?: string;
  mode?: "auto" | "supervised" | "gated";
}

/**
 * Detect feature name from current directory
 */
function detectFeatureName(): string | null {
  const cwd = process.cwd();

  // Check if we're in .obora/features/<feature> directory
  if (cwd.includes(join(".obora", "features"))) {
    const parts = cwd.split(join(".obora", "features"));
    if (parts.length > 1) {
      const featurePart = parts[1].split(path.sep)[1];
      if (featurePart) {
        return featurePart;
      }
    }
  }

  return null;
}

/**
 * Workflow execution record for DuckDB
 */
interface WorkflowRun {
  id: string;
  feature_name: string;
  workflow_name: string;
  started_at: string;
  completed_at?: string;
  status: string; // running, completed, failed, cancelled
  total_steps: number;
  completed_steps: number;
}

/**
 * Step execution record for DuckDB
 */
interface StepRun {
  id: string;
  workflow_run_id: string;
  step_name: string;
  agent: string;
  started_at: string;
  completed_at?: string;
  status: string; // pending, running, completed, failed, skipped
  output?: string;
  error_message?: string;
  retry_count: number;
}

/**
 * Update status.yaml using YAML
 */
async function updateStatus(featurePath: string, updates: Partial<StatusFile>): Promise<void> {
  const statusPath = join(featurePath, "status.yaml");
  const content = readFileSync(statusPath, "utf-8");

  try {
    const parsed = yaml.parse(content) as Record<string, any>;

    if (updates.status !== undefined) {
      parsed.status = updates.status;
    }
    if (updates.metadata?.last_updated !== undefined) {
      if (!parsed.metadata) parsed.metadata = {};
      parsed.metadata.last_updated = updates.metadata.last_updated;
    }
    if (updates.metadata?.notes !== undefined) {
      if (!parsed.metadata) parsed.metadata = {};
      parsed.metadata.notes = updates.metadata.notes;
    }
    if (updates.metadata?.last_error_code !== undefined) {
      if (!parsed.metadata) parsed.metadata = {};
      parsed.metadata.last_error_code = updates.metadata.last_error_code;
    }

    await fs.writeFile(statusPath, yaml.stringify(parsed), "utf-8");
  } catch (error) {
    // If YAML parsing fails, try regex-based update as fallback
    let newContent = content;
    if (updates.status !== undefined) {
      newContent = newContent.replace(/^status:.*$/m, `status: ${updates.status}`);
    }
    if (updates.metadata?.last_updated !== undefined) {
      const now = updates.metadata.last_updated;
      newContent = newContent.replace(/^ {2}last_updated:.*$/m, `  last_updated: "${now}"`);
    }
    await fs.writeFile(statusPath, newContent, "utf-8");
  }
}

/**
 * Read workflow YAML file
 */
function readWorkflow(workflowPath: string): string {
  if (!existsSync(workflowPath)) {
    throw new Error(`Workflow file not found: ${workflowPath}`);
  }
  return readFileSync(workflowPath, "utf-8");
}

/**
 * Save step output
 */
async function saveStepOutput(
  featurePath: string,
  stepName: string,
  output: string
): Promise<void> {
  const outputDir = join(featurePath, ".obora", "outputs");
  await fs.ensureDir(outputDir);

  const outputPath = join(outputDir, `${stepName}.md`);
  await fs.writeFile(outputPath, output, "utf-8");
}

/**
 * Parse duration string to milliseconds
 */
function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}

/**
 * Execute a single step (placeholder for actual agent execution)
 * In production, this would call the specified agent via OpenClaw API
 */
async function executeStep(
  step: Step,
  featurePath: string,
  workflowConfig: WorkflowConfig | undefined,
  attempt: number
): Promise<{ success: boolean; output?: string; error?: string }> {
  log(`  [Attempt ${attempt}] Executing step: ${step.name} (agent: ${step.agent})`);

  if (step.timeout) {
    const timeoutMs = parseDuration(step.timeout);
    log(`    Timeout: ${step.timeout} (${timeoutMs}ms)`);
  }

  // Placeholder: In production, this would:
  // 1. Call OpenClaw API with the specified agent
  // 2. Pass step context (inputs, config)
  // 3. Wait for completion or timeout
  // 4. Return result

  // Simulated execution
  const simulatedOutput = `# Output from step: ${step.name}

> Agent: ${step.agent}
> Executed at: ${new Date().toISOString()}
> Attempt: ${attempt}

## Results

*Simulated step execution result*

In production, this will contain the actual output from the agent execution.
`;

  return { success: true, output: simulatedOutput };
}

/**
 * Record workflow run in DuckDB (placeholder)
 * In production, this would insert into the database
 */
async function recordWorkflowRun(run: WorkflowRun): Promise<void> {
  log(`  [DuckDB] Recording workflow run: ${run.id}`);
  // Placeholder: In production, this would insert into DuckDB
}

/**
 * Record step run in DuckDB (placeholder)
 * In production, this would insert into the database
 */
async function recordStepRun(stepRun: StepRun): Promise<void> {
  log(`  [DuckDB] Recording step run: ${stepRun.id}`);
  // Placeholder: In production, this would insert into DuckDB
}

/**
 * Execute workflow
 */
async function executeWorkflow(
  workflow: Workflow,
  featurePath: string,
  options: RunOptions
): Promise<{ success: boolean; completedSteps: string[]; failedSteps: string[]; errorCode?: string }> {
  const completedSteps: string[] = [];
  const failedSteps: string[] = [];

  // Build graph and get execution order
  const graph = buildGraph(workflow.steps);
  const topoResult = topologicalSort(graph);

  if (!topoResult.success) {
    throw new Error(`Circular dependency detected: ${topoResult.cyclePath?.join(" -> ")}`);
  }

  const executionOrder = topoResult.order;
  log(`  Execution order: ${executionOrder.join(" -> ")}`);

  // Group steps by level for display
  const _levelGroups = groupByLevel(workflow.steps);

  // Create workflow run record
  const workflowRunId = `run-${Date.now()}`;
  await recordWorkflowRun({
    id: workflowRunId,
    feature_name: workflow.name,
    workflow_name: workflow.name,
    started_at: new Date().toISOString(),
    status: "running",
    total_steps: workflow.steps.length,
    completed_steps: 0,
  });

  const stepMap = new Map(workflow.steps.map((s) => [s.name, s]));
  const continueOnError = options.continueOnError ?? workflow.config?.continue_on_error ?? false;

  // Execute steps in order
  for (const stepName of executionOrder) {
    // Skip if before fromStep
    if (
      options.fromStep &&
      executionOrder.indexOf(stepName) < executionOrder.indexOf(options.fromStep)
    ) {
      log(`  Skipping step: ${stepName} (before --from-step)`);
      continue;
    }

    const step = stepMap.get(stepName);
    if (!step) {
      log(`  Warning: Step ${stepName} not found`);
      continue;
    }

    console.log("");
    console.log(`Step: ${stepName}`);
    if (step.description) {
      console.log(`  ${step.description}`);
    }

    // Create step run record
    const stepRunId = `step-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await recordStepRun({
      id: stepRunId,
      workflow_run_id: workflowRunId,
      step_name: stepName,
      agent: step.agent,
      started_at: new Date().toISOString(),
      status: "running",
      retry_count: 0,
    });

    let stepSuccess = false;
    let stepOutput: string | undefined;
    let stepError: string | undefined;
    const maxRetries = workflow.config?.retry || 0;

    // Execute with retry logic
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const result = await executeStep(step, featurePath, workflow.config, attempt);

      if (result.success) {
        stepSuccess = true;
        stepOutput = result.output;
        break;
      } else {
        stepError = result.error;
        if (attempt < maxRetries + 1) {
          const retryDelay = workflow.config?.retry_delay || "5s";
          log(`    Step failed, retrying in ${retryDelay}...`);
          // In production, would actually wait
        }
      }
    }

    // Record step result
    await recordStepRun({
      id: stepRunId,
      workflow_run_id: workflowRunId,
      step_name: stepName,
      agent: step.agent,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      status: stepSuccess ? "completed" : "failed",
      output: stepOutput,
      error_message: stepError,
      retry_count: stepSuccess ? 0 : maxRetries,
    });

    if (stepSuccess) {
      completedSteps.push(stepName);
      if (stepOutput) {
        await saveStepOutput(featurePath, stepName, stepOutput);
      }
      log(`  ✓ Step ${stepName} completed`);
    } else {
      failedSteps.push(stepName);
      log(`  ✗ Step ${stepName} failed: ${stepError}`);

      if (!continueOnError) {
        log("  Stopping execution due to step failure (use --continue-on-error to continue)");
        break;
      }
    }
  }

  // Update workflow run record
  await recordWorkflowRun({
    id: workflowRunId,
    feature_name: workflow.name,
    workflow_name: workflow.name,
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    status: failedSteps.length === 0 ? "completed" : "failed",
    total_steps: workflow.steps.length,
    completed_steps: completedSteps.length,
  });

  // Derive error code: E4005 when retries were exhausted, E4001 otherwise
  const errorCode =
    failedSteps.length > 0
      ? (workflow.config?.retry ?? 0) > 0
        ? "E4005"
        : "E4001"
      : undefined;

  return {
    success: failedSteps.length === 0,
    completedSteps,
    failedSteps,
    errorCode,
  };
}

/**
 * Main run command logic
 */
async function runRun(featureName: string, options: RunOptions): Promise<void> {
  const cwd = process.cwd();
  const oboraDir = join(cwd, ".obora");
  const featureDir = join(cwd, ".obora", "features", featureName);
  const workflowsDir = join(oboraDir, "workflows");

  // Validate feature name for path traversal
  validatePathComponent(featureName);

  // Validate .obora exists
  if (!existsSync(oboraDir)) {
    console.error("Error: Not in an obora project. Run 'obora init' first.");
    throw new CLIError("Not in an obora project. Run 'obora init' first.", 3);
  }

  // Validate feature exists
  if (!existsSync(featureDir)) {
    console.error(`Error: Feature '${featureName}' not found.`);
    console.error(`  Run 'obora new ${featureName}' to create it first.`);
    throw new CLIError(`Feature '${featureName}' not found.`, 1);
  }

  // Read status
  const status = readStatus(featureDir);
  if (!status) {
    console.error(`Error: Status file not found for feature '${featureName}'.`);
    throw new CLIError(`Status file not found for feature '${featureName}'.`, 1);
  }
  log(`Feature: ${featureName}`);
  log(`Current status: ${status.status}`);

  // Read workflow file
  const workflowName = status.feature.workflow || "simple";
  const workflowPath = join(workflowsDir, `${workflowName}.yaml`);

  if (!existsSync(workflowPath)) {
    console.error(`Error: Workflow file not found: ${workflowPath}`);
    throw new CLIError(`Workflow file not found: ${workflowPath}`, 1);
  }

  const workflowContent = readWorkflow(workflowPath);
  let workflow: Workflow;

  try {
    workflow = parseWorkflow(workflowContent);
    log(`Workflow: ${workflow.name} (version: ${workflow.version || "1.0"})`);
    log(`Steps: ${workflow.steps.length}`);
    log(`Mode: ${workflow.mode || "auto"}`);
  } catch (error) {
    if (error instanceof OboraError) {
      console.error(`Error: ${error.message}`);
      const diag = getDiagnosis(error.code);
      if (diag) {
        console.error(formatDiagnosis(diag));
      }
      throw new CLIError(error.message, 1);
    }
    throw error;
  }

  if (options.dryRun) {
    console.log("");
    console.log("Dry-run mode: would execute the following workflow:");
    console.log(`  Feature: ${featureName}`);
    console.log(`  Workflow: ${workflow.name}`);
    console.log(`  Steps: ${workflow.steps.map((s) => s.name).join(", ")}`);
    console.log(`  From step: ${options.fromStep || "beginning"}`);
    return;
  }

  console.log("");
  console.log(`Running workflow: ${workflow.name}`);
  console.log(`Feature: ${featureName}`);
  console.log("");

  // Update status to running
  await updateStatus(featureDir, {
    status: "running",
    metadata: { last_updated: new Date().toISOString(), notes: "" },
  });

  // Execute workflow
  const result = await executeWorkflow(workflow, featureDir, options);

  // Update final status, persisting the error code for later diagnosis
  const finalStatus = result.success ? "completed" : "failed";
  await updateStatus(featureDir, {
    status: finalStatus,
    metadata: {
      last_updated: new Date().toISOString(),
      notes: "",
      ...(result.errorCode ? { last_error_code: result.errorCode } : {}),
    },
  });

  console.log("");
  console.log("Execution complete!");
  console.log(`  Completed steps: ${result.completedSteps.length}`);
  console.log(`  Failed steps: ${result.failedSteps.length}`);

  if (result.failedSteps.length > 0) {
    console.log(`  Failed: ${result.failedSteps.join(", ")}`);

    // Derive diagnosis from actual error context rather than hardcoding E4005.
    // E4005 ("step failed after retries") is the most common, but the workflow
    // config may surface other codes (E4001, E4002, etc.) in the future.
    // Exit code 1 = standard CLI failure (POSIX convention).
    const failureCode = result.errorCode ?? "E4005";
    const diag = getDiagnosis(failureCode);
    if (diag) {
      console.error(formatDiagnosis(diag));
    }

    throw new CLIError(`Workflow execution failed: ${result.failedSteps.join(", ")}`, 1);
  }

  console.log("");
  console.log("✓ Workflow completed successfully!");
  console.log("");
  console.log("Next steps:");
  console.log(`  1. Review outputs in .obora/features/${featureName}/.obora/outputs/`);
  console.log(`  2. Run 'obora done ${featureName}' to archive the feature`);
}

/**
 * Create the run command
 */
export function createRunCommand(): Command {
  const cmd = new Command("run")
    .description("Execute workflow")
    .option("-f, --feature <name>", "Feature name")
    .option("-m, --mode <type>", "Execution mode (auto, supervised, gated)", "auto")
    .option("--dry-run", "Show execution plan without running")
    .option("--from-step <name>", "Start from a specific step")
    .option("-v, --verbose", "Verbose output")
    .option("--continue-on-error", "Continue execution even if a step fails")
    .action(async (options: RunOptions) => {
      // Detect feature if not specified
      const featureName = options.feature || detectFeatureName();
      if (!featureName) {
        console.error("Error: Feature name required.");
        console.error("  Specify with --feature or run from within a feature directory.");
        throw new CLIError(
          "Feature name required. Specify with --feature or run from within a feature directory.",
          1
        );
      }
      await runRun(featureName, options);
    });

  return cmd;
}

export { runRun };
