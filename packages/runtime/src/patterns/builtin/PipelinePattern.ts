import { CollaborationPatternBase, type BuiltinPatternKind, type PatternPayloadResult, type PatternRuntimeContext } from "../types.js";

export class PipelinePattern extends CollaborationPatternBase {
  readonly name = "pipeline";
  readonly kind: BuiltinPatternKind = "pipeline";

  protected async onExecute(context: PatternRuntimeContext): Promise<PatternPayloadResult> {
    const steps = context.steps ?? [];
    const output = await steps.reduce<Promise<unknown>>(
      (current, step) => current.then((value) => step(value)),
      Promise.resolve(context.input)
    );

    return {
      success: true,
      output,
      metadata: { steps: steps.length },
    };
  }
}
