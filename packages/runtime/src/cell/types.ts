export type CellId = string;

export type CellStatus = "idle" | "running" | "completed" | "failed" | "suspended";

export interface CellConfig {
  timeout?: number;
  maxToolCalls?: number;
  metadata?: Record<string, unknown>;
}

export interface StateChange {
  path: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: Date;
}

export interface ToolCallRecord {
  toolName: string;
  params: unknown;
  result: unknown;
  durationMs: number;
  timestamp: Date;
}

export interface CellMetrics {
  startTime: Date;
  endTime: Date;
  durationMs: number;
  tokenCount?: number;
  toolCallCount: number;
  costUsd?: number;
}

export interface CellResult {
  success: boolean;
  output: unknown;
  stateChanges: StateChange[];
  toolCalls: ToolCallRecord[];
  metrics: CellMetrics;
}

export interface Task {
  id: string;
  type: string;
  description: string;
  input: unknown;
  priority: number;
  metadata?: Record<string, unknown>;
}
