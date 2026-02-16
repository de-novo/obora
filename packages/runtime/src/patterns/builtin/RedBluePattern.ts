import { OboraErrorCode } from "../../errors/OboraErrorCode.js";
import {
  CollaborationPatternBase,
  type BuiltinPatternKind,
  PATTERN_BLACKBOARD_DOMAIN_MAP,
  type PatternPayloadResult,
  type PatternRuntimeContext,
  type RedBluePatternConfig,
} from "../types.js";

interface RedBlueRoundInput {
  red_findings?: Record<string, unknown>;
  blue_responses?: Record<string, unknown>;
}

interface RedBlueInputShape {
  subject?: unknown;
  rounds?: RedBlueRoundInput[];
}

interface RoundSummary {
  round: number;
  red_team: string[];
  blue_team: string[];
  red_findings: Record<string, unknown>;
  blue_responses: Record<string, unknown>;
}

const DEFAULT_MAX_ROUNDS = 1;
const DEFAULT_CONVERGENCE: NonNullable<RedBluePatternConfig["convergence"]> = "max_rounds";

export class RedBluePattern extends CollaborationPatternBase {
  readonly name = "red-blue";
  readonly kind: BuiltinPatternKind = "red-blue";

  validateConfig(config: RedBluePatternConfig): void {
    if (config.max_rounds !== undefined && (!Number.isInteger(config.max_rounds) || config.max_rounds < 1)) {
      throw new Error("red-blue.max_rounds must be an integer >= 1");
    }

    if (
      config.convergence !== undefined &&
      config.convergence !== "red_finds_nothing" &&
      config.convergence !== "max_rounds" &&
      config.convergence !== "custom"
    ) {
      throw new Error("red-blue.convergence must be one of: red_finds_nothing, max_rounds, custom");
    }
  }

  protected async onExecute(context: PatternRuntimeContext): Promise<PatternPayloadResult> {
    const participants = Object.keys(context.participants ?? {});
    if (participants.length === 0) {
      throw new Error("red-blue pattern requires at least one participant");
    }

    const config = (context.config ?? {}) as RedBluePatternConfig;
    const maxRounds = config.max_rounds ?? DEFAULT_MAX_ROUNDS;
    const convergence = config.convergence ?? DEFAULT_CONVERGENCE;
    const { redTeam, blueTeam } = this.resolveTeams(participants, config);
    const input = this.getInput(context);
    const roundsInput = this.resolveRounds(input, maxRounds);

    const rounds: RoundSummary[] = [];
    let converged = false;
    let convergenceRound: number | undefined;

    for (let index = 0; index < maxRounds; index += 1) {
      const roundNumber = index + 1;
      const roundInput = roundsInput[index] ?? {};
      const redFindings = this.normalizeRecord(roundInput.red_findings);
      const blueResponses = this.normalizeRecord(roundInput.blue_responses);

      await context.emit?.({
        type: "red_blue_round_start",
        payload: {
          round: roundNumber,
          max_rounds: maxRounds,
          red_team: redTeam,
          blue_team: blueTeam,
        },
      });

      const summary: RoundSummary = {
        round: roundNumber,
        red_team: redTeam,
        blue_team: blueTeam,
        red_findings: redFindings,
        blue_responses: blueResponses,
      };
      rounds.push(summary);

      await context.emit?.({
        type: "red_blue_round_end",
        payload: {
          round: roundNumber,
          red_findings_count: Object.keys(redFindings).length,
          blue_responses_count: Object.keys(blueResponses).length,
        },
      });

      const shouldConverge = this.checkConvergence({
        mode: convergence,
        context,
        roundNumber,
        rounds,
        currentRound: summary,
        input,
        redTeam,
        blueTeam,
      });

      if (shouldConverge) {
        converged = true;
        convergenceRound = roundNumber;
        break;
      }
    }

    if (!converged && convergence === "red_finds_nothing") {
      return {
        success: false,
        output: {
          reason: "convergence_not_reached",
          error_codes: [OboraErrorCode.ORCH_DEPENDENCY_FAILED],
          rounds,
          converged: false,
        },
        metadata: {
          blackboard_domains: PATTERN_BLACKBOARD_DOMAIN_MAP["red-blue"],
          decision: "FAIL",
          max_rounds: maxRounds,
          convergence,
          red_team: redTeam,
          blue_team: blueTeam,
        },
      };
    }

    if (!converged && (convergence === "max_rounds" || convergence === "custom")) {
      converged = true;
      convergenceRound = rounds.length;
    }

    return {
      success: true,
      output: {
        rounds,
        converged,
        convergence_round: convergenceRound,
      },
      metadata: {
        blackboard_domains: PATTERN_BLACKBOARD_DOMAIN_MAP["red-blue"],
        decision: "PASS",
        max_rounds: maxRounds,
        convergence,
        red_team: redTeam,
        blue_team: blueTeam,
      },
    };
  }

  private getInput(context: PatternRuntimeContext): RedBlueInputShape {
    if (!context.input || typeof context.input !== "object") {
      return {};
    }

    return context.input as RedBlueInputShape;
  }

  private resolveRounds(input: RedBlueInputShape, maxRounds: number): RedBlueRoundInput[] {
    if (!Array.isArray(input.rounds) || input.rounds.length === 0) {
      return Array.from({ length: maxRounds }, () => ({}));
    }

    return input.rounds.slice(0, maxRounds);
  }

  private resolveTeams(participants: string[], config: RedBluePatternConfig): { redTeam: string[]; blueTeam: string[] } {
    if (config.red_team || config.blue_team) {
      const redTeam = this.normalizeTeam(config.red_team, "red_team", participants);
      const blueTeam = this.normalizeTeam(config.blue_team, "blue_team", participants);

      if (redTeam.length === 0 || blueTeam.length === 0) {
        throw new Error("red-blue.red_team and red-blue.blue_team must each contain at least one participant");
      }

      const overlap = redTeam.filter((member) => blueTeam.includes(member));
      if (overlap.length > 0) {
        throw new Error(`red-blue: participants cannot be on both teams: ${overlap.join(", ")}`);
      }

      return { redTeam, blueTeam };
    }

    const splitIndex = Math.ceil(participants.length / 2);
    const redTeam = participants.slice(0, splitIndex);
    const blueTeam = participants.slice(splitIndex);

    if (blueTeam.length === 0) {
      throw new Error("red-blue pattern requires at least two participants for automatic team split");
    }

    return { redTeam, blueTeam };
  }

  private normalizeTeam(team: string[] | undefined, fieldName: "red_team" | "blue_team", participants: string[]): string[] {
    if (!Array.isArray(team)) {
      return [];
    }

    const normalized = team.map((member) => (typeof member === "string" ? member.trim() : "")).filter((member) => member.length > 0);

    const invalid = normalized.filter((member) => !participants.includes(member));
    if (invalid.length > 0) {
      throw new Error(`red-blue.${fieldName} contains unknown participant ids: ${invalid.join(", ")}`);
    }

    return [...new Set(normalized)];
  }

  private normalizeRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return {};
    }

    return { ...(value as Record<string, unknown>) };
  }

  private checkConvergence(params: {
    mode: NonNullable<RedBluePatternConfig["convergence"]>;
    context: PatternRuntimeContext;
    roundNumber: number;
    rounds: RoundSummary[];
    currentRound: RoundSummary;
    input: RedBlueInputShape;
    redTeam: string[];
    blueTeam: string[];
  }): boolean {
    const { mode, context, roundNumber, rounds, currentRound, input, redTeam, blueTeam } = params;

    if (mode === "red_finds_nothing") {
      return Object.keys(currentRound.red_findings).length === 0;
    }

    if (mode === "custom") {
      const customConvergence = (context as PatternRuntimeContext & {
        redBlueConvergenceFn?: (payload: {
          round: number;
          rounds: RoundSummary[];
          current_round: RoundSummary;
          subject: unknown;
          red_team: string[];
          blue_team: string[];
        }) => boolean;
      }).redBlueConvergenceFn;

      if (typeof customConvergence === "function") {
        return customConvergence({
          round: roundNumber,
          rounds,
          current_round: currentRound,
          subject: input.subject,
          red_team: redTeam,
          blue_team: blueTeam,
        });
      }

      return false;
    }

    return false;
  }
}
