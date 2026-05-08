import type { ToolDefinition, ToolCall } from "../llm/adapter";
import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";

interface JSONSchema {
  type: "object" | "array" | "string" | "number" | "boolean";
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: unknown[];
  description?: string;
}

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

export type { ToolDefinition, ToolCall, AgentTool };

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

export function toolDefinitionToAgentTool(definition: ToolDefinition): AgentTool {
  return {
    name: definition.function.name,
    label: definition.function.name,
    description: definition.function.description,
    parameters: Type.Object({}, { additionalProperties: true }),
    execute: async () => ({
      content: [{ type: "text" as const, text: `${definition.function.name} is not implemented yet` }],
      details: { stub: true },
    }),
  };
}

export function agentToolToToolDefinition(tool: AgentTool): ToolDefinition {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {},
    },
  };
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
