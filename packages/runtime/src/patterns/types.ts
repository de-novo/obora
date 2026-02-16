export interface PatternContext {
  steps?: Array<(input: unknown) => unknown | Promise<unknown>>;
  input?: unknown;
  [key: string]: unknown;
}

export interface PatternResult {
  success: boolean;
  output: unknown;
  metadata?: Record<string, unknown>;
}

export interface CollaborationPattern {
  name: string;
  execute(context: PatternContext): Promise<PatternResult>;
}
