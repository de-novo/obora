import type { AgentContext, AgentResult } from "../agent.js";
import { Agent } from "../agent.js";

export type StepHandler = (ctx: AgentContext) => AgentResult | Promise<AgentResult>;

export class MockAgent extends Agent {
  readonly name: string;
  private readonly stepHandlers = new Map<string, StepHandler>();
  private readonly defaultHandler?: StepHandler;
  private readonly callLog: Array<{ stepName: string; ctx: AgentContext }> = [];

  constructor(name: string, defaultHandler?: StepHandler) {
    super();
    this.name = name;
    this.defaultHandler = defaultHandler;
  }

  onStep(stepName: string, handler: StepHandler): this {
    this.stepHandlers.set(stepName, handler);
    return this;
  }

  async execute(ctx: AgentContext): Promise<AgentResult> {
    this.callLog.push({ stepName: ctx.stepName, ctx });

    const handler = this.stepHandlers.get(ctx.stepName) ?? this.defaultHandler;
    if (!handler) {
      return { output: null, metadata: { mock: true, unhandled: true } };
    }

    return handler(ctx);
  }

  get calls(): ReadonlyArray<{ stepName: string; ctx: AgentContext }> {
    return this.callLog;
  }

  calledWith(stepName: string): boolean {
    return this.callLog.some((call) => call.stepName === stepName);
  }

  callCount(stepName?: string): number {
    if (stepName) {
      return this.callLog.filter((call) => call.stepName === stepName).length;
    }

    return this.callLog.length;
  }

  reset(): void {
    this.callLog.length = 0;
  }
}
