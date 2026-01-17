/**
 * Workflow Runner - CLI Adapter
 *
 * Provides CLI-specific workflow execution with full tracker integration.
 * Uses @obora/workflow-core and @obora/agent-claude.
 */

import {
  executeWorkflow as coreExecuteWorkflow,
  type ExecuteWorkflowOptions,
  type WorkflowPlan,
  type AgentResult,
} from "@obora/workflow-core";
import { ClaudeAgentProvider } from "@obora/agent-claude";
import type { WorkflowType } from "@obora/database";

// Re-export for CLI convenience
export { loadAgents, getTracker } from "@obora/workflow-core";
export { simpleQuery } from "@obora/agent-claude";

/**
 * Extended options for CLI workflow execution
 */
export interface CliWorkflowOptions extends ExecuteWorkflowOptions {
  /** Workflow type for tracking */
  workflowType?: WorkflowType;
  /** Message callback */
  onMessage?: (message: unknown) => void;
}

/**
 * Execute workflow with full CLI integration
 *
 * Wraps the core executeWorkflow with:
 * - Automatic provider creation
 * - Workflow lifecycle tracking (start/complete)
 * - workflowType support
 */
export async function executeWorkflow(
  task: string,
  cwd: string,
  options: CliWorkflowOptions = {}
): Promise<{ plan: WorkflowPlan; results: AgentResult[] }> {
  const { tracker, workflowType = "custom", ...coreOptions } = options;

  // Start workflow tracking
  tracker?.startWorkflow?.(workflowType, task.slice(0, 100), { task });

  try {
    // Create provider
    const provider = new ClaudeAgentProvider();

    // Execute using core
    const result = await coreExecuteWorkflow(task, cwd, provider, {
      ...coreOptions,
      tracker,
      onPlanComplete: (plan) => {
        // Track plan completion
        tracker?.planCompleted?.(plan);
        coreOptions.onPlanComplete?.(plan);
      },
      onStepStart: (step, index) => {
        tracker?.startStep?.(index);
        coreOptions.onStepStart?.(step, index);
      },
      onStepComplete: (step, result, index) => {
        tracker?.completeStep?.(index, result);
        coreOptions.onStepComplete?.(step, result, index);
      },
    });

    // Complete workflow tracking
    const allSuccess = result.results.every((r) => r.success);
    if (allSuccess) {
      tracker?.completeWorkflow?.(`Completed ${result.results.length} steps`);
    } else {
      const lastError = result.results.find((r) => !r.success)?.error;
      tracker?.failWorkflow?.(lastError || "Workflow failed");
    }

    return result;
  } catch (error) {
    // Track failure
    tracker?.failWorkflow?.(error instanceof Error ? error.message : "Unknown error");
    throw error;
  }
}
