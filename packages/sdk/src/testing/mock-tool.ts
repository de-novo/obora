export interface ToolContext {
  executionId: string;
  stepName: string;
}

export type ToolExecutor = (params: unknown, ctx: ToolContext) => unknown | Promise<unknown>;

export class MockTool {
  readonly name: string;
  private readonly executor: ToolExecutor;
  private readonly callLog: Array<{ params: unknown; ctx: ToolContext }> = [];

  constructor(name: string, executor: ToolExecutor) {
    this.name = name;
    this.executor = executor;
  }

  async execute(params: unknown, ctx: ToolContext): Promise<unknown> {
    this.callLog.push({ params, ctx });
    return this.executor(params, ctx);
  }

  get calls(): ReadonlyArray<{ params: unknown; ctx: ToolContext }> {
    return this.callLog;
  }

  calledWith(params: unknown): boolean {
    return this.callLog.some((call) => JSON.stringify(call.params) === JSON.stringify(params));
  }

  callCount(): number {
    return this.callLog.length;
  }

  reset(): void {
    this.callLog.length = 0;
  }
}
