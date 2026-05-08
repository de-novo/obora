import type { ToolCall, ToolContext, ToolExecutionResult } from "./types";
import { ToolRegistry } from "./registry";

export interface ToolCallExecutionResponse {
  id: string;
  result: string;
  error?: string;
}

type ParsedToolArguments =
  | { success: true; params: Record<string, unknown> }
  | { success: false; error: string };

const parseToolArguments = (raw: string): ParsedToolArguments => {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return {
      success: true,
      params:
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {},
    };
  } catch (error) {
    return {
      success: false,
      error: `Invalid JSON arguments: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

const parseToolResponseData = (response: ToolCallExecutionResponse): unknown => {
  if (response.error) {
    return undefined;
  }

  try {
    return response.result ? JSON.parse(response.result) : null;
  } catch {
    return response.result;
  }
};

export class ToolExecutor {
  constructor(private registry: ToolRegistry) {}

  async handleToolCall(
    call: ToolCall,
    context: ToolContext
  ): Promise<ToolCallExecutionResponse> {
    const parsedArguments = parseToolArguments(call.function.arguments);
    if (!parsedArguments.success) {
      return {
        id: call.id,
        result: "",
        error: parsedArguments.error,
      };
    }

    const result = await this.registry.execute(call.function.name, parsedArguments.params, context);

    if (result.success) {
      return {
        id: call.id,
        result: JSON.stringify(result.data ?? null),
      };
    } else {
      return {
        id: call.id,
        result: "",
        error: result.error?.message ?? "Unknown error",
      };
    }
  }

  async handleToolCalls(
    calls: ToolCall[],
    context: ToolContext
  ): Promise<ToolCallExecutionResponse[]> {
    return Promise.all(calls.map((call) => this.handleToolCall(call, context)));
  }

  formatAsMessages(
    responses: ToolCallExecutionResponse[]
  ): Array<{ role: "tool"; content: string; toolCallId: string }> {
    return responses.map((response) => ({
      role: "tool" as const,
      content: response.error ? `Error: ${response.error}` : response.result,
      toolCallId: response.id,
    }));
  }
}

export class ToolExecutionChain {
  private steps: Array<{
    toolName: string;
    params: Record<string, unknown> | ((prev: unknown) => Record<string, unknown>);
  }> = [];

  constructor(private executor: ToolExecutor) {}

  then(
    toolName: string,
    params: Record<string, unknown> | ((prev: unknown) => Record<string, unknown>)
  ): this {
    this.steps.push({ toolName, params });
    return this;
  }

  async execute(context: ToolContext): Promise<ToolExecutionResult[]> {
    const finalState = await this.steps.reduce<
      Promise<{ results: ToolExecutionResult[]; prevResult: unknown; stopped: boolean }>
    >(async (statePromise, step) => {
      const state = await statePromise;
      if (state.stopped) {
        return state;
      }

      const params = typeof step.params === "function" ? step.params(state.prevResult) : step.params;

      const result = await this.executor.handleToolCall(
        {
          id: `chain-${Date.now()}-${state.results.length}`,
          type: "function",
          function: {
            name: step.toolName,
            arguments: JSON.stringify(params),
          },
        },
        context
      );

      const parsedData = parseToolResponseData(result);

      const executionResult: ToolExecutionResult = {
        success: !result.error,
        data: result.error ? undefined : parsedData,
        error: result.error ? { code: "EXECUTION_ERROR", message: result.error } : undefined,
        duration: 0,
      };

      return {
        results: [...state.results, executionResult],
        prevResult: executionResult.data,
        stopped: !executionResult.success,
      };
    }, Promise.resolve({ results: [], prevResult: undefined, stopped: false }));

    return finalState.results;
  }
}
