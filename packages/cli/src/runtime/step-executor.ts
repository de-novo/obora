/**
 * StepExecutor — bridges workflow Step to BaseAgent.execute()
 *
 * Re-exports the SDK's StepExecutor class so CLI consumers have a single
 * import path for both the LLM-direct executor and the agent-based runner.
 */

// Re-export SDK StepExecutor and related types
export { StepExecutor, BUILTIN_TOOLS } from "@obora/sdk";
export type {
  StepToolHandler as ToolHandler,
  StepContext,
  StepExecutorConfig,
  LLMAdapterLike,
} from "@obora/sdk";

import { type AgentConfig, RetryExhaustedError, SkillLoader, SkillRegistry } from "@obora/adapters";
import { OboraError, type ErrorCode } from "@obora/runtime";
import type { BaseAgent, Task, TaskResult, AgentContext, Step } from "@obora/runtime";

import { calculateDelay, waitWithAbort } from "./retry-policy.js";
import type { StepErrorMetadata } from "./types.js";
import { parseDuration } from "./utils.js";

export interface StepResult {
  success: boolean;
  output?: string;
  error?: string;
  diagnosisCode?: ErrorCode;
  errorMeta?: StepErrorMetadata;
}

export interface AgentResolver {
  resolve(agentName: string): BaseAgent | Promise<BaseAgent>;
  resolve(query: {
    agent?: string;
    type?: string;
    config?: AgentConfig;
  }): BaseAgent | Promise<BaseAgent>;
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

function isRetryExhaustedError(error: unknown): error is RetryExhaustedError {
  return typeof RetryExhaustedError === "function" && error instanceof RetryExhaustedError;
}

function buildStepErrorMetadata(error: Error, diagnosisCode: ErrorCode): StepErrorMetadata {
  const errorWithMeta = error as Error & {
    provider?: string;
    statusCode?: number;
    attempts?: number;
  };

  const retryLastError = (() => {
    if (!isRetryExhaustedError(error)) return undefined;

    const retryError = error as RetryExhaustedError & {
      getLastErrorCode?: () => string | undefined;
      getRootCause?: () => unknown;
      lastError?: { lastErrorCode?: string };
    };

    const lastErrorCode = retryError.getLastErrorCode?.() ?? retryError.lastError?.lastErrorCode;
    if (lastErrorCode?.startsWith("E4")) {
      return lastErrorCode as ErrorCode;
    }

    const rootCause =
      retryError.getRootCause?.() ?? retryError.originalError ?? retryError.lastError;
    return mapErrorToDiagnosis(rootCause);
  })();

  return {
    code: diagnosisCode as StepErrorMetadata["code"],
    message: error.message,
    provider: errorWithMeta.provider,
    statusCode: errorWithMeta.statusCode,
    attempts: isRetryExhaustedError(error) ? error.attempts : errorWithMeta.attempts,
    lastError: retryLastError,
    failedAt: new Date().toISOString(),
  };
}

function mapErrorToDiagnosis(error: unknown): ErrorCode {
  if (isRetryExhaustedError(error)) return "E4005";
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

const DEFAULT_TIMEOUT_MS = 600_000;

export interface ExecuteStepOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  retryAttempts?: number;
  resolvedAgentConfig?: AgentConfig;
  onEvent?: (event: unknown) => void;
}

async function executeOnce(
  step: Step,
  agent: BaseAgent,
  context: AgentContext,
  timeoutMs: number,
  externalSignal?: AbortSignal,
  onEvent?: (event: unknown) => void
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

  const cleanupState = {
    abortHandler: undefined as (() => void) | undefined,
    unsubscribe: undefined as (() => void) | undefined,
  };

  try {
    const subscribable = agent as BaseAgent & {
      subscribe?: (listener: (event: unknown) => void) => () => void;
    };
    if (typeof subscribable.subscribe === "function") {
      cleanupState.unsubscribe = subscribable.subscribe((event: unknown) => {
        onEvent?.(event);
      });
    }

    const result = await Promise.race([
      agent.execute(taskToRun(step), {
        ...context,
        signal,
      } as AgentContext),
      new Promise<never>((_resolve, reject) => {
        cleanupState.abortHandler = () => reject(new DOMException("Aborted", "AbortError"));
        signal.addEventListener("abort", cleanupState.abortHandler, { once: true });
      }),
    ]);

    if (!result.success) {
      const diagnosisCode: ErrorCode = externalSignal?.aborted
        ? "E4006"
        : timeoutCtrl.signal.aborted
          ? "E4002"
          : result.error
            ? mapErrorToDiagnosis(result.error)
            : "E4001";

      return {
        success: false,
        output: formatOutput(result),
        error: result.error?.message,
        diagnosisCode,
        ...(result.error ? { errorMeta: buildStepErrorMetadata(result.error, diagnosisCode) } : {}),
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
    if (cleanupState.abortHandler) {
      signal.removeEventListener("abort", cleanupState.abortHandler);
    }
    cleanupState.unsubscribe?.();
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
  options?: ExecuteStepOptions
): Promise<StepResult> {
  const agent = await (async (): Promise<BaseAgent | undefined> => {
    try {
      return await resolver.resolve({
        agent: step.agent,
        type: step.agent,
        config: options?.resolvedAgentConfig,
      });
    } catch {
      return undefined;
    }
  })();
  if (!agent) {
    return {
      success: false,
      error: `Agent resolution failed for '${step.agent}'`,
      diagnosisCode: "E4003",
    };
  }

  const skillLoader = new SkillLoader(new SkillRegistry({ cwd: process.cwd() }));

  const loadedSkills =
    step.skills && step.skills.length > 0
      ? await skillLoader.loadSkills(step.skills, {
          cwd: process.cwd(),
          agentId: agent.id,
          stepName: step.name,
        })
      : undefined;

  if (loadedSkills) {
    const configurable = agent as BaseAgent & {
      configureRuntimeExtensions?: (input: {
        tools?: unknown[];
        systemPromptAppend?: string;
      }) => void;
    };

    configurable.configureRuntimeExtensions?.({
      tools: loadedSkills.tools,
      systemPromptAppend: loadedSkills.systemPrompt,
    });
  }

  const timeoutMs =
    options?.timeoutMs != null
      ? options.timeoutMs
      : step.timeout
        ? (() => {
            try {
              return parseDuration(step.timeout);
            } catch {
              return DEFAULT_TIMEOUT_MS;
            }
          })()
        : DEFAULT_TIMEOUT_MS;

  try {
    const maxAttempts = Math.max(1, (options?.retryAttempts ?? 0) + 1);
    const runAttempt = async (attempt: number): Promise<StepResult> => {
      const result = await executeOnce(
        step,
        agent,
        context,
        timeoutMs,
        options?.signal,
        options?.onEvent
      );
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
      return runAttempt(attempt + 1);
    };

    return await runAttempt(1);
  } finally {
    if (loadedSkills) {
      await skillLoader.teardown(loadedSkills.loaded);
    }
    const configurable = agent as BaseAgent & { clearRuntimeExtensions?: () => void };
    configurable.clearRuntimeExtensions?.();
  }
}
