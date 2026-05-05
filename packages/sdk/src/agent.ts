export interface AgentContext<TInput = unknown, TVariables extends Record<string, unknown> = Record<string, unknown>> {
  executionId: string;
  stepName: string;
  input: TInput;
  variables?: TVariables;
}

export interface AgentResult<TOutput = unknown> {
  output: TOutput;
  metadata?: Record<string, unknown>;
}

export abstract class Agent<TInput = unknown, TOutput = unknown> {
  abstract readonly name: string;
  abstract execute(ctx: AgentContext<TInput>): Promise<AgentResult<TOutput>>;
}
