import type { ToolDefinition, ToolCall } from "../llm/adapter";
import type { JSONSchema } from "../prompts/template";
import type { AgentTool } from "@mariozechner/pi-agent-core";

export interface Tool<TParams = Record<string, unknown>, TResult = unknown> {
  name: string;
  description: string;
  parameters: ToolParameterSchema | JSONSchema;
  execute(params: TParams, context: ToolContext): Promise<TResult>;
  validate?(params: unknown): params is TParams;
  category?: string;
  version?: string;
  hasSideEffects?: boolean;
  requiredPermissions?: string[];
}

export interface ToolParameterSchema {
  type: "object" | "array" | "string" | "number" | "boolean";
  properties?: Record<string, PropertySchema>;
  required?: string[];
  items?: ToolParameterSchema;
  enum?: (string | number | boolean)[];
  description?: string;
}

export type { JSONSchema, ToolDefinition, ToolCall, AgentTool };

export interface PropertySchema {
  type: "string" | "number" | "boolean" | "array" | "object";
  description?: string;
  enum?: (string | number | boolean)[];
  items?: PropertySchema;
  properties?: Record<string, PropertySchema>;
  required?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
}

export interface ToolContext {
  sessionId: string;
  agentId: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
  permissions: Set<string>;
  timeout?: number;
  abortSignal?: AbortSignal;
}

export interface ToolExecutionResult<TResult = unknown> {
  success: boolean;
  data?: TResult;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  duration: number;
  metadata?: Record<string, unknown>;
}

/** @deprecated ToolCall 사용 권장 */
export interface FunctionCallRequest {
  id: string;
  name: string;
  arguments: string;
}

export interface FunctionCallResponse {
  id: string;
  result: string;
  error?: string;
}
