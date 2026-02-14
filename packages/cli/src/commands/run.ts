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
  OboraError,
  getDiagnosis,
  formatDiagnosis,
} from "@obora/core";
import type { Workflow, Step, WorkflowConfig, ErrorCode } from "@obora/core";

import {
  executeStep as executeStepBridge,
  type AgentResolver,
  type StepResult,
} from "../runtime/step-executor.js";
import {
  createWorkflowBlackboard,
  buildAgentContext,
  recordStepResult,
  recordStepError,
  appendHistory,
} from "../runtime/context-builder.js";
import { AgentRegistry } from "../runtime/agent-registry.js";
import { createAdapterFromEnv } from "@obora-kit/agents";
import type { ChatMessage } from "@obora-kit/agents";
import type { Blackboard } from "../runtime/blackboard.js";
import { parseDuration } from "../runtime/utils.js";
import { calculateDelay, waitWithAbort } from "../runtime/retry-policy.js";
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
  const backupPath = `${statusPath}.bak`;
  const isCI = Boolean(process.env.CI);
  const content = typeof fs.readFile === "function"
    ? await fs.readFile(statusPath, "utf-8")
    : readFileSync(statusPath, "utf-8");

  const throwRollbackFailure = (reason: "parse" | "write", rollbackError: unknown): never => {
    const recoveryMsg =
      `Failed to recover status.yaml after ${reason} error: ${String(rollbackError)}`;

    if (!isCI) {
      console.error(`[manual-recovery] ${recoveryMsg}`);
      console.error(`[manual-recovery] Restore backup file: ${backupPath} -> ${statusPath}`);
      console.error("[manual-recovery] Verify status.yaml and rerun the command.");
    }

    throw new OboraError("E4014" as ErrorCode, recoveryMsg);
  };

  if (typeof fs.copyFile === "function") {
    await fs.copyFile(statusPath, backupPath);
  } else {
    await fs.writeFile(backupPath, content, "utf-8");
  }

  let parsed: Record<string, any>;
  try {
    parsed = yaml.parse(content) as Record<string, any>;
    if (!parsed || typeof parsed !== "object") {
      throw new Error("Invalid YAML object");
    }
  } catch (parseError) {
    try {
      if (typeof fs.copyFile === "function") {
        await fs.copyFile(backupPath, statusPath);
      } else {
        const backupContent = readFileSync(backupPath, "utf-8");
        await fs.writeFile(statusPath, backupContent, "utf-8");
      }
    } catch (rollbackError) {
      throwRollbackFailure("parse", rollbackError);
    }

    throw new OboraError("E4007", `Failed to parse status.yaml: ${String(parseError)}`);
  }

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

  try {
    await fs.writeFile(statusPath, yaml.stringify(parsed), "utf-8");
  } catch (writeError) {
    try {
      if (typeof fs.copyFile === "function") {
        await fs.copyFile(backupPath, statusPath);
      } else {
        const backupContent = readFileSync(backupPath, "utf-8");
        await fs.writeFile(statusPath, backupContent, "utf-8");
      }
    } catch (rollbackError) {
      throwRollbackFailure("write", rollbackError);
    }

    throw writeError;
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
 * Global AgentResolver — set by runtime bootstrap (TASK-043b).
 */
const runtimeState: { activeResolver: AgentResolver | null } = {
  activeResolver: null,
};

/**
 * Set the global AgentResolver (called by runtime bootstrap).
 * @internal exported for testing
 */
export function setAgentResolver(resolver: AgentResolver | null): void {
  runtimeState.activeResolver = resolver;
}

/**
 * Bootstrap the AgentRegistry from environment.
 * Creates an LLM adapter (falls back to MockLLMAdapter when unconfigured)
 * and registers a global AgentResolver.
 *
 * @internal exported for testing
 */
export function bootstrapAgentResolver(): AgentResolver {
  const llm = createAdapterFromEnv();
  const registry = new AgentRegistry({ llm });
  setAgentResolver(registry);
  return registry;
}

/**
 * Execute a single step.
 *
 * Delegates to StepExecutor via an active AgentResolver.
 * Simulation fallback is only allowed in --dry-run mode at the command level.
 */
async function executeStep(
  step: Step,
  featurePath: string,
  workflowConfig: WorkflowConfig | undefined,
  attempt: number,
  runtimeCtx?: { board: Blackboard; sessionId: string; history: ChatMessage[] },
): Promise<{ success: boolean; output?: string; error?: string; diagnosisCode?: ErrorCode }> {
  log(`  [Attempt ${attempt}] Executing step: ${step.name} (agent: ${step.agent})`);

  // --- Bridge path: real agent execution ---
  if (runtimeState.activeResolver) {
    // Guard: ensure runtimeCtx is provided when resolver is active
    if (!runtimeCtx) {
      return {
        success: false,
        error: "Resolver is active but runtime context is missing — possible Blackboard creation failure or misconfiguration",
        diagnosisCode: "E4007",
      };
    }
    const context = buildAgentContext(
      runtimeCtx.sessionId,
      runtimeCtx.board,
      step,
      runtimeCtx.history,
    );

    const result: StepResult = await executeStepBridge(
      step,
      runtimeState.activeResolver,
      context,
    );
    return result;
  }

  return {
    success: false,
    error: "Agent resolver is not initialized (bootstrap invariant violated)",
    diagnosisCode: "E4007",
  };
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
  featureName: string,
  options: RunOptions
): Promise<{
  success: boolean;
  completedSteps: string[];
  failedSteps: string[];
  errorCode?: ErrorCode;
  firstFailureCode?: ErrorCode;
  lastFailureCode?: ErrorCode;
}> {
  const completedSteps: string[] = [];
  const failedSteps: string[] = [];
  let firstFailureCode: ErrorCode | undefined;
  let lastFailureCode: ErrorCode | undefined;

  // Build graph and get execution order
  const graph = buildGraph(workflow.steps);
  const topoResult = topologicalSort(graph);

  if (!topoResult.success) {
    throw new Error(`Circular dependency detected: ${topoResult.cyclePath?.join(" -> ")}`);
  }

  const executionOrder = topoResult.order;
  log(`  Execution order: ${executionOrder.join(" -> ")}`);


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

  // --- TASK-043c: create shared Blackboard for the workflow run ---
  const board = runtimeState.activeResolver
    ? createWorkflowBlackboard(workflowRunId, workflow, featureName)
    : undefined;
  const chatHistory: ChatMessage[] = [];

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
    let lastDiagnosisCode: ErrorCode | undefined;
    const maxRetries = workflow.config?.retry || 0;
    let actualAttempts = 0;

    // Workflow-level retry loop:
    // - This retries the whole step execution when a step fails.
    // - Agent-level retry remains inside step-executor (different layer, different purpose).
    const retryDelayBaseMs = parseDuration(workflow.config?.retry_delay || "5s");
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      actualAttempts = attempt;
      const runtimeCtx = board
        ? { board, sessionId: workflowRunId, history: chatHistory }
        : undefined;
      const result = await executeStep(step, featurePath, workflow.config, attempt, runtimeCtx);

      if (result.success) {
        stepSuccess = true;
        stepOutput = result.output;
        break;
      } else {
        stepError = result.error;
        lastDiagnosisCode = result.diagnosisCode;
        if (attempt < maxRetries + 1) {
          const delayMs = calculateDelay(attempt - 1, {
            baseDelayMs: retryDelayBaseMs,
            maxDelayMs: retryDelayBaseMs,
            backoffMultiplier: 1,
            jitterRatio: 0,
          });
          log(`    Step failed, retrying in ${Math.ceil(delayMs / 1000)}s...`);
          await waitWithAbort(delayMs);
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
      retry_count: actualAttempts - 1,
    });

    // --- TASK-043c: record result on blackboard (single-writer) ---
    if (board) {
      if (stepSuccess) {
        recordStepResult(board, stepName, { success: true, output: stepOutput });
      } else {
        recordStepError(board, stepName, {
          success: false,
          error: stepError,
          diagnosisCode: lastDiagnosisCode,
        });
      }
    }

    // --- TASK-043c: accumulate chat history for subsequent steps ---
    if (stepSuccess) {
      appendHistory(chatHistory, {
        role: "assistant",
        content: `[${stepName}] ${stepOutput ?? "(no output)"}`,
      });
    }

    if (stepSuccess) {
      completedSteps.push(stepName);
      if (stepOutput) {
        await saveStepOutput(featurePath, stepName, stepOutput);
      }
      log(`  ✓ Step ${stepName} completed`);
    } else {
      failedSteps.push(stepName);
      if (lastDiagnosisCode) {
        if (!firstFailureCode) {
          firstFailureCode = lastDiagnosisCode;
        }
        lastFailureCode = lastDiagnosisCode;
      }
      log(`  ✗ Step ${stepName} failed: ${stepError}${lastDiagnosisCode ? ` [${lastDiagnosisCode}]` : ""}`);

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

  // Use the actual failing step diagnosis code captured during workflow execution.
  const errorCode: ErrorCode | undefined = failedSteps.length > 0
    ? lastFailureCode ?? firstFailureCode
    : undefined;

  return {
    success: failedSteps.length === 0,
    completedSteps,
    failedSteps,
    errorCode,
    firstFailureCode,
    lastFailureCode,
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

  if (!runtimeState.activeResolver) {
    try {
      const resolver = bootstrapAgentResolver();
      if (!resolver) {
        throw new Error("bootstrap returned empty resolver");
      }
      setAgentResolver(resolver);
    } catch (error) {
      throw new OboraError("E4007", `Agent resolver bootstrap invariant violated: ${String(error)}`);
    }
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
  const result = await executeWorkflow(workflow, featureDir, featureName, options);

  // Update final status, persisting the actual step failure code for later diagnosis
  const finalStatus = result.success ? "completed" : "failed";
  const failureCode = result.lastFailureCode ?? result.firstFailureCode ?? result.errorCode;
  await updateStatus(featureDir, {
    status: finalStatus,
    metadata: {
      last_updated: new Date().toISOString(),
      notes: "",
      ...(failureCode ? { last_error_code: failureCode } : {}),
    },
  });

  console.log("");
  console.log("Execution complete!");
  console.log(`  Completed steps: ${result.completedSteps.length}`);
  console.log(`  Failed steps: ${result.failedSteps.length}`);

  if (result.failedSteps.length > 0) {
    console.log(`  Failed: ${result.failedSteps.join(", ")}`);

    // Use exactly the same failure code persisted into status.yaml.
    // Exit code 1 = standard CLI failure (POSIX convention).
    const failureCode = result.lastFailureCode ?? result.firstFailureCode ?? result.errorCode ?? "E4001";
    console.error(`  Error code: ${failureCode}`);
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
