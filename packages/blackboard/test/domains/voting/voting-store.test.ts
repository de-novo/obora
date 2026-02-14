import { describe, it, expect, beforeEach } from 'vitest';
import { VotingSessionStore } from '../../../src/domains/voting/VotingSessionStore';
import type { AgentId, AgendaId } from '../../../src/types';

describe('VotingSessionStore', () => {
  let store: VotingSessionStore;
  let agentId: AgentId;
  let agendaId: AgendaId;

  beforeEach(() => {
    store = new VotingSessionStore();
    agentId = 'agent-1' as AgentId;
    agendaId = 'agenda-1' as AgendaId;
  });

  describe('create()', () => {
    it('should create a new voting session with PENDING status', () => {
      const session = store.create({
        agendaId,
        status: 'PENDING',
        policy: 'majority',
        quorum: 2,
        createdBy: agentId,
      });

      expect(session).toBeDefined();
      expect(session.id).toBeDefined();
      expect(session.status).toBe('PENDING');
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.openedAt).toBeUndefined();
      expect(session.closedAt).toBeUndefined();
    });

    it('should store the session by ID', () => {
      const session = store.create({
        agendaId,
        status: 'PENDING',
        policy: 'majority',
        quorum: 2,
        createdBy: agentId,
      });

      const retrieved = store.get(session.id);
      expect(retrieved).toEqual(session);
    });
  });

  describe('get()', () => {
    it('should return undefined for non-existent session', () => {
      expect(store.get('non-existent')).toBeUndefined();
    });

    it('should return the session for valid ID', () => {
      const session = store.create({
        agendaId,
        status: 'PENDING',
        policy: 'majority',
        quorum: 2,
        createdBy: agentId,
      });

      expect(store.get(session.id)).toEqual(session);
    });
  });

  describe('getByAgendaId()', () => {
    it('should return empty array for non-existent agenda', () => {
      expect(store.getByAgendaId('non-existent' as AgendaId)).toEqual([]);
    });

    it('should return all sessions for the agenda', () => {
      const session1 = store.create({
        agendaId,
        status: 'PENDING',
        policy: 'majority',
        quorum: 2,
        createdBy: agentId,
      });

      const session2 = store.create({
        agendaId,
        status: 'PENDING',
        policy: 'unanimous',
        quorum: 3,
        createdBy: agentId,
      });

      store.create({
        agendaId: 'agenda-2' as AgendaId,
        status: 'PENDING',
        policy: 'majority',
        quorum: 2,
        createdBy: agentId,
      });

      const sessions = store.getByAgendaId(agendaId);
      expect(sessions).toHaveLength(2);
      expect(sessions.map((s) => s.id)).toContain(session1.id);
      expect(sessions.map((s) => s.id)).toContain(session2.id);
    });
  });

  describe('open()', () => {
    it('should open a PENDING session', () => {
      const session = store.create({
        agendaId,
        status: 'PENDING',
        policy: 'majority',
        quorum: 2,
        createdBy: agentId,
      });

      const opened = store.open(session.id);

      expect(opened).toBeDefined();
      expect(opened?.status).toBe('OPEN');
      expect(opened?.openedAt).toBeInstanceOf(Date);

      const retrieved = store.get(session.id);
      expect(retrieved?.status).toBe('OPEN');
    });

    it('should return undefined for non-existent session', () => {
      expect(store.open('non-existent')).toBeUndefined();
    });

    it('should return undefined for already OPEN session', () => {
      const session = store.create({
        agendaId,
        status: 'PENDING',
        policy: 'majority',
        quorum: 2,
        createdBy: agentId,
      });

      store.open(session.id);
      const result = store.open(session.id);

      expect(result).toBeUndefined();
    });
  });

  describe('close()', () => {
    it('should close an OPEN session', () => {
      const session = store.create({
        agendaId,
        status: 'PENDING',
        policy: 'majority',
        quorum: 2,
        createdBy: agentId,
      });

      store.open(session.id);
      const closed = store.close(session.id);

      expect(closed).toBeDefined();
      expect(closed?.status).toBe('CLOSED');
      expect(closed?.closedAt).toBeInstanceOf(Date);
    });

    it('should return undefined for non-existent session', () => {
      expect(store.close('non-existent')).toBeUndefined();
    });

    it('should return undefined for PENDING session', () => {
      const session = store.create({
        agendaId,
        status: 'PENDING',
        policy: 'majority',
        quorum: 2,
        createdBy: agentId,
      });

      expect(store.close(session.id)).toBeUndefined();
    });
  });

  describe('addVote()', () => {
    let session: ReturnType<VotingSessionStore['create']>;

    beforeEach(() => {
      session = store.create({
        agendaId,
        status: 'PENDING',
        policy: 'majority',
        quorum: 2,
        createdBy: agentId,
      });
      store.open(session.id);
    });

    it('should add a vote to an open session', () => {
      const vote = store.addVote({
        sessionId: session.id,
        voterId: agentId,
        option: 'approve',
      });

      expect(vote).toBeDefined();
      expect(vote?.option).toBe('approve');
      expect(vote?.timestamp).toBeInstanceOf(Date);

      const votes = store.getVotes(session.id);
      expect(votes).toHaveLength(1);
    });

    it('should return null for closed session', () => {
      store.close(session.id);

      const vote = store.addVote({
        sessionId: session.id,
        voterId: agentId,
        option: 'approve',
      });

      expect(vote).toBeNull();
    });

    it('should replace existing vote from same voter', () => {
      store.addVote({
        sessionId: session.id,
        voterId: agentId,
        option: 'approve',
      });

      store.addVote({
        sessionId: session.id,
        voterId: agentId,
        option: 'reject',
      });

      const votes = store.getVotes(session.id);
      expect(votes).toHaveLength(1);
      expect(votes[0].option).toBe('reject');
    });
  });

  describe('getTally() - majority', () => {
    let session: ReturnType<VotingSessionStore['create']>;

    beforeEach(() => {
      session = store.create({
        agendaId,
        status: 'PENDING',
        policy: 'majority',
        quorum: 2,
        createdBy: agentId,
      });
      store.open(session.id);
    });

    it('should calculate majority - approve wins', () => {
      store.addVote({ sessionId: session.id, voterId: 'v1' as AgentId, option: 'approve' });
      store.addVote({ sessionId: session.id, voterId: 'v2' as AgentId, option: 'approve' });
      store.addVote({ sessionId: session.id, voterId: 'v3' as AgentId, option: 'reject' });

      const tally = store.getTally(session.id);

      expect(tally).toBeDefined();
      expect(tally?.approves).toBe(2);
      expect(tally?.rejects).toBe(1);
      expect(tally?.totalVotes).toBe(3);
      expect(tally?.passed).toBe(true); // 2 > (3 - 0) / 2
      expect(tally?.quorumMet).toBe(true);
    });

    it('should calculate majority - reject wins', () => {
      store.addVote({ sessionId: session.id, voterId: 'v1' as AgentId, option: 'approve' });
      store.addVote({ sessionId: session.id, voterId: 'v2' as AgentId, option: 'reject' });
      store.addVote({ sessionId: session.id, voterId: 'v3' as AgentId, option: 'reject' });

      const tally = store.getTally(session.id);

      expect(tally?.passed).toBe(false);
    });

    it('should treat abstains as non-votes for majority', () => {
      store.addVote({ sessionId: session.id, voterId: 'v1' as AgentId, option: 'approve' });
      store.addVote({ sessionId: session.id, voterId: 'v2' as AgentId, option: 'abstain' });
      store.addVote({ sessionId: session.id, voterId: 'v3' as AgentId, option: 'abstain' });

      const tally = store.getTally(session.id);

      // 1 approve out of 1 non-abstain votes → passes
      expect(tally?.passed).toBe(true);
    });
  });

  describe('getTally() - unanimous', () => {
    let session: ReturnType<VotingSessionStore['create']>;

    beforeEach(() => {
      session = store.create({
        agendaId,
        status: 'PENDING',
        policy: 'unanimous',
        quorum: 2,
        createdBy: agentId,
      });
      store.open(session.id);
    });

    it('should pass with no rejects', () => {
      store.addVote({ sessionId: session.id, voterId: 'v1' as AgentId, option: 'approve' });
      store.addVote({ sessionId: session.id, voterId: 'v2' as AgentId, option: 'abstain' });

      const tally = store.getTally(session.id);

      expect(tally?.passed).toBe(true);
    });

    it('should fail with any reject', () => {
      store.addVote({ sessionId: session.id, voterId: 'v1' as AgentId, option: 'approve' });
      store.addVote({ sessionId: session.id, voterId: 'v2' as AgentId, option: 'reject' });

      const tally = store.getTally(session.id);

      expect(tally?.passed).toBe(false);
    });
  });

  describe('getTally() - weighted', () => {
    let session: ReturnType<VotingSessionStore['create']>;

    beforeEach(() => {
      session = store.create({
        agendaId,
        status: 'PENDING',
        policy: 'weighted',
        quorum: 2,
        createdBy: agentId,
      });
      store.open(session.id);
    });

    it('should calculate based on weights', () => {
      store.addVote({ sessionId: session.id, voterId: 'v1' as AgentId, option: 'approve', weight: 3 });
      store.addVote({ sessionId: session.id, voterId: 'v2' as AgentId, option: 'reject', weight: 1 });

      const tally = store.getTally(session.id);

      expect(tally?.passed).toBe(true); // 3 > 4 / 2
    });

    it('should fail when approve weight is minority', () => {
      store.addVote({ sessionId: session.id, voterId: 'v1' as AgentId, option: 'approve', weight: 1 });
      store.addVote({ sessionId: session.id, voterId: 'v2' as AgentId, option: 'reject', weight: 3 });

      const tally = store.getTally(session.id);

      expect(tally?.passed).toBe(false);
    });
  });

  describe('getTally() - quorum', () => {
    let session: ReturnType<VotingSessionStore['create']>;

    beforeEach(() => {
      session = store.create({
        agendaId,
        status: 'PENDING',
        policy: 'majority',
        quorum: 3, // 최소 3명 필요
        createdBy: agentId,
      });
      store.open(session.id);
    });

    it('should mark quorum as not met when votes insufficient', () => {
      store.addVote({ sessionId: session.id, voterId: 'v1' as AgentId, option: 'approve' });
      store.addVote({ sessionId: session.id, voterId: 'v2' as AgentId, option: 'approve' });

      const tally = store.getTally(session.id);

      expect(tally?.quorumMet).toBe(false);
    });

    it('should mark quorum as met when votes sufficient', () => {
      store.addVote({ sessionId: session.id, voterId: 'v1' as AgentId, option: 'approve' });
      store.addVote({ sessionId: session.id, voterId: 'v2' as AgentId, option: 'approve' });
      store.addVote({ sessionId: session.id, voterId: 'v3' as AgentId, option: 'reject' });

      const tally = store.getTally(session.id);

      expect(tally?.quorumMet).toBe(true);
    });
  });

  describe('delete()', () => {
    it('should delete session and votes', () => {
      const session = store.create({
        agendaId,
        status: 'PENDING',
        policy: 'majority',
        quorum: 2,
        createdBy: agentId,
      });

      store.open(session.id);
      store.addVote({ sessionId: session.id, voterId: agentId, option: 'approve' });

      const deleted = store.delete(session.id);

      expect(deleted).toBe(true);
      expect(store.get(session.id)).toBeUndefined();
      expect(store.getVotes(session.id)).toEqual([]);
    });

    it('should return false for non-existent session', () => {
      expect(store.delete('non-existent')).toBe(false);
    });
  });
});
