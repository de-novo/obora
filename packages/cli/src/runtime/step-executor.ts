/**
 * StepExecutor — bridges workflow Step to BaseAgent.execute()
 */

import type { Step } from "@obora/core";
import type { AgentConfig } from "@obora-kit/agents";
import { OboraError, type ErrorCode } from "@obora/core";
import {
  type BaseAgent,
  type Task,
  type TaskResult,
  type AgentContext,
  RetryExhaustedError,
} from "@obora-kit/agents";
import type { StepErrorMetadata } from "./types.js";
import { parseDuration } from "./utils.js";
import { calculateDelay, waitWithAbort } from "./retry-policy.js";

export interface StepResult {
  success: boolean;
  output?: string;
  error?: string;
  diagnosisCode?: ErrorCode;
  errorMeta?: StepErrorMetadata;
}

export interface AgentResolver {
  resolve(agentName: string): BaseAgent | Promise<BaseAgent>;
  resolve(query: { agent?: string; type?: string; config?: AgentConfig }): BaseAgent | Promise<BaseAgent>;
}

export { parseDuration } from "./utils.js";

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
  };

  const retryLastError = (() => {
    if (!(error instanceof RetryExhaustedError)) return undefined;

    const retryError = error as RetryExhaustedError & {
      getLastErrorCode?: () => string | undefined;
      getRootCause?: () => unknown;
      lastError?: { lastErrorCode?: string };
    };

    const lastErrorCode =
      retryError.getLastErrorCode?.() ?? retryError.lastError?.lastErrorCode;
    if (lastErrorCode?.startsWith("E4")) {
      return lastErrorCode as ErrorCode;
    }

    const rootCause = retryError.getRootCause?.() ?? retryError.originalError ?? retryError.lastError;
    return mapErrorToDiagnosis(rootCause);
  })();

  return {
    code: diagnosisCode as StepErrorMetadata["code"],
    message: error.message,
    provider: errorWithMeta.provider,
    statusCode: errorWithMeta.statusCode,
    attempts: error instanceof RetryExhaustedError ? error.attempts : errorWithMeta.attempts,
    lastError: retryLastError,
    failedAt: new Date().toISOString(),
  };
}

function mapErrorToDiagnosis(error: unknown): ErrorCode {
  if (error instanceof RetryExhaustedError) return "E4005";
  if (error instanceof DOMException && error.name === "AbortError") return "E4002";

  // Preserve agent-layer error codes (E4010, E4012, E4013)
  if (error instanceof OboraError && error.code) {
    return error.code;
  }

  // Aggregate provider-internal rate-limit code to retry-exhausted diagnosis
  if (error instanceof Error && "code" in error) {
    const code = (error as Error & { code?: unknown }).code;
    if (code === "E4011") {
      return "E4005";
    }
  }

  // Preserve typed E4xxx codes on generic Error objects
  if (error instanceof Error && "code" in error) {
    const code = (error as Error & { code?: unknown }).code;
    if (typeof code === "string" && code.startsWith("E4")) {
      return code as ErrorCode;
    }
  }

  // Preserve typed E4xxx codes on plain objects (e.g. RetryErrorMetadata)
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && code.startsWith("E4")) {
      return code as ErrorCode;
    }
  }

  return "E4001";
}

const DEFAULT_TIMEOUT_MS = 60_000;

export interface ExecuteStepOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  retryAttempts?: number;
  resolvedAgentConfig?: AgentConfig;
}

async function executeOnce(
  step: Step,
  agent: BaseAgent,
  context: AgentContext,
  timeoutMs: number,
  externalSignal?: AbortSignal,
): Promise<StepResult> {
  const timeoutCtrl = new AbortController();

  if (externalSignal?.aborted) {
    return {
      success: false,
      error: "Execution cancelled before start",
      diagnosisCode: "E4006",
    };
  }

  const timeoutId = setTimeout(() => timeoutCtrl.abort("timeout"), timeoutMs);
  const signal = externalSignal
    ? AbortSignal.any([externalSignal, timeoutCtrl.signal])
    : timeoutCtrl.signal;

  if (signal.aborted) {
    return {
      success: false,
      error: "Execution cancelled before start",
      diagnosisCode: "E4006",
    };
  }

  let abortHandler: (() => void) | undefined;

  let unsubscribe: (() => void) | undefined;

  try {
    const subscribable = agent as BaseAgent & { subscribe?: (listener: (event: unknown) => void) => () => void };
    if (typeof subscribable.subscribe === "function") {
      unsubscribe = subscribable.subscribe((_event) => {
        // event stream hook: reserved for runtime progress/DB integration
      });
    }

    const result = await Promise.race([
      agent.execute(taskToRun(step), {
        ...context,
        signal,
      } as AgentContext),
      new Promise<never>((_resolve, reject) => {
        abortHandler = () => reject(new DOMException("Aborted", "AbortError"));
        signal.addEventListener("abort", abortHandler, { once: true });
      }),
    ]);

    if (!result.success) {
      let diagnosisCode: ErrorCode;
      if (externalSignal?.aborted) {
        diagnosisCode = "E4006";
      } else if (timeoutCtrl.signal.aborted) {
        diagnosisCode = "E4002";
      } else {
        diagnosisCode = result.error ? mapErrorToDiagnosis(result.error) : "E4001";
      }

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

    return { success: true, output: formatOutput(result) };
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") {
      if (timeoutCtrl.signal.aborted) {
        return {
          success: false,
          error: "Timeout exceeded",
          diagnosisCode: "E4002",
        };
      }
      return {
        success: false,
        error: "Execution cancelled",
        diagnosisCode: "E4006",
      };
    }

    const diagnosisCode = mapErrorToDiagnosis(e);
    return {
      success: false,
      error: e instanceof Error ? e.message : String(e),
      diagnosisCode,
      ...(e instanceof Error ? { errorMeta: buildStepErrorMetadata(e, diagnosisCode) } : {}),
    };
  } finally {
    if (abortHandler) {
      signal.removeEventListener("abort", abortHandler);
    }
    unsubscribe?.();
    clearTimeout(timeoutId);
  }
}

function taskToRun(step: Step): Task {
  return stepToTask(step);
}

export async function executeStep(
  step: Step,
  resolver: AgentResolver,
  context: AgentContext,
  options?: ExecuteStepOptions,
): Promise<StepResult> {
  let agent: BaseAgent;
  try {
    agent = await resolver.resolve({
      agent: step.agent,
      type: step.agent,
      config: options?.resolvedAgentConfig,
    });
  } catch {
    return {
      success: false,
      error: `Agent resolution failed for '${step.agent}'`,
      diagnosisCode: "E4003",
    };
  }

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

  const maxAttempts = Math.max(1, (options?.retryAttempts ?? 0) + 1);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await executeOnce(step, agent, context, timeoutMs, options?.signal);
    if (result.success) return result;

    const retryable = result.diagnosisCode === "E4001";
    if (!retryable || attempt >= maxAttempts) {
      return result;
    }

    const continuable = agent as BaseAgent & { continue?: () => Promise<void> };
    if (typeof continuable.continue === "function") {
      try {
        await continuable.continue();
      } catch {
        // continue() best-effort, fallback to delay retry
      }
    }

    const delay = calculateDelay(attempt - 1, {
      baseDelayMs: 1000,
      maxDelayMs: 30_000,
    });

    try {
      await waitWithAbort(delay, options?.signal);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return {
          success: false,
          error: "Execution cancelled",
          diagnosisCode: "E4006",
        };
      }
      throw e;
    }
  }

  return {
    success: false,
    error: "Unknown execution failure",
    diagnosisCode: "E4001",
  };
}
