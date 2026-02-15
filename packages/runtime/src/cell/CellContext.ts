import type { CellConfig, CellId } from "./types.js";

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

export interface CellContext {
  cellId: CellId;
  blackboard: StateAccessor;
  tools: ToolSet;
  audit: AuditRecorder;
  config: CellConfig;
}
