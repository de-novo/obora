import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import type { WorkflowStep } from "../../workflow.js";
import type { StepContext, StepResult } from "../../step-executor-types.js";
import type { StepExecutionServices } from "./types.js";

function getJudgeStepConfig(config: WorkflowStep["config"]) {
  const JudgeStepConfigSchema = z.object({
    judge: z
      .object({
        enabled: z.boolean(),
        provider: z.string().optional(),
        model: z.string().optional(),
        input_json: z.string().optional(),
        input_schema: z.string().optional(),
        output_path: z.string().optional(),
        output_schema: z.string().optional(),
        repair: z.boolean().optional(),
        fallback: z.boolean().optional(),
        temperature: z.number().optional(),
        maxTokens: z.number().optional(),
      })
      .optional(),
  });

  const parsed = JudgeStepConfigSchema.safeParse(config);
  if (!parsed.success) return undefined;
  return parsed.data.judge;
}

export const judgeStrategy = {
  pattern: "judge",

  async execute(
    step: WorkflowStep,
    context: StepContext,
    services: StepExecutionServices
  ): Promise<StepResult> {
    const judgeConfig = getJudgeStepConfig(step.config);
    if (!judgeConfig?.enabled) {
      throw new Error(`Judge step '${step.name}' is not properly configured`);
    }

    if (!judgeConfig.input_json) {
      throw new Error(
        "[BIND_1001] Missing input artifact path for judge step\nReason: config.judge.input_json is required\nFix: set input.json in judge mode or provide config.judge.input_json"
      );
    }
    if (!judgeConfig.output_path) {
      throw new Error(
        "[BIND_1001] Missing output artifact path for judge step\nReason: config.judge.output_path is required\nFix: set output.path in judge mode or provide config.judge.output_path"
      );
    }

    const inputPath = services.resolveProjectPath(judgeConfig.input_json);
    const outputPath = services.resolveProjectPath(judgeConfig.output_path, {
      allowNonExistentTarget: true,
    });
    const inputJson = await readFile(inputPath, "utf-8");
    const task = services.extractTask(step);
    const augmentedStep: WorkflowStep = {
      ...step,
      input: {
        ...(step.input && typeof step.input === "object" ? step.input : {}),
        task: `${task}\n\nInput JSON (${judgeConfig.input_json}):\n\n${inputJson}\n\nReturn JSON only.`,
      },
    };

    const response = await services.requestForStep(augmentedStep, context, step.agent);
    const rawContent = response.message.content ?? "";
    const parsedCandidate = services.tryParseStructuredContent(rawContent) ?? rawContent;
    const parsed = services.parseStepOutputContract(
      {
        ...augmentedStep,
        output: {
          path: judgeConfig.output_path,
          ...(judgeConfig.output_schema ? { schema: judgeConfig.output_schema } : {}),
        },
      },
      parsedCandidate
    );
    await mkdir(dirname(outputPath), { recursive: true });
    await readFile; // satisfy linter if unused — actually we use writeFile via services?
    // services.persistStepOutput only works when step.output.path is set.
    // Judge mode writes to judgeConfig.output_path directly, so we do it manually.
    const { writeFile } = await import("node:fs/promises");
    await writeFile(outputPath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
    return {
      output: parsed,
      raw: response,
    };
  },
} as const;
