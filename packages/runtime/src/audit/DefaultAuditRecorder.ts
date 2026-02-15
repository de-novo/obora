import type { AuditRecorder, AuditTrail } from "./AuditTrail.js";

export class DefaultAuditRecorder implements AuditRecorder {
  constructor(
    private readonly trail: AuditTrail,
    private readonly executionId: string,
    private readonly cellId: string,
  ) {}

  async recordToolCall(
    toolName: string,
    params: unknown,
    result: unknown,
    durationMs: number,
  ): Promise<void> {
    const now = new Date();

    await this.trail.record({
      id: crypto.randomUUID(),
      executionId: this.executionId,
      cellId: this.cellId,
      timestamp: now,
      type: "tool_call",
      data: {
        toolName,
        params,
      },
    });

    await this.trail.record({
      id: crypto.randomUUID(),
      executionId: this.executionId,
      cellId: this.cellId,
      timestamp: new Date(),
      type: "tool_result",
      data: {
        toolName,
        result,
      },
      metadata: {
        durationMs,
      },
    });
  }

  async recordStateChange(path: string, oldValue: unknown, newValue: unknown): Promise<void> {
    await this.trail.record({
      id: crypto.randomUUID(),
      executionId: this.executionId,
      cellId: this.cellId,
      timestamp: new Date(),
      type: "state_change",
      data: {
        path,
        oldValue,
        newValue,
      },
    });
  }

  async recordError(code: string, message: string, context?: unknown): Promise<void> {
    await this.trail.record({
      id: crypto.randomUUID(),
      executionId: this.executionId,
      cellId: this.cellId,
      timestamp: new Date(),
      type: "error",
      data: {
        code,
        message,
        context,
      },
    });
  }
}
