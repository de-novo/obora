import type { VotingPolicy, TallyResult, VotingSessionId } from '../voting';

export const CONSENSUS_STATUSES = ['APPROVED', 'REJECTED', 'CONDITIONAL', 'ESCALATED'] as const;
export type ConsensusStatus = (typeof CONSENSUS_STATUSES)[number];

export interface VotingSessionSnapshot {
  sessionId: VotingSessionId;
  policy: VotingPolicy;
  tally: TallyResult;
}

export interface ConsensusCondition {
  code: string;
  description: string;
}

export interface ConsensusEscalation {
  reason: string;
  requiredRoles: string[];
}

export interface ConsensusResult {
  sessionId: VotingSessionId;
  status: ConsensusStatus;
  approved: boolean;
  summary: string;
  snapshot: VotingSessionSnapshot;
  conditions?: ConsensusCondition[];
  escalation?: ConsensusEscalation;
  dissentingVoterIds?: string[];
}

export function isConsensusResult(value: unknown): value is ConsensusResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ConsensusResult>;

  // 기본 필드 검증
  if (!candidate.sessionId || typeof candidate.sessionId !== 'string') {
    return false;
  }

  if (!candidate.status || !CONSENSUS_STATUSES.includes(candidate.status as ConsensusStatus)) {
    return false;
  }

  if (typeof candidate.approved !== 'boolean' || typeof candidate.summary !== 'string') {
    return false;
  }

  const snapshot = candidate.snapshot as Partial<VotingSessionSnapshot> | undefined;

  if (!snapshot || typeof snapshot.sessionId !== 'string') {
    return false;
  }

  // tally 필드 구조 검증
  const tally = snapshot.tally as Partial<TallyResult> | undefined;
  if (!tally || typeof tally.sessionId !== 'string') {
    return false;
  }

  // 숫자 필드 검증
  if (typeof tally.totalVotes !== 'number' || typeof tally.approves !== 'number' ||
      typeof tally.rejects !== 'number' || typeof tally.abstains !== 'number') {
    return false;
  }

  // 불리언 필드 검증
  if (typeof tally.passed !== 'boolean' || typeof tally.quorumMet !== 'boolean') {
    return false;
  }

  // conditions 배열 검증 (존재 시)
  if (candidate.conditions) {
    if (!Array.isArray(candidate.conditions) || candidate.conditions.length === 0) {
      return false;
    }
    for (const cond of candidate.conditions) {
      if (!cond || typeof cond.code !== 'string' || typeof cond.description !== 'string') {
        return false;
      }
    }
  }

  // escalation 객체 검증 (존재 시)
  if (candidate.escalation) {
    if (!candidate.escalation || typeof candidate.escalation.reason !== 'string' ||
        !Array.isArray(candidate.escalation.requiredRoles)) {
      return false;
    }
    for (const role of candidate.escalation.requiredRoles) {
      if (typeof role !== 'string') {
        return false;
      }
    }
  }

  return true;
}
