import { CollaborationPatternBase, type BuiltinPatternKind, type PatternPayloadResult, type PatternRuntimeContext } from "../types.js";

export class PipelinePattern extends CollaborationPatternBase {
  readonly name = "pipeline";
  readonly kind: BuiltinPatternKind = "pipeline";

  protected async onExecute(context: PatternRuntimeContext): Promise<PatternPayloadResult> {
    const steps = context.steps ?? [];
    let current = context.input;

    for (const step of steps) {
      current = await step(current);
    }

    return {
      success: true,
      output: current,
      metadata: { steps: steps.length },
    };
  }
}
