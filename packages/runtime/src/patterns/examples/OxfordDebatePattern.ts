import { CollaborationPatternBase, type PatternPayloadResult, type PatternRuntimeContext } from "../types.js";

interface OxfordDebateInput {
  motion: string;
  arguments?: Record<string, string>;
}

interface DebateRound {
  stage: "proposition" | "opposition" | "rebuttal" | "vote";
  speaker: string;
  argument: string;
}

export class OxfordDebatePattern extends CollaborationPatternBase {
  readonly name = "oxford-debate";
  readonly kind = "oxford-debate";
  readonly version = "1.0.0";

  validateConfig(config: Record<string, unknown>): void {
    const voting = config.voting;
    if (voting !== undefined && voting !== "judge" && voting !== "majority") {
      throw new Error("oxford-debate.voting must be either 'judge' or 'majority'");
    }
  }

  protected async onExecute(context: PatternRuntimeContext): Promise<PatternPayloadResult> {
    const input = this.parseInput(context.input);
    const proposer = this.resolveParticipant(context, "proposer");
    const opposer = this.resolveParticipant(context, "opposer");
    const judge = this.resolveParticipant(context, "judge");

    const rounds: DebateRound[] = [
      {
        stage: "proposition",
        speaker: proposer,
        argument: input.arguments?.proposer ?? `${proposer} supports: ${input.motion}`,
      },
      {
        stage: "opposition",
        speaker: opposer,
        argument: input.arguments?.opposer ?? `${opposer} opposes: ${input.motion}`,
      },
      {
        stage: "rebuttal",
        speaker: proposer,
        argument: input.arguments?.rebuttal ?? `${proposer} rebuts and reinforces the motion.`,
      },
    ];

    await context.emit?.({
      type: "oxford_debate_rounds_completed",
      payload: {
        motion: input.motion,
        rounds,
      },
    });

    const result = this.vote(context, rounds, judge);

    const voteRound: DebateRound = {
      stage: "vote",
      speaker: judge,
      argument: `${judge} votes ${result}`,
    };

    rounds.push(voteRound);

    return {
      success: true,
      output: {
        motion: input.motion,
        result,
        rounds,
      },
      metadata: {
        participants: { proposer, opposer, judge },
        rounds: rounds.length,
      },
    };
  }

  private parseInput(input: unknown): OxfordDebateInput {
    if (!input || typeof input !== "object") {
      throw new Error("Oxford debate input must be an object with 'motion'");
    }

    const candidate = input as OxfordDebateInput;
    if (typeof candidate.motion !== "string" || candidate.motion.trim().length === 0) {
      throw new Error("Oxford debate input.motion is required");
    }

    return candidate;
  }

  private resolveParticipant(context: PatternRuntimeContext, role: "proposer" | "opposer" | "judge"): string {
    const participant = context.participants?.[role];
    if (!participant) {
      throw new Error(`Oxford debate requires participant role '${role}'`);
    }
    return participant;
  }

  private vote(
    context: PatternRuntimeContext,
    rounds: DebateRound[],
    judge: string
  ): "for" | "against" {
    const voting = (context.config as { voting?: "judge" | "majority" } | undefined)?.voting ?? "judge";

    if (voting === "majority") {
      const argumentsFor = rounds.filter((round) => round.argument.length >= 1 && round.stage !== "opposition").length;
      const argumentsAgainst = rounds.filter((round) => round.stage === "opposition").length;
      return argumentsFor >= argumentsAgainst ? "for" : "against";
    }

    const judgeOpinion = (context.input as OxfordDebateInput).arguments?.[judge] ?? "for";
    return judgeOpinion.toLowerCase().includes("against") ? "against" : "for";
  }
}
