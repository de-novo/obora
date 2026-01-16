/**
 * Provider-Agnostic Workflow Engine
 *
 * Executes workflows using any AgentProvider implementation
 */

import { z } from "zod";
import type {
  AgentProvider,
  AgentDefinition,
  WorkflowPlan,
  WorkflowStep,
  AgentResult,
  WorkflowTracker,
} from "./types.js";
import { loadAgents, getAgentByName, formatAgentsForPlanner } from "./agent-loader.js";

// ============================================================================
// Workflow Plan Schema
// ============================================================================

const WorkflowStepSchema = z.object({
  agent: z.string(),
  task: z.string(),
  reason: z.string().optional(),
  critical: z.boolean().optional(),
  parallelWith: z.array(z.string()).optional(),
});

const FeedbackLoopSchema = z.object({
  enabled: z.boolean(),
  maxIterations: z.number().int().min(0).max(10).default(3),
});

const WorkflowPlanSchema = z.object({
  analysis: z.string(),
  workflow: z.array(WorkflowStepSchema).min(1),
  feedbackLoop: FeedbackLoopSchema.optional(),
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract JSON from LLM output
 *
 * Supports:
 * 1. Code block: ```json ... ``` or ``json ... ``
 * 2. Raw JSON: First complete { ... } object
 */
function extractJsonFromOutput(output: string): unknown | null {
  // 1. Try code block extraction
  const jsonMatch = output.match(/`{2,3}json\n?([\s\S]*?)\n?`{2,3}/);
  if (jsonMatch && jsonMatch[1]) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch {
      // Fall through to raw JSON extraction
    }
  }

  // 2. Extract raw JSON object
  const startIdx = output.indexOf("{");
  if (startIdx === -1) {
    return null;
  }

  let depth = 0;
  let endIdx = startIdx;
  for (let i = startIdx; i < output.length; i++) {
    if (output[i] === "{") depth++;
    else if (output[i] === "}") depth--;
    if (depth === 0) {
      endIdx = i + 1;
      break;
    }
  }

  if (depth !== 0) {
    return null;
  }

  try {
    return JSON.parse(output.slice(startIdx, endIdx));
  } catch {
    return null;
  }
}

// ============================================================================
// Workflow Execution Options
// ============================================================================

export interface ExecuteWorkflowOptions {
  /** Callback when plan is complete */
  onPlanComplete?: (plan: WorkflowPlan) => void;
  /** Callback when a step starts */
  onStepStart?: (step: WorkflowStep, index: number) => void;
  /** Callback when a step completes */
  onStepComplete?: (step: WorkflowStep, result: AgentResult, index: number) => void;
  /** Workflow tracker for DB logging */
  tracker?: WorkflowTracker;
}

// ============================================================================
// Main Workflow Execution
// ============================================================================

/**
 * Execute a complete workflow using the provided AgentProvider
 *
 * @param task - User task/request
 * @param cwd - Working directory
 * @param provider - Agent provider implementation
 * @param options - Execution options
 * @returns Workflow plan and execution results
 */
export async function executeWorkflow(
  task: string,
  cwd: string,
  provider: AgentProvider,
  options?: ExecuteWorkflowOptions
): Promise<{ plan: WorkflowPlan; results: AgentResult[] }> {
  // 1. Load agents
  const agents = loadAgents(cwd);

  // 2. Plan workflow using planner agent
  const plan = await planWorkflow(task, cwd, provider, agents, options);
  options?.onPlanComplete?.(plan);

  // 3. Execute workflow steps
  const results: AgentResult[] = [];

  for (let i = 0; i < plan.workflow.length; i++) {
    const step = plan.workflow[i];
    if (!step) continue;

    options?.onStepStart?.(step, i);

    const agent = getAgentByName(agents, step.agent);
    if (!agent) {
      const errorResult: AgentResult = {
        success: false,
        output: "",
        error: `Agent not found: ${step.agent}`,
      };
      results.push(errorResult);
      continue;
    }

    // Execute agent
    let output = "";
    let error: string | undefined;

    try {
      for await (const message of provider.runAgent(agent, step.task, cwd, {
        tracker: options?.tracker,
      })) {
        if (message.type === "text" || message.type === "result") {
          output += message.content;
        } else if (message.type === "error") {
          error = message.content;
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : "Unknown error";
    }

    const result: AgentResult = { success: !error, output, error };
    results.push(result);
    options?.onStepComplete?.(step, result, i);

    // Stop on critical step failure
    if (!result.success && step.critical) {
      break;
    }
  }

  return { plan, results };
}

/**
 * Plan workflow using planner agent
 */
async function planWorkflow(
  task: string,
  cwd: string,
  provider: AgentProvider,
  agents: Map<string, AgentDefinition>,
  options?: ExecuteWorkflowOptions
): Promise<WorkflowPlan> {
  const planner = getAgentByName(agents, "planner");
  if (!planner) {
    throw new Error("Planner agent not found in .claude/agents/obora/");
  }

  // Build prompt with available agents
  const agentList = formatAgentsForPlanner(agents);
  const enhancedPrompt = `${planner.systemPrompt}

## 현재 사용 가능한 에이전트
${agentList}

## 사용자 요청
${task}

위 에이전트들을 사용하여 최적의 워크플로우를 설계하세요.
반드시 JSON 형식으로 출력하세요.`;

  // Execute planner
  let planOutput = "";
  for await (const message of provider.runAgent(
    { ...planner, systemPrompt: enhancedPrompt },
    task,
    cwd,
    { tracker: options?.tracker }
  )) {
    if (message.type === "text" || message.type === "result") {
      planOutput += message.content;
    }
  }

  // Parse and validate JSON
  const jsonData = extractJsonFromOutput(planOutput);
  if (jsonData) {
    const validated = WorkflowPlanSchema.safeParse(jsonData);
    if (validated.success) {
      return validated.data;
    }
    // Validation failed - log in debug mode
    if (process.env.DEBUG) {
      console.warn("WorkflowPlan validation failed:", validated.error.issues);
    }
  }

  // Fallback plan
  return {
    analysis: planOutput,
    workflow: [
      {
        agent: "explorer",
        task: task,
        reason: "기본 탐색",
      },
    ],
  };
}
