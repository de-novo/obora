import type { CollaborationPattern, PatternContext, PatternResult } from "../types.js";

export class PipelinePattern implements CollaborationPattern {
  readonly name = "pipeline";

  async execute(context: PatternContext): Promise<PatternResult> {
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
