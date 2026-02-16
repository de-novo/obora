import { OboraErrorCode } from "../../errors/OboraErrorCode.js";
import {
  CollaborationPatternBase,
  type BuiltinPatternKind,
  type FanOutFanInPatternConfig,
  PATTERN_BLACKBOARD_DOMAIN_MAP,
  type PatternPayloadResult,
  type PatternRuntimeContext,
} from "../types.js";

interface FanOutFanInInput {
  task?: unknown;
  items?: unknown[];
  responses?: Record<string, unknown>;
}

interface ParticipantResult {
  success: boolean;
  output?: unknown;
}

type FanOutProcessFn = (
  participant: string,
  payload: { task?: unknown; items?: unknown[] },
  context: PatternRuntimeContext
) => Promise<unknown> | unknown;

type FanOutMergeFn = (
  outputs: unknown[],
  participantResults: Record<string, ParticipantResult>,
  context: PatternRuntimeContext
) => Promise<unknown> | unknown;

const VALID_MERGE = new Set<NonNullable<FanOutFanInPatternConfig["merge"]>>(["concatenate", "rank", "vote", "custom"]);

export class FanOutFanInPattern extends CollaborationPatternBase {
  readonly name = "fan-out-fan-in";
  readonly kind: BuiltinPatternKind = "fan-out-fan-in";

  validateConfig(config: FanOutFanInPatternConfig): void {
    if (config.merge !== undefined && !VALID_MERGE.has(config.merge)) {
      throw new Error("fan-out-fan-in.merge must be one of: concatenate, rank, vote, custom");
    }
  }

  protected async onExecute(context: PatternRuntimeContext): Promise<PatternPayloadResult> {
    const participants = Object.keys(context.participants ?? {});
    if (participants.length === 0) {
      throw new Error("fan-out-fan-in pattern requires at least one participant");
    }

    const config = (context.config ?? {}) as FanOutFanInPatternConfig;
    const input = this.getInput(context);
    const mergeStrategy = config.merge ?? "concatenate";

    await context.emit?.({
      type: "fanout_start",
      payload: {
        participants,
        merge: mergeStrategy,
        has_task: input.task !== undefined,
        items_count: Array.isArray(input.items) ? input.items.length : 0,
      },
    });

    const participantResults: Record<string, ParticipantResult> = {};

    const results = await Promise.all(
      participants.map(async (participant, index) => {
        const payload = this.buildParticipantPayload(input, participants.length, index);
        const result = await this.processParticipant(participant, payload, input, context);
        participantResults[participant] = result;

        await context.emit?.({
          type: "fanout_participant_result",
          payload: {
            participant,
            success: result.success,
            has_output: Object.prototype.hasOwnProperty.call(result, "output"),
          },
        });

        return { participant, ...result };
      })
    );

    const successful = results.filter((result) => result.success);
    if (successful.length === 0) {
      return {
        success: false,
        output: {
          reason: "all_participants_failed",
          error_codes: [OboraErrorCode.ORCH_DEPENDENCY_FAILED],
          merged: [],
          participant_results: participantResults,
          merge_strategy: mergeStrategy,
        },
        metadata: {
          blackboard_domains: PATTERN_BLACKBOARD_DOMAIN_MAP["fan-out-fan-in"],
          responded_participants: 0,
          missing_participants: participants.length,
        },
      };
    }

    const outputs = successful.map((result) => result.output);
    const merged = await this.mergeOutputs(mergeStrategy, outputs, participantResults, context);

    await context.emit?.({
      type: "fanin_merge",
      payload: {
        merge_strategy: mergeStrategy,
        responded_participants: successful.length,
        missing_participants: participants.length - successful.length,
      },
    });

    return {
      success: true,
      output: {
        merged,
        participant_results: participantResults,
        merge_strategy: mergeStrategy,
      },
      metadata: {
        blackboard_domains: PATTERN_BLACKBOARD_DOMAIN_MAP["fan-out-fan-in"],
        responded_participants: successful.length,
        missing_participants: participants.length - successful.length,
      },
    };
  }

  private getInput(context: PatternRuntimeContext): FanOutFanInInput {
    if (!context.input || typeof context.input !== "object") {
      return {};
    }

    return context.input as FanOutFanInInput;
  }

  private buildParticipantPayload(input: FanOutFanInInput, participantCount: number, participantIndex: number): { task?: unknown; items?: unknown[] } {
    if (!Array.isArray(input.items) || input.items.length === 0) {
      return { task: input.task };
    }

    const assignedItems = input.items.filter((_, index) => index % participantCount === participantIndex);
    return {
      task: input.task,
      items: assignedItems,
    };
  }

  private async processParticipant(
    participant: string,
    payload: { task?: unknown; items?: unknown[] },
    input: FanOutFanInInput,
    context: PatternRuntimeContext
  ): Promise<ParticipantResult> {
    const processFn = (context as PatternRuntimeContext & { fanOutFanInProcessFn?: FanOutProcessFn }).fanOutFanInProcessFn;

    try {
      if (typeof processFn === "function") {
        const output = await processFn(participant, payload, context);
        return { success: true, output };
      }

      if (input.responses && Object.prototype.hasOwnProperty.call(input.responses, participant)) {
        return {
          success: true,
          output: input.responses[participant],
        };
      }

      return { success: false };
    } catch {
      return { success: false };
    }
  }

  private async mergeOutputs(
    mergeStrategy: NonNullable<FanOutFanInPatternConfig["merge"]>,
    outputs: unknown[],
    participantResults: Record<string, ParticipantResult>,
    context: PatternRuntimeContext
  ): Promise<unknown> {
    switch (mergeStrategy) {
      case "concatenate":
        return outputs;
      case "rank":
        return this.rankMerge(outputs);
      case "vote":
        return this.voteMerge(outputs);
      case "custom": {
        const customMerge = (context as PatternRuntimeContext & { fanOutFanInMergeFn?: FanOutMergeFn }).fanOutFanInMergeFn;
        if (typeof customMerge === "function") {
          return customMerge(outputs, participantResults, context);
        }
        return outputs;
      }
      default:
        return outputs;
    }
  }

  private rankMerge(outputs: unknown[]): unknown[] {
    const normalized = outputs.map((output, index) => ({
      output,
      index,
      score: this.extractScore(output),
    }));

    normalized.sort((a, b) => b.score - a.score || a.index - b.index);
    return normalized.map((item) => item.output);
  }

  private voteMerge(outputs: unknown[]): unknown {
    const tally = new Map<string, { count: number; value: unknown; firstIndex: number }>();

    outputs.forEach((output, index) => {
      const key = this.serializeVoteKey(output);
      const existing = tally.get(key);
      if (existing) {
        existing.count += 1;
        return;
      }

      tally.set(key, {
        count: 1,
        value: output,
        firstIndex: index,
      });
    });

    const winner = [...tally.values()].sort((a, b) => b.count - a.count || a.firstIndex - b.firstIndex)[0];
    return winner?.value;
  }

  private extractScore(output: unknown): number {
    if (!output || typeof output !== "object") {
      return Number.NEGATIVE_INFINITY;
    }

    const score = (output as { score?: unknown }).score;
    if (typeof score === "number" && Number.isFinite(score)) {
      return score;
    }

    const numeric = Number(score);
    return Number.isFinite(numeric) ? numeric : Number.NEGATIVE_INFINITY;
  }

  private serializeVoteKey(output: unknown): string {
    if (typeof output === "string") {
      return `str:${output}`;
    }

    if (typeof output === "number" || typeof output === "boolean" || output === null || output === undefined) {
      return String(output);
    }

    try {
      return JSON.stringify(output);
    } catch {
      return String(output);
    }
  }
}
