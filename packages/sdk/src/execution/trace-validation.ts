import { z } from "zod";
import { Effect, Either } from "effect";

const DependencySchema = z.object({
  step: z.string().min(1),
  purpose: z.string().min(1),
});

export const ExecutionTraceSchema = z.object({
  step: z.string().min(1),
  agent: z.string().min(1),
  timestamp: z.string().datetime(),
  version: z.string().min(1),

  task_summary: z.string().min(1),
  methodology: z.string().min(1),
  tools_used: z.array(z.string()),

  key_decisions: z.array(z.string()),
  decision_rationale: z.string(),
  alternatives_considered: z.array(z.string()),

  assumptions: z.array(z.string()),
  constraints: z.array(z.string()),
  risks_identified: z.array(z.string()),

  inputs_processed: z.array(z.string()),
  dependencies_used: z.array(DependencySchema),

  output_summary: z.string().min(1),
  output_format: z.string().min(1),
  artifacts_created: z.array(z.string()),
  metrics: z.record(z.string(), z.unknown()).optional(),

  issues_encountered: z.array(z.string()),
  workarounds_applied: z.array(z.string()),
  confidence_level: z.enum(["high", "medium", "low"]),
  known_limitations: z.array(z.string()),

  implications_for_next: z.array(z.string()),
  recommended_next: z.array(z.string()),
  open_questions: z.array(z.string()),
  context_for_successors: z.string().min(1),
});

export type ValidatedExecutionTrace = z.infer<typeof ExecutionTraceSchema>;

export class TraceValidationError {
  readonly _tag = "TraceValidationError";
  constructor(
    readonly stepName: string,
    readonly issues: Array<{ path: string; message: string }>
  ) {}
}

export const validateTrace = (
  trace: Record<string, unknown>,
  stepName: string
): Effect.Effect<ValidatedExecutionTrace, TraceValidationError, never> =>
  Effect.gen(function* () {
    const parseResult = yield* Effect.sync(() =>
      ExecutionTraceSchema.safeParse(trace)
    );

    if (!parseResult.success) {
      const issues = parseResult.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      return yield* Effect.fail(new TraceValidationError(stepName, issues));
    }

    return parseResult.data;
  });

export const validateTraceSync = (
  trace: Record<string, unknown>,
  stepName: string
): { success: true; data: ValidatedExecutionTrace } | { success: false; error: TraceValidationError } => {
  const result = Effect.runSync(Effect.either(validateTrace(trace, stepName)));

  return Either.isRight(result)
    ? { success: true, data: result.right }
    : { success: false, error: result.left };
};
