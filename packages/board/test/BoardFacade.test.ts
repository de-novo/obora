import { describe, expect, it } from 'vitest';
import { BoardFacade, runMeeting } from '../src';

describe('BoardFacade', () => {
  // === Basic lifecycle ===

  it('creates agenda and moves workflow from idle', () => {
    const facade = new BoardFacade();
    expect(facade.getState()).toBe('idle');

    facade.createAgenda({ id: 'agenda-1', title: 'Kickoff' });

    expect(facade.getState()).toBe('agenda_setting');
  });

  it('supports vote -> consensus flow via facade APIs', () => {
    const facade = new BoardFacade();
    facade.createAgenda({ id: 'agenda-1', title: 'Kickoff' });

    const session = facade.startVoting('agenda-1', 'majority', 2);
    facade.recordVote(session.id, { voterId: 'a1', option: 'approve' });
    facade.recordVote(session.id, { voterId: 'a2', option: 'approve' });
    facade.closeVoting(session.id);

    const consensus = facade.computeConsensus(session.id, 'majority');
    expect(consensus?.approved).toBe(true);
    expect(facade.getState()).toBe('resolved');
  });

  // === runMeeting orchestration ===

  it('runMeeting orchestrates blackboard domains', async () => {
    const result = await runMeeting({
      agendas: [{ id: 'agenda-1', title: 'A1' }],
      votingPolicy: 'supermajority',
      supermajorityThreshold: 0.66,
      votesByAgendaId: {
        'agenda-1': [
          { voterId: 'a1', option: 'approve' },
          { voterId: 'a2', option: 'approve' },
          { voterId: 'a3', option: 'reject' },
        ],
      },
    });

    expect(result.consensusResults).toHaveLength(1);
    expect(result.snapshots).toHaveLength(1);
    expect(result.finalState).toBe('resolved');
    expect(result.consensusResults[0]?.approved).toBe(true);
  });

  it('applies supermajority decision threshold at consensus step', async () => {
    const result = await runMeeting({
      agendas: [{ id: 'agenda-2', title: 'Threshold check' }],
      votingPolicy: 'supermajority',
      supermajorityThreshold: 0.8,
      votesByAgendaId: {
        'agenda-2': [
          { voterId: 'a1', option: 'approve' },
          { voterId: 'a2', option: 'approve' },
          { voterId: 'a3', option: 'reject' },
        ],
      },
    });

    expect(result.consensusResults[0]?.approved).toBe(false);
  });

  // === Edge cases: BoardFacade ===

  it('listAgendas returns all created agendas', () => {
    const facade = new BoardFacade();
    facade.createAgenda({ id: 'a1', title: 'First' });
    facade.createAgenda({ id: 'a2', title: 'Second' });

    const agendas = facade.listAgendas();
    expect(agendas).toHaveLength(2);
    expect(agendas.map((a) => a.id)).toContain('a1');
    expect(agendas.map((a) => a.id)).toContain('a2');
  });

  it('listAgendas returns empty array initially', () => {
    const facade = new BoardFacade();
    expect(facade.listAgendas()).toHaveLength(0);
  });

  it('getMeetingSnapshot returns snapshot object', () => {
    const facade = new BoardFacade();
    const snapshot = facade.getMeetingSnapshot();
    expect(snapshot).toBeDefined();
    expect(snapshot.state).toBe('idle');
  });

  it('computeConsensus returns undefined for unknown session', () => {
    const facade = new BoardFacade();
    const result = facade.computeConsensus('nonexistent-session');
    expect(result).toBeUndefined();
  });

  it('rejection consensus when all votes reject', () => {
    const facade = new BoardFacade();
    facade.createAgenda({ id: 'a-reject', title: 'Reject test' });

    const session = facade.startVoting('a-reject', 'majority', 1);
    facade.recordVote(session.id, { voterId: 'v1', option: 'reject' });
    facade.recordVote(session.id, { voterId: 'v2', option: 'reject' });
    facade.closeVoting(session.id);

    const consensus = facade.computeConsensus(session.id, 'majority');
    expect(consensus?.approved).toBe(false);
  });

  it('abstain-only votes result in no approval', () => {
    const facade = new BoardFacade();
    facade.createAgenda({ id: 'a-abstain', title: 'Abstain test' });

    const session = facade.startVoting('a-abstain', 'majority', 1);
    facade.recordVote(session.id, { voterId: 'v1', option: 'abstain' });
    facade.recordVote(session.id, { voterId: 'v2', option: 'abstain' });
    facade.closeVoting(session.id);

    const consensus = facade.computeConsensus(session.id, 'majority');
    expect(consensus).toBeDefined();
    expect(consensus?.approved).toBe(false);
  });

  it('weighted voting respects vote weights', () => {
    const facade = new BoardFacade();
    facade.createAgenda({ id: 'a-wt', title: 'Weighted' });

    const session = facade.startVoting('a-wt', 'weighted', 1);
    // One heavy approve vs two light rejects
    facade.recordVote(session.id, { voterId: 'v1', option: 'approve', weight: 10 });
    facade.recordVote(session.id, { voterId: 'v2', option: 'reject', weight: 1 });
    facade.recordVote(session.id, { voterId: 'v3', option: 'reject', weight: 1 });
    facade.closeVoting(session.id);

    const consensus = facade.computeConsensus(session.id, 'weighted');
    expect(consensus?.approved).toBe(true);
  });

  it('unanimous policy rejects with any dissent', () => {
    const facade = new BoardFacade();
    facade.createAgenda({ id: 'a-unan', title: 'Unanimous' });

    const session = facade.startVoting('a-unan', 'unanimous', 1);
    facade.recordVote(session.id, { voterId: 'v1', option: 'approve' });
    facade.recordVote(session.id, { voterId: 'v2', option: 'reject' });
    facade.closeVoting(session.id);

    const consensus = facade.computeConsensus(session.id, 'unanimous');
    expect(consensus?.approved).toBe(false);
  });

  it('unanimous policy approves when all approve', () => {
    const facade = new BoardFacade();
    facade.createAgenda({ id: 'a-unan2', title: 'Unanimous pass' });

    const session = facade.startVoting('a-unan2', 'unanimous', 2);
    facade.recordVote(session.id, { voterId: 'v1', option: 'approve' });
    facade.recordVote(session.id, { voterId: 'v2', option: 'approve' });
    facade.closeVoting(session.id);

    const consensus = facade.computeConsensus(session.id, 'unanimous');
    expect(consensus?.approved).toBe(true);
  });

  // === runMeeting edge cases ===

  it('runMeeting with no votes produces consensus result', async () => {
    const result = await runMeeting({
      agendas: [{ id: 'no-votes', title: 'Empty' }],
    });

    expect(result.consensusResults).toHaveLength(1);
    expect(result.snapshots).toHaveLength(1);
  });

  it('runMeeting with multiple agendas', async () => {
    const result = await runMeeting({
      agendas: [
        { id: 'multi-1', title: 'First' },
        { id: 'multi-2', title: 'Second' },
        { id: 'multi-3', title: 'Third' },
      ],
      votesByAgendaId: {
        'multi-1': [{ voterId: 'a1', option: 'approve' }],
        'multi-2': [{ voterId: 'a1', option: 'reject' }],
        'multi-3': [{ voterId: 'a1', option: 'approve' }],
      },
    });

    expect(result.consensusResults).toHaveLength(3);
    expect(result.snapshots).toHaveLength(3);
    expect(result.consensusResults[0]?.approved).toBe(true);
    expect(result.consensusResults[1]?.approved).toBe(false);
    expect(result.consensusResults[2]?.approved).toBe(true);
  });

  it('runMeeting defaults to majority policy', async () => {
    const result = await runMeeting({
      agendas: [{ id: 'default-pol', title: 'Default' }],
      votesByAgendaId: {
        'default-pol': [
          { voterId: 'a1', option: 'approve' },
          { voterId: 'a2', option: 'reject' },
          { voterId: 'a3', option: 'approve' },
        ],
      },
    });

    expect(result.consensusResults[0]?.approved).toBe(true);
  });

  it('runMeeting with weighted policy and uneven weights', async () => {
    const result = await runMeeting({
      agendas: [{ id: 'wt-agenda', title: 'Weighted meeting' }],
      votingPolicy: 'weighted',
      votesByAgendaId: {
        'wt-agenda': [
          { voterId: 'a1', option: 'reject', weight: 100 },
          { voterId: 'a2', option: 'approve', weight: 1 },
          { voterId: 'a3', option: 'approve', weight: 1 },
        ],
      },
    });

    // Weighted: 100 reject vs 2 approve → rejected
    expect(result.consensusResults[0]?.approved).toBe(false);
  });

  it('runMeeting with custom quorum', async () => {
    const result = await runMeeting({
      agendas: [{ id: 'quorum-test', title: 'Quorum' }],
      quorum: 3,
      votesByAgendaId: {
        'quorum-test': [
          { voterId: 'a1', option: 'approve' },
          { voterId: 'a2', option: 'approve' },
          { voterId: 'a3', option: 'approve' },
        ],
      },
    });

    expect(result.consensusResults).toHaveLength(1);
    expect(result.consensusResults[0]?.approved).toBe(true);
  });

  it('state machine transitions through expected states in facade', () => {
    const facade = new BoardFacade();
    expect(facade.getState()).toBe('idle');

    facade.createAgenda({ id: 'track', title: 'Track states' });
    expect(facade.getState()).toBe('agenda_setting');

    const session = facade.startVoting('track', 'majority', 1);
    expect(facade.getState()).toBe('voting');

    facade.recordVote(session.id, { voterId: 'v1', option: 'approve' });
    facade.closeVoting(session.id);
    expect(facade.getState()).toBe('resolving');

    facade.computeConsensus(session.id, 'majority');
    expect(facade.getState()).toBe('resolved');
  });

  it('supermajority at exact threshold boundary (approved)', async () => {
    // 2/3 ≈ 0.6667, threshold 0.66 → should pass
    const result = await runMeeting({
      agendas: [{ id: 'boundary', title: 'Boundary' }],
      votingPolicy: 'supermajority',
      supermajorityThreshold: 0.66,
      votesByAgendaId: {
        boundary: [
          { voterId: 'a1', option: 'approve' },
          { voterId: 'a2', option: 'approve' },
          { voterId: 'a3', option: 'reject' },
        ],
      },
    });
    expect(result.consensusResults[0]?.approved).toBe(true);
  });

  it('supermajority at exact threshold boundary (rejected)', async () => {
    // 2/3 ≈ 0.6667, threshold 0.67 → should fail
    const result = await runMeeting({
      agendas: [{ id: 'boundary2', title: 'Boundary2' }],
      votingPolicy: 'supermajority',
      supermajorityThreshold: 0.67,
      votesByAgendaId: {
        boundary2: [
          { voterId: 'a1', option: 'approve' },
          { voterId: 'a2', option: 'approve' },
          { voterId: 'a3', option: 'reject' },
        ],
      },
    });
    expect(result.consensusResults[0]?.approved).toBe(false);
  });
});
