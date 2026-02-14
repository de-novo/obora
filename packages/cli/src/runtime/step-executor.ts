/**
 * StepExecutor — bridges workflow Step to BaseAgent.execute()
 *
 * Responsibilities:
 * - Convert Step (core) → Task (agents)
 * - Invoke BaseAgent.execute() with timeout/abort
 * - Map errors to diagnosis codes (E4001/E4002)
 * - Return StepResult (never writes status.yaml — single-writer policy)
 *
 * @module @obora/cli/runtime/step-executor
 */

import type { Step } from "@obora/core";
import { type ErrorCode } from "@obora/core";
import {
  type BaseAgent,
  type Task,
  type TaskResult,
  type AgentContext,
  RetryExhaustedError,
} from "@obora-kit/agents";
import type { StepErrorMetadata } from "./types.js";

/** Result of a single step execution */
export interface StepResult {
  success: boolean;
  output?: string;
  error?: string;
  diagnosisCode?: ErrorCode;
  errorMeta?: StepErrorMetadata;
}

/**
 * Resolves a step's agent name to a BaseAgent instance.
 * Implementation provided by TASK-043b; for now callers inject a stub/mock.
 */
export interface AgentResolver {
  resolve(agentName: string): BaseAgent;
  resolve(query: { agent?: string; type?: string }): BaseAgent;
}

// ---------------------------------------------------------------------------
// Step → Task conversion
// ---------------------------------------------------------------------------

/**
 * Parse a duration string (e.g. "60s", "5m", "1h") to milliseconds.
 */
export function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }
  const value = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * multipliers[unit];
}

/**
 * Convert a workflow Step (core) to an agent Task (agents).
 */
export function stepToTask(step: Step): Task {
  return {
    id: step.name,
    type: step.agent,
    description: step.description ?? step.name,
    input: step.config ?? {},
    priority: 1,
    metadata: {
      inputs: step.inputs,
      outputs: step.outputs,
    },
  };
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function formatOutput(result: TaskResult): string {
  if (typeof result.output === "string") return result.output;
  if (result.output == null) return "";
  return JSON.stringify(result.output, null, 2);
}

function buildStepErrorMetadata(error: Error, diagnosisCode: ErrorCode): StepErrorMetadata {
  const errorWithMeta = error as Error & {
    provider?: string;
    statusCode?: number;
    attempts?: number;
    originalError?: Error;
  };

  return {
    code: diagnosisCode,
    message: error.message,
    provider: errorWithMeta.provider,
    statusCode: errorWithMeta.statusCode,
    attempts:
      error instanceof RetryExhaustedError
        ? error.attempts
        : errorWithMeta.attempts,
    lastError:
      error instanceof RetryExhaustedError
        ? error.originalError?.message
        : errorWithMeta.originalError?.message,
  };
}

// ---------------------------------------------------------------------------
// Error → diagnosis code mapping
// ---------------------------------------------------------------------------

function mapErrorToDiagnosis(error: Error): ErrorCode {
  if (error instanceof RetryExhaustedError) {
    return "E4005";
  }
  // All non-timeout runtime errors from BaseAgent map to E4001
  return "E4001";
}

// ---------------------------------------------------------------------------
// StepExecutor
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 60_000;

export interface ExecuteStepOptions {
  /** Override timeout in ms (default: step.timeout parsed, or 60 s) */
  timeoutMs?: number;
}

/**
 * Execute a single workflow step by delegating to a BaseAgent.
 *
 * This function does NOT write to status.yaml (single-writer policy).
 * The caller (executeWorkflow) is responsible for persisting results.
 */
export async function executeStep(
  step: Step,
  resolver: AgentResolver,
  context: AgentContext,
  options?: ExecuteStepOptions,
): Promise<StepResult> {
  // --- resolve agent (E4003 on failure) ---
  let agent: BaseAgent;
  try {
    agent = resolver.resolve({ agent: step.agent });
  } catch {
    return {
      success: false,
      error: `Agent resolution failed for '${step.agent}'`,
      diagnosisCode: "E4003",
    };
  }

  // --- compute timeout (caller override > step YAML > default) ---
  let timeoutMs: number;
  if (options?.timeoutMs != null) {
    timeoutMs = options.timeoutMs;
  } else if (step.timeout) {
    try {
      timeoutMs = parseDuration(step.timeout);
    } catch {
      timeoutMs = DEFAULT_TIMEOUT_MS;
    }
  } else {
    timeoutMs = DEFAULT_TIMEOUT_MS;
  }

  // --- execute with abort ---
  const task = stepToTask(step);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  let result: TaskResult;
  let abortHandler: (() => void) | undefined;

  try {
    // BaseAgent.execute() currently has (task, context) signature.
    // Signal propagation will be added when agents package adopts ExecuteOptions.
    // For now we race against the abort timer externally.
    result = await Promise.race([
      agent.execute(task, context),
      new Promise<never>((_resolve, reject) => {
        abortHandler = () => reject(new DOMException("Step timeout exceeded", "AbortError"));
        ac.signal.addEventListener("abort", abortHandler, { once: true });
      }),
    ]);
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return {
        success: false,
        error: "Timeout exceeded",
        diagnosisCode: "E4002",
      };
    }
    const diagnosisCode = e instanceof Error ? mapErrorToDiagnosis(e) : "E4001";
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      diagnosisCode,
      ...(e instanceof Error
        ? { errorMeta: buildStepErrorMetadata(e, diagnosisCode) }
        : {}),
    };
  } finally {
    clearTimeout(timer);
    if (abortHandler) {
      ac.signal.removeEventListener("abort", abortHandler);
    }
  }

  // --- map result ---
  if (!result.success) {
    const diagnosisCode = result.error ? mapErrorToDiagnosis(result.error) : "E4001";
    return {
      success: false,
      output: formatOutput(result),
      error: result.error?.message,
      diagnosisCode,
      ...(result.error
        ? { errorMeta: buildStepErrorMetadata(result.error, diagnosisCode) }
        : {}),
    };
  }

  return {
    success: true,
    output: formatOutput(result),
  };
}
