import { createSessionId } from '../../types';
import { VotingSession, Vote, TallyResult } from './types';

export class VotingSessionStore {
  private sessions: Map<string, VotingSession> = new Map();
  private votes: Map<string, Vote[]> = new Map();

  create(params: Omit<VotingSession, 'id' | 'createdAt' | 'status'>): VotingSession {
    const session: VotingSession = {
      ...params,
      id: createSessionId(crypto.randomUUID()),
      status: 'PENDING',
      createdAt: new Date(),
    };
    this.sessions.set(session.id, session);
    this.votes.set(session.id, []);
    return session;
  }

  get(id: string): VotingSession | undefined {
    return this.sessions.get(id);
  }

  getByAgendaId(agendaId: string): VotingSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.agendaId === agendaId);
  }

  open(id: string): VotingSession | undefined {
    const session = this.sessions.get(id);
    if (!session || session.status !== 'PENDING') {
      return undefined;
    }
    session.status = 'OPEN';
    session.openedAt = new Date();
    return session;
  }

  close(id: string): VotingSession | undefined {
    const session = this.sessions.get(id);
    if (!session || session.status !== 'OPEN') {
      return undefined;
    }
    session.status = 'CLOSED';
    session.closedAt = new Date();
    return session;
  }

  addVote(vote: Omit<Vote, 'timestamp'>): Vote | null {
    const session = this.sessions.get(vote.sessionId);
    if (!session || session.status !== 'OPEN') {
      return null;
    }

    const votes = this.votes.get(vote.sessionId) || [];
    // 중복 투표 체크 (같은 유저가 다시 투표하면 기존 투표를 대체)
    const existingIndex = votes.findIndex((v) => v.voterId === vote.voterId);

    const newVote: Vote = {
      ...vote,
      timestamp: new Date(),
    };

    if (existingIndex >= 0) {
      votes[existingIndex] = newVote;
    } else {
      votes.push(newVote);
    }

    this.votes.set(vote.sessionId, votes);
    return newVote;
  }

  getVotes(sessionId: string): Vote[] {
    return this.votes.get(sessionId) || [];
  }

  getTally(sessionId: string): TallyResult | null {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const votes = this.getVotes(sessionId);
    const approves = votes.filter((v) => v.option === 'approve').length;
    const rejects = votes.filter((v) => v.option === 'reject').length;
    const abstains = votes.filter((v) => v.option === 'abstain').length;
    const totalVotes = votes.length;

    let passed = false;

    switch (session.policy) {
      case 'majority': {
        // 과반수 승인 (기권 제외)
        const majorityVotes = totalVotes - abstains;
        passed = majorityVotes > 0 && approves > majorityVotes / 2;
        break;
      }
      case 'unanimous':
        // 만장일치 (반대 없고 기권 포함 전체 동의)
        passed = rejects === 0;
        break;
      case 'weighted': {
        // 가중치 기반
        const approveWeight = votes
          .filter((v) => v.option === 'approve')
          .reduce((sum, v) => sum + (v.weight || 1), 0);
        const totalWeight = votes.reduce((sum, v) => sum + (v.weight || 1), 0);
        passed = totalWeight > 0 && approveWeight > totalWeight / 2;
        break;
      }
    }

    // 정족수 체크
    const quorumMet = totalVotes >= session.quorum;

    return {
      sessionId: session.id,
      totalVotes,
      approves,
      rejects,
      abstains,
      passed,
      quorumMet,
    };
  }

  delete(id: string): boolean {
    const deleted = this.sessions.delete(id);
    this.votes.delete(id);
    return deleted;
  }
}
