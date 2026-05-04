import type { WorkflowStep } from "../../workflow.js";
import type { StepContext, StepResult } from "../../step-executor-types.js";
import type { StepExecutionServices } from "./types.js";

export const defaultStrategy = {
  pattern: "default",

  async execute(
    step: WorkflowStep,
    context: StepContext,
    services: StepExecutionServices
  ): Promise<StepResult> {
    const response = await services.requestForStep(step, context, step.agent);
    const output = services.parseStepOutputContract(
      step,
      services.parseStructuredStepOutput(
        step,
        response.message.content ?? ""
      )
    );
    await services.persistStepOutput(step, output);
    return {
      output,
      raw: response,
    };
  },
} as const;
