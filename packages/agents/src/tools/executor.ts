import {
  FunctionCallRequest,
  FunctionCallResponse,
  ToolContext,
  ToolExecutionResult,
} from "./types";
import { ToolRegistry } from "./registry";

export class ToolExecutor {
  constructor(private registry: ToolRegistry) {}

  async handleFunctionCall(
    call: FunctionCallRequest,
    context: ToolContext
  ): Promise<FunctionCallResponse> {
    let params: Record<string, unknown>;

    try {
      params = JSON.parse(call.arguments);
    } catch (e) {
      return {
        id: call.id,
        result: "",
        error: `Invalid JSON arguments: ${(e as Error).message}`,
      };
    }

    const result = await this.registry.execute(call.name, params, context);

    if (result.success) {
      return {
        id: call.id,
        result: JSON.stringify(result.data),
      };
    } else {
      return {
        id: call.id,
        result: "",
        error: result.error?.message ?? "Unknown error",
      };
    }
  }

  async handleFunctionCalls(
    calls: FunctionCallRequest[],
    context: ToolContext
  ): Promise<FunctionCallResponse[]> {
    return Promise.all(calls.map((call) => this.handleFunctionCall(call, context)));
  }

  formatAsMessages(
    responses: FunctionCallResponse[]
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
    const results: ToolExecutionResult[] = [];
    let prevResult: unknown = undefined;

    for (const step of this.steps) {
      const params = typeof step.params === "function" ? step.params(prevResult) : step.params;

      const result = await this.executor.handleFunctionCall(
        {
          id: `chain-${Date.now()}-${results.length}`,
          name: step.toolName,
          arguments: JSON.stringify(params),
        },
        context
      );

      const executionResult: ToolExecutionResult = {
        success: !result.error,
        data: result.error ? undefined : JSON.parse(result.result),
        error: result.error ? { code: "EXECUTION_ERROR", message: result.error } : undefined,
        duration: 0,
      };

      results.push(executionResult);

      if (!executionResult.success) {
        break;
      }

      prevResult = executionResult.data;
    }

    return results;
  }
}
