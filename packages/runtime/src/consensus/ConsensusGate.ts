import type { AuditTrail } from "../audit/AuditTrail.js";
import { VotingSessionStore } from "./voting/VotingSessionStore.js";
import { createAgendaId, createAgentId, createSessionId } from "../blackboard/types/base.js";

export interface ConsensusVoterSpec {
  id: string;
  weight?: number;
}

export interface ConsensusIssue {
  severity: "P0" | "P1" | "P2";
  description: string;
}

export interface ConsensusVoteInput {
  voterId: string;
  score?: number;
  approved: boolean;
  issues?: ConsensusIssue[];
  timestamp?: Date;
}

export interface ConsensusVote {
  voterId: string;
  score?: number;
  approved: boolean;
  issues?: ConsensusIssue[];
  timestamp: Date;
}

export interface ConsensusConfig {
  type: "majority" | "unanimous" | "weighted" | "score-threshold" | "custom";
  voters: ConsensusVoterSpec[];
  minRequired: number;
  threshold?: number;
  timeout?: string;
  bestEffort?: string[];
  customEvaluate?: (votes: ConsensusVote[]) => GateConsensusResult;
}

export interface ConsensusSession {
  id: string;
  config: ConsensusConfig;
  startedAt: Date;
  bestEffortMarked: string[];
}

export type GateConsensusResult =
  | { status: "pass"; votes: ConsensusVote[] }
  | { status: "fail"; reason: string; votes: ConsensusVote[] }
  | { status: "pending"; received: number; required: number }
  | { status: "timeout"; partial: ConsensusVote[] };

export interface ConsensusGate {
  setup(config: ConsensusConfig): ConsensusSession;
  registerVote(sessionId: string, vote: ConsensusVoteInput): void;
  evaluate(sessionId: string): GateConsensusResult;
  onTimeout(sessionId: string): GateConsensusResult;
  markBestEffort(sessionId: string, voterId: string): void;
}

interface SessionState {
  session: ConsensusSession;
  votes: Map<string, ConsensusVote>;
}

const parseTimeoutToMs = (timeout?: string): number | undefined => {
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
};

/** Clamp a score value to [0, 1]. Undefined scores pass through unchanged. */
const clampScore = (score: number | undefined): number | undefined =>
  score === undefined ? undefined : Math.max(0, Math.min(1, score));
const cloneVotes = (votes: Iterable<ConsensusVote>): ConsensusVote[] =>
  Array.from(votes).map((vote) => ({ ...vote, timestamp: new Date(vote.timestamp) }));

export class DefaultConsensusGate implements ConsensusGate {
  private readonly sessions = new Map<string, SessionState>();
  private readonly votingSessionStore: VotingSessionStore;

  constructor(
    private readonly options: {
      executionId: string;
      auditTrail?: AuditTrail;
      votingSessionStore?: VotingSessionStore;
      now?: () => Date;
      sessionIdFactory?: () => string;
    }
  ) {
    this.votingSessionStore = options.votingSessionStore ?? new VotingSessionStore();
  }

  setup(config: ConsensusConfig): ConsensusSession {
    if (config.minRequired <= 0) {
      throw new Error("ConsensusConfig.minRequired must be greater than 0");
    }

    const voterIds = new Set(config.voters.map((voter) => voter.id));
    if (voterIds.size !== config.voters.length) {
      throw new Error("ConsensusConfig.voters must be unique");
    }

    const sessionId = this.options.sessionIdFactory?.() ?? crypto.randomUUID();
    const startedAt = this.options.now?.() ?? new Date();
    const session: ConsensusSession = {
      id: sessionId,
      config: {
        ...config,
        bestEffort: config.bestEffort ?? [],
      },
      startedAt,
      bestEffortMarked: [],
    };

    const internalSession = this.votingSessionStore.create({
      agendaId: createAgendaId(`consensus:${sessionId}`),
      policy:
        config.type === "score-threshold" || config.type === "custom"
          ? "majority"
          : config.type,
      quorum: config.minRequired,
      createdBy: createAgentId("runtime:consensus-gate"),
    });
    this.votingSessionStore.open(internalSession.id);

    this.sessions.set(sessionId, {
      session,
      votes: new Map<string, ConsensusVote>(),
    });

    return { ...session, startedAt: new Date(startedAt), bestEffortMarked: [...session.bestEffortMarked] };
  }

  registerVote(sessionId: string, vote: ConsensusVoteInput): void {
    const state = this.requireState(sessionId);
    const timestamp = vote.timestamp ?? (this.options.now?.() ?? new Date());
    const resolvedVote: ConsensusVote = {
      voterId: createAgentId(vote.voterId),
      score: clampScore(vote.score),
      approved: vote.approved,
      issues: vote.issues,
      timestamp,
    };

    state.votes.set(vote.voterId, resolvedVote);

    this.votingSessionStore.addVote({
      sessionId: createSessionId(this.findVotingSessionId(sessionId)),
      voterId: createAgentId(vote.voterId),
      option: vote.approved ? "approve" : "reject",
      weight: state.session.config.voters.find((v) => v.id === vote.voterId)?.weight,
    });

    void this.options.auditTrail?.record({
      id: crypto.randomUUID(),
      executionId: this.options.executionId,
      timestamp: new Date(timestamp),
      type: "consensus_vote",
      data: {
        sessionId,
        vote: resolvedVote,
      },
    });
  }

  evaluate(sessionId: string): GateConsensusResult {
    const state = this.requireState(sessionId);
    const result = this.evaluateInternal(state, false);
    this.recordConsensusResult(sessionId, result);
    return result;
  }

  onTimeout(sessionId: string): GateConsensusResult {
    const state = this.requireState(sessionId);
    const result: GateConsensusResult = {
      status: "timeout",
      partial: cloneVotes(state.votes.values()),
    };
    this.recordConsensusResult(sessionId, result);
    return result;
  }

  markBestEffort(sessionId: string, voterId: string): void {
    const state = this.requireState(sessionId);
    if (!state.session.bestEffortMarked.includes(voterId)) {
      state.session.bestEffortMarked.push(voterId);
    }
  }

  private evaluateInternal(state: SessionState, timedOut: boolean): GateConsensusResult {
    if (timedOut) {
      return {
        status: "timeout",
        partial: cloneVotes(state.votes.values()),
      };
    }

    const timeoutMs = parseTimeoutToMs(state.session.config.timeout);
    if (timeoutMs) {
      const now = this.options.now?.() ?? new Date();
      if (now.getTime() - state.session.startedAt.getTime() > timeoutMs) {
        return {
          status: "timeout",
          partial: cloneVotes(state.votes.values()),
        };
      }
    }

    const votes = cloneVotes(state.votes.values());
    const effectiveMinRequired = Math.max(
      0,
      state.session.config.minRequired - state.session.bestEffortMarked.length,
    );

    if (votes.length < effectiveMinRequired) {
      return {
        status: "pending",
        received: votes.length,
        required: effectiveMinRequired,
      };
    }

    if (state.session.config.type === "custom" && state.session.config.customEvaluate) {
      return state.session.config.customEvaluate(votes);
    }

    // M2-03A: only required voters (not best_effort-marked) influence pass/fail verdict
    const bestEffortSet = new Set([
      ...(state.session.config.bestEffort ?? []),
      ...state.session.bestEffortMarked,
    ]);
    const requiredVotes = votes.filter((vote) => !bestEffortSet.has(vote.voterId));

    const rejectVote = requiredVotes.find((vote) => vote.approved === false);
    const approvalCount = requiredVotes.filter((vote) => vote.approved).length;

    if (state.session.config.type === "unanimous") {
      if (rejectVote) {
        return { status: "fail", reason: "unanimous consensus rejected", votes };
      }
      return { status: "pass", votes };
    }

    if (state.session.config.type === "score-threshold") {
      const threshold = state.session.config.threshold ?? 0;
      const scoredVotes = requiredVotes.filter((vote) => typeof vote.score === "number");
      if (scoredVotes.length === 0) {
        return { status: "fail", reason: "no scored votes provided", votes };
      }
      const averageScore =
        scoredVotes.reduce((sum, vote) => sum + (vote.score ?? 0), 0) / scoredVotes.length;
      if (averageScore >= threshold) {
        return { status: "pass", votes };
      }
      return { status: "fail", reason: `score threshold not met: ${averageScore} < ${threshold}`, votes };
    }

    if (state.session.config.type === "weighted") {
      const approveWeight = requiredVotes
        .filter((vote) => vote.approved)
        .reduce((sum, vote) => sum + (this.findWeight(state, vote.voterId) ?? 1), 0);
      const totalWeight = requiredVotes.reduce(
        (sum, vote) => sum + (this.findWeight(state, vote.voterId) ?? 1),
        0,
      );
      if (totalWeight <= 0) {
        return { status: "fail", reason: "invalid total vote weight", votes };
      }
      if (approveWeight > totalWeight / 2) {
        return { status: "pass", votes };
      }
      return { status: "fail", reason: "weighted majority not reached", votes };
    }

    if (approvalCount > requiredVotes.length / 2) {
      return { status: "pass", votes };
    }

    return { status: "fail", reason: "majority not reached", votes };
  }

  private findVotingSessionId(consensusSessionId: string): string {
    const sessions = this.votingSessionStore.getByAgendaId(`consensus:${consensusSessionId}`);
    const latest = sessions[sessions.length - 1];
    if (!latest) {
      throw new Error(`VotingSession is not initialized for consensus session: ${consensusSessionId}`);
    }
    return latest.id;
  }

  private findWeight(state: SessionState, voterId: string): number | undefined {
    return state.session.config.voters.find((voter) => voter.id === voterId)?.weight;
  }

  private requireState(sessionId: string): SessionState {
    const state = this.sessions.get(sessionId);
    if (!state) {
      throw new Error(`Consensus session not found: ${sessionId}`);
    }
    return state;
  }

  private recordConsensusResult(sessionId: string, result: GateConsensusResult): void {
    void this.options.auditTrail?.record({
      id: crypto.randomUUID(),
      executionId: this.options.executionId,
      timestamp: this.options.now?.() ?? new Date(),
      type: "consensus_result",
      data: {
        sessionId,
        result,
      },
    });
  }
}
