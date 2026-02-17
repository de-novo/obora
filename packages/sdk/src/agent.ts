export interface AgentContext {
  executionId: string;
  stepName: string;
  input: unknown;
  variables?: Record<string, unknown>;
}

export interface AgentResult {
  output: unknown;
  metadata?: Record<string, unknown>;
}

export abstract class Agent {
  abstract readonly name: string;
  abstract execute(ctx: AgentContext): Promise<AgentResult>;
}
