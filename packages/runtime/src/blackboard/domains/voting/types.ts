import type { AgentId, AgendaId, SessionId } from '../../types';

export type VotingSessionId = SessionId;

export const VOTING_SESSION_STATUSES = ['PENDING', 'OPEN', 'CLOSED'] as const;
export type VotingSessionStatus = (typeof VOTING_SESSION_STATUSES)[number];

export type VotingPolicy = 'majority' | 'unanimous' | 'weighted';

export interface VotingSession {
  id: VotingSessionId;
  agendaId: AgendaId;
  status: VotingSessionStatus;
  policy: VotingPolicy;
  quorum: number;
  createdBy: AgentId;
  createdAt: Date;
  openedAt?: Date;
  closedAt?: Date;
}

export interface Vote {
  sessionId: VotingSessionId;
  voterId: AgentId;
  option: 'approve' | 'reject' | 'abstain';
  weight?: number;
  timestamp: Date;
}

export interface TallyResult {
  sessionId: VotingSessionId;
  totalVotes: number;
  approves: number;
  rejects: number;
  abstains: number;
  passed: boolean;
  quorumMet: boolean;
}
