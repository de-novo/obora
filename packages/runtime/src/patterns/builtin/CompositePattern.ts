import type { PatternRegistry } from "../PatternRegistry.js";
import {
  CollaborationPatternBase,
  OboraErrorCode,
  type PatternPayloadResult,
  type PatternRuntimeContext,
  type CompositePatternConfig,
  type CompositeStage,
} from "../types.js";

type StageFailureMode = "fail" | "skip" | "escalate";

interface CompositeStageResult {
  name: string;
  pattern: string;
  success: boolean;
  output: unknown;
}

export class CompositePattern extends CollaborationPatternBase {
  readonly name = "composite";
  readonly kind = "composite" as const;

  constructor(private readonly registry: PatternRegistry) {
    super();
  }

  validateConfig(config: CompositePatternConfig): void {
    if (!Array.isArray(config.stages)) {
      throw new Error("composite.stages must be an array");
    }

    const seen = new Set<string>();
    for (const [index, stage] of config.stages.entries()) {
      if (!stage || typeof stage !== "object") {
        throw new Error(`composite.stages[${index}] must be an object`);
      }

      if (typeof stage.name !== "string" || stage.name.trim().length === 0) {
        throw new Error(`composite.stages[${index}].name must be a non-empty string`);
      }

      if (seen.has(stage.name)) {
        throw new Error(`composite.stages contains duplicate stage name '${stage.name}'`);
      }
      seen.add(stage.name);

      if (typeof stage.pattern !== "string" || stage.pattern.trim().length === 0) {
        throw new Error(`composite.stages[${index}].pattern must be a non-empty string`);
      }

      if (
        stage.input_from !== undefined &&
        typeof stage.input_from !== "string"
      ) {
        throw new Error(`composite.stages[${index}].input_from must be a string when provided`);
      }
    }

    if (
      config.on_stage_failure !== undefined &&
      config.on_stage_failure !== "fail" &&
      config.on_stage_failure !== "skip" &&
      config.on_stage_failure !== "escalate"
    ) {
      throw new Error("composite.on_stage_failure must be one of: fail, skip, escalate");
    }
  }

  protected async onExecute(context: PatternRuntimeContext): Promise<PatternPayloadResult> {
    const config = (context.config ?? {}) as CompositePatternConfig;
    const stages = config.stages ?? [];
    const onStageFailure: StageFailureMode = config.on_stage_failure ?? "fail";

    const rootInput = context.input;
    const results: CompositeStageResult[] = [];
    const outputsByStageName = new Map<string, unknown>();

    await context.emit?.({
      type: "composite_start",
      payload: {
        stages: stages.map((stage) => ({ name: stage.name, pattern: stage.pattern })),
        on_stage_failure: onStageFailure,
      },
    });

    for (let index = 0; index < stages.length; index += 1) {
      const stage = stages[index]!;
      const stageInput = this.resolveStageInput({
        stage,
        index,
        rootInput,
        results,
        outputsByStageName,
      });

      await context.emit?.({
        type: "composite_stage_start",
        payload: {
          index,
          name: stage.name,
          pattern: stage.pattern,
          input_from: index === 0 ? "root" : (stage.input_from ?? "previous"),
        },
      });

      const pattern = this.registry.get(stage.pattern);

      try {
        const stageResult = await pattern.run({
          ...context,
          pattern: stage.pattern,
          config: (stage.config ?? {}) as never,
          participants: stage.participants ?? context.participants,
          input: stageInput,
        });

        const normalized: CompositeStageResult = {
          name: stage.name,
          pattern: stage.pattern,
          success: stageResult.success,
          output: stageResult.output,
        };

        results.push(normalized);
        outputsByStageName.set(stage.name, stageResult.output);

        await context.emit?.({
          type: "composite_stage_end",
          payload: {
            index,
            name: stage.name,
            pattern: stage.pattern,
            success: stageResult.success,
            output: stageResult.output,
          },
        });

        if (!stageResult.success) {
          if (onStageFailure === "skip") {
            // When on_stage_failure is "skip", the failed stage's output ({ reason: "failed" })
            // becomes available to subsequent stages via input_from. This is intentional:
            // downstream stages can inspect the failure and react accordingly.
            continue;
          }

          if (onStageFailure === "escalate") {
            throw Object.assign(
              new Error(`composite stage "${stage.name}" (pattern: ${stage.pattern}) failed and escalation requested`),
              { code: OboraErrorCode.RECOVERY_ESCALATION_TIMEOUT, stageResult }
            );
          }

          await context.emit?.({
            type: "composite_end",
            payload: {
              success: false,
              completed_stages: results.length,
              stages: results,
            },
          });

          return {
            success: false,
            output: {
              stages: results,
              completed_stages: results.length,
            },
          };
        }
      } catch (error) {
        await context.emit?.({
          type: "composite_stage_end",
          payload: {
            index,
            name: stage.name,
            pattern: stage.pattern,
            success: false,
            error: error instanceof Error ? error.message : String(error),
          },
        });

        if (onStageFailure === "skip") {
          results.push({
            name: stage.name,
            pattern: stage.pattern,
            success: false,
            output: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
          continue;
        }

        if (onStageFailure === "escalate") {
          throw error;
        }

        await context.emit?.({
          type: "composite_end",
          payload: {
            success: false,
            completed_stages: results.length,
            stages: results,
          },
        });

        return {
          success: false,
          output: {
            stages: results,
            completed_stages: results.length,
          },
        };
      }
    }

    await context.emit?.({
      type: "composite_end",
      payload: {
        success: true,
        completed_stages: results.length,
        stages: results,
      },
    });

    return {
      success: true,
      output: {
        stages: results,
        completed_stages: results.length,
      },
    };
  }

  private resolveStageInput(args: {
    stage: CompositeStage;
    index: number;
    rootInput: unknown;
    results: CompositeStageResult[];
    outputsByStageName: Map<string, unknown>;
  }): unknown {
    if (args.index === 0) {
      return args.rootInput;
    }

    const source = args.stage.input_from ?? "previous";
    if (source === "previous") {
      return args.results.at(-1)?.output;
    }

    if (source === "root") {
      return args.rootInput;
    }

    if (!args.outputsByStageName.has(source)) {
      throw new Error(`composite stage '${args.stage.name}' references unknown input_from stage '${source}'`);
    }

    return args.outputsByStageName.get(source);
  }
}

