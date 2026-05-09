import type { TallyResult } from '../voting';
import type {
  ConsensusCondition,
  ConsensusEscalation,
  ConsensusResult,
  VotingSessionSnapshot,
} from './types';

export type ConsensusMethod = VotingSessionSnapshot['policy'] | 'supermajority';

export interface EvaluateConsensusOptions {
  method?: ConsensusMethod;
  supermajorityThreshold?: number;
  conditionalCodes?: string[];
  escalation?: ConsensusEscalation;
  summary?: string;
}

function getApprovedByMethod(
  method: ConsensusMethod,
  tally: TallyResult,
  supermajorityThreshold: number,
): boolean {
  if (!tally.quorumMet) {
    return false;
  }

  switch (method) {
    case 'majority':
    case 'weighted':
      return tally.passed;
    case 'unanimous':
      // 기권(abstains)은 투표 수에 포함하나 거부가 없으면 만장일치로 간주
      return tally.totalVotes > 0 && tally.rejects === 0 && tally.approves === tally.totalVotes - tally.abstains;
    case 'supermajority': {
      const supportRatio = tally.totalVotes === 0 ? 0 : tally.approves / tally.totalVotes;
      return supportRatio >= supermajorityThreshold;
    }
    default: {
      const _exhaustive: never = method;
      return false;
    }
  }
}

function toConditions(codes?: string[]): ConsensusCondition[] | undefined {
  if (!codes || codes.length === 0) {
    return undefined;
  }

  // 중복 제거, 빈 문자열 제거, trim
  const normalized = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];

  if (normalized.length === 0) {
    return undefined;
  }

  return normalized.map((code) => ({
    code,
    description: code,
  }));
}

export function evaluateConsensus(
  snapshot: VotingSessionSnapshot,
  options: EvaluateConsensusOptions = {},
): ConsensusResult {
  const method = options.method ?? snapshot.policy;

  // supermajorityThreshold 검증: 유효한 숫자이고 [0, 1] 범위여야 함
  const rawThreshold = options.supermajorityThreshold ?? 2 / 3;
  const threshold =
    Number.isFinite(rawThreshold) && rawThreshold >= 0 && rawThreshold <= 1
      ? rawThreshold
      : 2 / 3;

  const conditions = toConditions(options.conditionalCodes);

  const approved = getApprovedByMethod(method, snapshot.tally, threshold);

  const status = options.escalation
    ? 'ESCALATED'
    : conditions && conditions.length > 0
      ? 'CONDITIONAL'
      : approved
        ? 'APPROVED'
        : 'REJECTED';

  return {
    sessionId: snapshot.sessionId,
    status,
    approved,
    summary: options.summary ?? `${method} rule evaluated`,
    snapshot,
    ...(conditions ? { conditions } : {}),
    ...(options.escalation ? { escalation: options.escalation } : {}),
  };
}
