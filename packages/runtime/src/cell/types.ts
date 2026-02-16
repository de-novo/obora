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
  id: string;
  toolName: string;
  params: unknown;
  status: "success" | "error";
  result?: unknown;
  error?: string;
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
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
