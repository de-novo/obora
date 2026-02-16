import type { CellConfig, CellId, Task } from "./types.js";

export interface StateAccessor {
  read(path: string): unknown;
  write(path: string, value: unknown): void;
}

export interface ToolSet {
  invoke(toolName: string, params: unknown): Promise<unknown>;
}

export interface AuditRecorder {
  record(eventType: string, data: Record<string, unknown>): Promise<void> | void;
}

export interface ToolCallPreHookInput {
  cellId: CellId;
  toolName: string;
  params: unknown;
  task: Task;
}

export interface ToolCallPostHookInput extends ToolCallPreHookInput {
  durationMs: number;
  result?: unknown;
  error?: Error;
}

export interface CellPolicyHooks {
  beforeExecute?(task: Task): Promise<void> | void;
  afterExecute?(task: Task, outcome: { success: boolean; output: unknown }): Promise<void> | void;
  beforeToolCall?(input: ToolCallPreHookInput): Promise<void> | void;
  afterToolCall?(input: ToolCallPostHookInput): Promise<void> | void;
}

export interface CellContext {
  cellId: CellId;
  blackboard: StateAccessor;
  tools: ToolSet;
  audit: AuditRecorder;
  policy?: CellPolicyHooks;
  config: CellConfig;
}
