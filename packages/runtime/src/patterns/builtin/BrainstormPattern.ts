import {
  CollaborationPatternBase,
  type BrainstormingPatternConfig,
  type BuiltinPatternKind,
  PATTERN_BLACKBOARD_DOMAIN_MAP,
  type PatternPayloadResult,
  type PatternRuntimeContext,
} from "../types.js";

type ParticipantId = string;

interface BrainstormInputShape {
  topic?: string;
  ideas?: Record<string, unknown>;
  evaluations?: Record<string, Record<string, unknown>>;
}

interface IdeaRecord {
  id: string;
  text: string;
  generated_by: ParticipantId;
}

interface RankedIdea extends IdeaRecord {
  score: number;
  rank: number;
  scores_by_participant: Record<string, number>;
}

type SemanticDedupFn = (ideas: IdeaRecord[], context: PatternRuntimeContext) => Promise<IdeaRecord[]> | IdeaRecord[];
type RankFn = (
  ideas: IdeaRecord[],
  participants: string[],
  input: BrainstormInputShape,
  context: PatternRuntimeContext
) => Promise<Array<Omit<RankedIdea, "rank">>> | Array<Omit<RankedIdea, "rank">>;
type GenerateFn = (
  participant: string,
  input: BrainstormInputShape,
  context: PatternRuntimeContext
) => Promise<string[]> | string[];

const DEFAULT_PHASE_1: NonNullable<BrainstormingPatternConfig["phase_1"]> = "generate";
const DEFAULT_PHASE_2: NonNullable<BrainstormingPatternConfig["phase_2"]> = "evaluate";
const DEFAULT_DEDUP: NonNullable<BrainstormingPatternConfig["dedup"]> = "exact";

export class BrainstormPattern extends CollaborationPatternBase {
  readonly name = "brainstorming";
  readonly kind: BuiltinPatternKind = "brainstorming";

  validateConfig(config: BrainstormingPatternConfig): void {
    if (config.phase_1 !== undefined && config.phase_1 !== "generate") {
      throw new Error("brainstorming.phase_1 must be 'generate'");
    }

    if (config.phase_2 !== undefined && config.phase_2 !== "evaluate") {
      throw new Error("brainstorming.phase_2 must be 'evaluate'");
    }

    if (config.top_n !== undefined && (!Number.isInteger(config.top_n) || config.top_n < 1)) {
      throw new Error("brainstorming.top_n must be an integer >= 1");
    }

    if (config.dedup !== undefined && config.dedup !== "exact" && config.dedup !== "semantic") {
      throw new Error("brainstorming.dedup must be one of: exact, semantic");
    }
  }

  protected async onExecute(context: PatternRuntimeContext): Promise<PatternPayloadResult> {
    const participants = Object.keys(context.participants ?? {});
    if (participants.length === 0) {
      throw new Error("brainstorming pattern requires at least one participant");
    }

    const config = (context.config ?? {}) as BrainstormingPatternConfig;
    const input = this.getInput(context);

    const phase1 = config.phase_1 ?? DEFAULT_PHASE_1;
    const phase2 = config.phase_2 ?? DEFAULT_PHASE_2;
    const dedup = config.dedup ?? DEFAULT_DEDUP;

    await context.emit?.({
      type: "brainstorm_generate_start",
      payload: { phase: phase1, participants },
    });

    const generatedIdeas = await this.generateIdeas(participants, input, context);

    await context.emit?.({
      type: "brainstorm_generate_end",
      payload: {
        phase: phase1,
        generated_count: generatedIdeas.length,
      },
    });

    const dedupedIdeas = await this.deduplicate(generatedIdeas, dedup, context);

    await context.emit?.({
      type: "brainstorm_evaluate_start",
      payload: {
        phase: phase2,
        candidates: dedupedIdeas.length,
      },
    });

    const ranked = await this.rankIdeas(dedupedIdeas, participants, input, context);
    const topN = config.top_n ?? ranked.length;
    const selected = ranked.slice(0, topN);

    await context.emit?.({
      type: "brainstorm_evaluate_end",
      payload: {
        phase: phase2,
        evaluated_count: ranked.length,
        selected_count: selected.length,
      },
    });

    return {
      success: true,
      output: {
        domain: "knowledge",
        brainstorming: {
          topic: input.topic ?? context.stepName ?? "Brainstorm",
          phase_1: phase1,
          phase_2: phase2,
          dedup,
          top_n: config.top_n,
          participants,
          generated: generatedIdeas,
          deduped: dedupedIdeas,
          ranked,
          selected,
        },
      },
      metadata: {
        blackboard_domains: PATTERN_BLACKBOARD_DOMAIN_MAP["brainstorming"],
        generated_count: generatedIdeas.length,
        deduped_count: dedupedIdeas.length,
        ranked_count: ranked.length,
        selected_count: selected.length,
      },
    };
  }

  private getInput(context: PatternRuntimeContext): BrainstormInputShape {
    if (!context.input || typeof context.input !== "object") {
      return {};
    }

    return context.input as BrainstormInputShape;
  }

  private async generateIdeas(
    participants: string[],
    input: BrainstormInputShape,
    context: PatternRuntimeContext
  ): Promise<IdeaRecord[]> {
    const generator = (context as PatternRuntimeContext & { brainstormGenerateIdeas?: GenerateFn }).brainstormGenerateIdeas;

    const results = await Promise.all(
      participants.map(async (participant) => {
        const values = generator
          ? await generator(participant, input, context)
          : this.readParticipantIdeasFromInput(participant, input);

        return values.map((text, index) => ({
          id: `${participant}-${index + 1}`,
          text,
          generated_by: participant,
        }));
      })
    );

    return results.flat();
  }

  private readParticipantIdeasFromInput(participant: string, input: BrainstormInputShape): string[] {
    const raw = input.ideas?.[participant];
    if (Array.isArray(raw)) {
      return raw.map((item) => String(item));
    }

    if (raw === undefined) {
      return [];
    }

    return [String(raw)];
  }

  private async deduplicate(
    ideas: IdeaRecord[],
    mode: NonNullable<BrainstormingPatternConfig["dedup"]>,
    context: PatternRuntimeContext
  ): Promise<IdeaRecord[]> {
    if (mode === "semantic") {
      const semanticDedup = (context as PatternRuntimeContext & { brainstormSemanticDedup?: SemanticDedupFn })
        .brainstormSemanticDedup;
      if (typeof semanticDedup === "function") {
        return semanticDedup(ideas, context);
      }
    }

    return this.exactDedup(ideas);
  }

  private exactDedup(ideas: IdeaRecord[]): IdeaRecord[] {
    const seen = new Set<string>();
    const result: IdeaRecord[] = [];

    for (const idea of ideas) {
      if (seen.has(idea.text)) {
        continue;
      }
      seen.add(idea.text);
      result.push(idea);
    }

    return result;
  }

  private async rankIdeas(
    ideas: IdeaRecord[],
    participants: string[],
    input: BrainstormInputShape,
    context: PatternRuntimeContext
  ): Promise<RankedIdea[]> {
    const customRank = (context as PatternRuntimeContext & { brainstormRankIdeas?: RankFn }).brainstormRankIdeas;

    if (typeof customRank === "function") {
      const ranked = await customRank(ideas, participants, input, context);
      return [...ranked]
        .sort((a, b) => b.score - a.score)
        .map((idea, index) => ({ ...idea, rank: index + 1 }));
    }

    const ranked = ideas
      .map((idea) => {
        const scoresByParticipant: Record<string, number> = {};
        let sum = 0;

        for (const participant of participants) {
          const rawScore = input.evaluations?.[participant]?.[idea.text];
          const numericScore = typeof rawScore === "number" ? rawScore : Number(rawScore ?? 0);
          const safeScore = Number.isFinite(numericScore) ? numericScore : 0;
          scoresByParticipant[participant] = safeScore;
          sum += safeScore;
        }

        const divisor = participants.length === 0 ? 1 : participants.length;
        return {
          ...idea,
          score: sum / divisor,
          scores_by_participant: scoresByParticipant,
        };
      })
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .map((idea, index) => ({ ...idea, rank: index + 1 }));

    return ranked;
  }
}
