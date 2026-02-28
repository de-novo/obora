import { OboraErrorCode } from "../../errors/OboraErrorCode.js";
import { VotingSessionStore } from "../../consensus/voting/VotingSessionStore.js";
import {
  CollaborationPatternBase,
  type BuiltinPatternKind,
  type ConsensusPatternConfig,
  type EscalationTrigger,
  type VoterRole,
  PATTERN_BLACKBOARD_DOMAIN_MAP,
  type PatternPayloadResult,
  type PatternRuntimeContext,
} from "../types.js";

type VoteValue = boolean | number | { approved?: unknown; score?: unknown; reason?: unknown };

interface ConsensusInputShape {
  topic?: string;
  startedAt?: string | Date;
  votes?: Record<string, VoteValue>;
}

interface NormalizedVote {
  voterId: string;
  approved: boolean;
  score?: number;
  reason?: string;
  role?: VoterRole;
}

interface CustomEvaluationContext {
  votes: NormalizedVote[];
  participants: string[];
  requiredParticipants: string[];
  config: ConsensusPatternConfig;
}

type CustomEvaluatorResult =
  | boolean
  | {
      approved: boolean;
      reason?: string;
      score?: number;
    };

type CustomEvaluator = (context: CustomEvaluationContext) => CustomEvaluatorResult;

const DEFAULT_RULE: NonNullable<ConsensusPatternConfig["rule"]> = "majority";
const DEFAULT_THRESHOLD_BY_RULE: Record<"weighted" | "score-threshold", number> = {
  weighted: 0.5,
  "score-threshold": 0.5,
};

export class ConsensusPattern extends CollaborationPatternBase {
  readonly name = "consensus";
  readonly kind: BuiltinPatternKind = "consensus";

  validateConfig(config: ConsensusPatternConfig): void {
    if (config.rule !== undefined) {
      const allowed = new Set(["majority", "unanimous", "weighted", "score-threshold", "custom"]);
      if (!allowed.has(config.rule)) {
        throw new Error("consensus.rule must be one of: majority, unanimous, weighted, score-threshold, custom");
      }
    }

    if (config.threshold !== undefined && (!Number.isFinite(config.threshold) || config.threshold < 0)) {
      throw new Error("consensus.threshold must be a finite number >= 0");
    }

    if (config.best_effort !== undefined && !Array.isArray(config.best_effort)) {
      throw new Error("consensus.best_effort must be a string[]");
    }

    if (config.best_effort && config.best_effort.some((voterId) => typeof voterId !== "string" || voterId.trim().length === 0)) {
      throw new Error("consensus.best_effort must contain non-empty voter ids");
    }

    if (config.weights !== undefined) {
      for (const [voterId, weight] of Object.entries(config.weights)) {
        if (voterId.trim().length === 0 || !Number.isFinite(weight) || weight < 0) {
          throw new Error("consensus.weights must map non-empty voter ids to finite numbers >= 0");
        }
      }
    }

    if (config.timeout !== undefined && parseTimeoutToMs(config.timeout) === undefined) {
      throw new Error("consensus.timeout must match /^(\\d+)(ms|s|m|h)$/");
    }

    if (config.rule === "custom") {
      const candidate = (config as ConsensusPatternConfig & { custom_evaluate?: unknown }).custom_evaluate;
      if (candidate !== undefined && typeof candidate !== "function") {
        throw new Error("consensus.custom_evaluate must be a function when provided");
      }
    }

    if (config.voter_roles !== undefined) {
      if (!Array.isArray(config.voter_roles)) {
        throw new Error("consensus.voter_roles must be an array of VoterRoleConfig");
      }
      const validRoles = new Set(["ai", "human", "service"]);
      for (const rc of config.voter_roles) {
        if (!validRoles.has(rc.role)) {
          throw new Error(`consensus.voter_roles[].role must be one of: ai, human, service (got "${rc.role}")`);
        }
        if (!Array.isArray(rc.voters) || rc.voters.length === 0) {
          throw new Error("consensus.voter_roles[].voters must be a non-empty string[]");
        }
      }
    }

    if (config.escalation !== undefined) {
      const validTriggers = new Set(["timeout", "quorum_not_met"]);
      if (!Array.isArray(config.escalation.triggers) || config.escalation.triggers.length === 0) {
        throw new Error("consensus.escalation.triggers must be a non-empty array");
      }
      for (const t of config.escalation.triggers) {
        if (!validTriggers.has(t)) {
          throw new Error(`consensus.escalation.triggers must be one of: timeout, quorum_not_met (got "${t}")`);
        }
      }
    }
  }

  protected async onExecute(context: PatternRuntimeContext): Promise<PatternPayloadResult> {
    const participants = Object.keys(context.participants ?? {});
    if (participants.length === 0) {
      throw new Error("consensus pattern requires at least one participant");
    }

    const config = (context.config ?? {}) as ConsensusPatternConfig;
    const rule = config.rule ?? DEFAULT_RULE;
    const bestEffort = new Set(config.best_effort ?? []);
    const requiredParticipants = participants.filter((participant) => !bestEffort.has(participant));

    // Build voter role map from config
    const voterRoleMap = this.buildVoterRoleMap(config, participants);

    const input = this.getConsensusInput(context);
    const votes = this.collectVotes(participants, input.votes, voterRoleMap);

    await context.emit?.({
      type: "consensus_vote_start",
      payload: {
        rule,
        participants,
        required: requiredParticipants,
        best_effort: [...bestEffort],
        voter_roles: Object.fromEntries(voterRoleMap),
      },
    });

    // VotingSessionStore integration: create, record, close, and use tally for cross-validation
    const votingSessionStore = new VotingSessionStore();
    const votingSession = votingSessionStore.create({
      agendaId: `consensus:${context.executionId ?? context.stepName ?? "session"}`,
      policy: rule === "score-threshold" || rule === "custom" ? "majority" : rule,
      quorum: requiredParticipants.length,
      createdBy: "runtime:consensus-pattern",
    });
    votingSessionStore.open(votingSession.id);

    for (const vote of votes) {
      votingSessionStore.addVote({
        sessionId: votingSession.id,
        voterId: vote.voterId,
        option: vote.approved ? "approve" : "reject",
        weight: config.weights?.[vote.voterId],
      });

      await context.emit?.({
        type: "consensus_vote_cast",
        payload: {
          voterId: vote.voterId,
          approved: vote.approved,
          score: vote.score,
          reason: vote.reason,
          role: vote.role,
        },
      });
    }

    const requiredVoteCount = votes.filter((vote) => requiredParticipants.includes(vote.voterId)).length;
    if (requiredVoteCount < requiredParticipants.length) {
      const timeoutMs = parseTimeoutToMs(config.timeout);
      if (timeoutMs !== undefined && this.hasTimedOut(timeoutMs, input.startedAt, context)) {
        // Close store session before escalation/throw
        votingSessionStore.close(votingSession.id);

        if (this.shouldEscalate("timeout", config)) {
          return this.buildEscalationResult(
            "timeout",
            config,
            participants,
            votes,
            rule,
            requiredParticipants,
            bestEffort,
            votingSessionStore.getTally(votingSession.id),
            context,
          );
        }

        const timeoutError = Object.assign(new Error("consensus voting timed out"), {
          code: OboraErrorCode.CONSENSUS_TIMEOUT,
        });

        await context.emit?.({
          type: "consensus_result",
          payload: {
            status: "timeout",
            reason: "required voters timeout",
            received_required: requiredVoteCount,
            required_total: requiredParticipants.length,
          },
        });

        throw timeoutError;
      }

      // Close store session before quorum failure
      votingSessionStore.close(votingSession.id);

      if (this.shouldEscalate("quorum_not_met", config)) {
        return this.buildEscalationResult(
          "quorum_not_met",
          config,
          participants,
          votes,
          rule,
          requiredParticipants,
          bestEffort,
          votingSessionStore.getTally(votingSession.id),
          context,
        );
      }

      await context.emit?.({
        type: "consensus_result",
        payload: {
          status: "fail",
          reason: "quorum_not_met",
          received_required: requiredVoteCount,
          required_total: requiredParticipants.length,
        },
      });

      return {
        success: false,
        output: {
          status: "quorum-not-met",
          reason: OboraErrorCode.CONSENSUS_QUORUM_NOT_MET,
          participants,
          votes,
        },
        metadata: {
          rule,
          blackboard_domains: PATTERN_BLACKBOARD_DOMAIN_MAP["consensus"],
          required_participants: requiredParticipants,
          best_effort: [...bestEffort],
        },
      };
    }

    // Close store session and get tally for cross-validation
    votingSessionStore.close(votingSession.id);
    const tally = votingSessionStore.getTally(votingSession.id);

    const verdict = this.evaluateRule(rule, votes, participants, requiredParticipants, config, context);

    await context.emit?.({
      type: "consensus_result",
      payload: {
        status: verdict.approved ? "pass" : "fail",
        reason: verdict.reason,
        score: verdict.score,
      },
    });

    return {
      success: verdict.approved,
      output: {
        status: verdict.approved ? "consensus-reached" : "consensus-rejected",
        rule,
        reason: verdict.reason,
        score: verdict.score,
        votes,
      },
      metadata: {
        rule,
        threshold: config.threshold,
        blackboard_domains: PATTERN_BLACKBOARD_DOMAIN_MAP["consensus"],
        required_participants: requiredParticipants,
        best_effort: [...bestEffort],
        store_tally: tally ?? undefined,
      },
    };
  }

  private buildVoterRoleMap(config: ConsensusPatternConfig, participants: string[]): Map<string, VoterRole> {
    const map = new Map<string, VoterRole>();
    // Default all to "ai"
    for (const p of participants) {
      map.set(p, "ai");
    }
    // Override from config
    if (config.voter_roles) {
      for (const rc of config.voter_roles) {
        for (const v of rc.voters) {
          map.set(v, rc.role);
        }
      }
    }
    return map;
  }

  private shouldEscalate(trigger: EscalationTrigger, config: ConsensusPatternConfig): boolean {
    return config.escalation?.triggers?.includes(trigger) === true;
  }

  private async buildEscalationResult(
    trigger: EscalationTrigger,
    config: ConsensusPatternConfig,
    participants: string[],
    votes: NormalizedVote[],
    rule: string,
    requiredParticipants: string[],
    bestEffort: Set<string>,
    tally: unknown,
    context: PatternRuntimeContext,
  ): Promise<PatternPayloadResult> {
    await context.emit?.({
      type: "consensus_escalation",
      payload: {
        trigger,
        escalation_target: config.escalation?.target,
        participants,
        votes,
        rule,
      },
    });

    return {
      success: false,
      output: {
        status: "escalated",
        trigger,
        escalation_target: config.escalation?.target,
        reason: OboraErrorCode.RECOVERY_ESCALATION_TIMEOUT,
        participants,
        votes,
      },
      metadata: {
        rule,
        blackboard_domains: PATTERN_BLACKBOARD_DOMAIN_MAP["consensus"],
        required_participants: requiredParticipants,
        best_effort: [...bestEffort],
        store_tally: tally ?? undefined,
      },
    };
  }

  private getConsensusInput(context: PatternRuntimeContext): ConsensusInputShape {
    const input = context.input;
    if (!input || typeof input !== "object") {
      return {};
    }

    return input as ConsensusInputShape;
  }

  private collectVotes(participants: string[], rawVotes: Record<string, VoteValue> | undefined, roleMap: Map<string, VoterRole>): NormalizedVote[] {
    if (!rawVotes) {
      return [];
    }

    const votes: NormalizedVote[] = [];
    for (const participant of participants) {
      if (!(participant in rawVotes)) {
        continue;
      }

      const vote = this.normalizeVote(participant, rawVotes[participant]);
      vote.role = roleMap.get(participant) ?? "ai";
      votes.push(vote);
    }

    return votes;
  }

  private normalizeVote(voterId: string, vote: VoteValue): NormalizedVote {
    if (typeof vote === "boolean") {
      return { voterId, approved: vote };
    }

    if (typeof vote === "number") {
      return { voterId, approved: vote > 0, score: vote };
    }

    if (vote && typeof vote === "object") {
      const approved = typeof vote.approved === "boolean" ? vote.approved : Boolean(vote.score && Number(vote.score) > 0);
      const score = typeof vote.score === "number" ? vote.score : undefined;
      const reason = typeof vote.reason === "string" ? vote.reason : undefined;
      return { voterId, approved, score, reason };
    }

    return { voterId, approved: false };
  }

  private hasTimedOut(timeoutMs: number, startedAt: Date | string | undefined, context: PatternRuntimeContext): boolean {
    const now = this.resolveNow(context);
    const start = resolveStartTime(startedAt, now);
    return now.getTime() - start.getTime() >= timeoutMs;
  }

  private resolveNow(context: PatternRuntimeContext): Date {
    const nowFn = (context as PatternRuntimeContext & { now?: unknown }).now;
    if (typeof nowFn === "function") {
      const now = nowFn();
      if (now instanceof Date) {
        return now;
      }
    }
    return new Date();
  }

  private evaluateRule(
    rule: NonNullable<ConsensusPatternConfig["rule"]>,
    votes: NormalizedVote[],
    participants: string[],
    requiredParticipants: string[],
    config: ConsensusPatternConfig,
    context: PatternRuntimeContext
  ): { approved: boolean; reason: string; score?: number } {
    if (rule === "unanimous") {
      const rejected = votes.some((vote) => requiredParticipants.includes(vote.voterId) && !vote.approved);
      return {
        approved: !rejected,
        reason: rejected ? "unanimous consensus rejected" : "unanimous consensus reached",
      };
    }

    if (rule === "weighted") {
      const threshold = config.threshold ?? DEFAULT_THRESHOLD_BY_RULE.weighted;
      // M2-03A: only required participants influence weighted verdict
      const requiredVotes = votes.filter((vote) => requiredParticipants.includes(vote.voterId));
      const totalWeight = requiredVotes.reduce((sum, vote) => sum + (config.weights?.[vote.voterId] ?? 1), 0);
      const approvedWeight = requiredVotes
        .filter((vote) => vote.approved)
        .reduce((sum, vote) => sum + (config.weights?.[vote.voterId] ?? 1), 0);
      const ratio = totalWeight <= 0 ? 0 : approvedWeight / totalWeight;
      return {
        approved: ratio >= threshold,
        reason: ratio >= threshold ? "weighted threshold met" : "weighted threshold not met",
        score: ratio,
      };
    }

    if (rule === "score-threshold") {
      const threshold = config.threshold ?? DEFAULT_THRESHOLD_BY_RULE["score-threshold"];
      // M2-03A: only required participants influence score-threshold verdict
      const requiredVotes = votes.filter((vote) => requiredParticipants.includes(vote.voterId));
      const scoredVotes = requiredVotes.filter((vote) => typeof vote.score === "number");
      const average = scoredVotes.length === 0 ? 0 : scoredVotes.reduce((sum, vote) => sum + (vote.score ?? 0), 0) / scoredVotes.length;
      return {
        approved: average >= threshold,
        reason: average >= threshold ? "score threshold met" : "score threshold not met",
        score: average,
      };
    }

    if (rule === "custom") {
      const evaluator = this.resolveCustomEvaluator(config, context);
      const custom = evaluator({ votes, participants, requiredParticipants, config });
      if (typeof custom === "boolean") {
        return {
          approved: custom,
          reason: custom ? "custom rule approved" : "custom rule rejected",
        };
      }

      return {
        approved: custom.approved,
        reason: custom.reason ?? (custom.approved ? "custom rule approved" : "custom rule rejected"),
        score: custom.score,
      };
    }

    // majority: only required participants influence decision/score.
    // best_effort voters contribute telemetry but must not overturn required-majority verdict.
    const requiredApprovedCount = votes.filter(
      (vote) => requiredParticipants.includes(vote.voterId) && vote.approved
    ).length;
    const required = Math.floor(requiredParticipants.length / 2) + 1;
    const approved = requiredApprovedCount >= required;
    return {
      approved,
      reason: approved ? "majority reached" : "majority not reached",
      score: requiredParticipants.length === 0 ? 0 : requiredApprovedCount / requiredParticipants.length,
    };
  }

  private resolveCustomEvaluator(config: ConsensusPatternConfig, context: PatternRuntimeContext): CustomEvaluator {
    const configFn = (config as ConsensusPatternConfig & { custom_evaluate?: unknown }).custom_evaluate;
    if (typeof configFn === "function") {
      return configFn as CustomEvaluator;
    }

    const contextFn = (context as PatternRuntimeContext & { customConsensusEvaluate?: unknown }).customConsensusEvaluate;
    if (typeof contextFn === "function") {
      return contextFn as CustomEvaluator;
    }

    throw new Error("consensus.rule='custom' requires custom_evaluate function");
  }
}

function parseTimeoutToMs(timeout?: string): number | undefined {
  if (!timeout) {
    return undefined;
  }

  const match = timeout.trim().match(/^(\d+)(ms|s|m|h)$/);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  const unit = match[2];
  if (unit === "ms") return value;
  if (unit === "s") return value * 1_000;
  if (unit === "m") return value * 60_000;
  return value * 3_600_000;
}

function resolveStartTime(startedAt: Date | string | undefined, fallback: Date): Date {
  if (startedAt instanceof Date) {
    return startedAt;
  }

  if (typeof startedAt === "string") {
    const parsed = new Date(startedAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return fallback;
}
