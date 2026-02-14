import { describe, expect, it } from 'vitest';
import {
  CONSENSUS_STATUSES,
  InMemoryProductionTKG,
  InMemoryStagingTKG,
  MeetingStateMachine,
  TKGObserver,
  TKGReflector,
  evaluateConsensus,
} from '../../src';

function runHappyPath() {
  const machine = new MeetingStateMachine();
  machine.apply({ type: 'agenda.created' });
  machine.apply({ type: 'agenda.status.changed', payload: { status: 'IN_PROGRESS' } });
  machine.apply({ type: 'decisions.voting.started' });
  machine.apply({ type: 'decisions.voting.ended' });
  machine.apply({
    type: 'workflow.consensus.computed',
    payload: {
      consensus: {
        sessionId: 's-1' as never,
        status: CONSENSUS_STATUSES[0],
        approved: true,
        summary: 'approved',
        snapshot: {
          sessionId: 's-1' as never,
          policy: 'majority',
          tally: {
            sessionId: 's-1' as never,
            totalVotes: 3,
            approves: 2,
            rejects: 1,
            abstains: 0,
            passed: true,
            quorumMet: true,
          },
        },
      },
    },
  });
  return machine;
}

describe('blackboard workflow e2e', () => {
  it('normal flow: agenda -> voting -> consensus -> resolved', () => {
    const machine = runHappyPath();
    expect(machine.getState()).toBe('resolved');

    const logs = machine.getLogs();
    expect(logs.length).toBeGreaterThanOrEqual(5);
    expect(logs.at(-1)).toMatchObject({
      from: 'resolving',
      to: 'resolved',
      eventType: 'workflow.consensus.computed',
    });
  });

  it('failure flow: quorum lost returns to debate', () => {
    const machine = new MeetingStateMachine();
    machine.apply({ type: 'agenda.created' });
    machine.apply({ type: 'agenda.status.changed', payload: { status: 'IN_PROGRESS' } });
    machine.apply({ type: 'decisions.voting.started' });
    machine.apply({ type: 'workflow.quorum.lost', payload: { reason: 'quorum-lost' } });

    expect(machine.getState()).toBe('debate');
  });

  it('failure flow: tie vote becomes rejected consensus', () => {
    const result = evaluateConsensus({
      sessionId: 's-2' as never,
      policy: 'majority',
      tally: {
        sessionId: 's-2' as never,
        totalVotes: 4,
        approves: 2,
        rejects: 2,
        abstains: 0,
        passed: false,
        quorumMet: true,
      },
    });

    expect(result.status).toBe('REJECTED');
    expect(result.approved).toBe(false);
  });

  it('time flow: voting timeout transitions to resolving', () => {
    const now = new Date('2026-02-13T01:00:00.000Z');
    const machine = new MeetingStateMachine(undefined, { votingTimeoutMs: 1000 });
    machine.apply({ type: 'agenda.created', timestamp: now });
    machine.apply({
      type: 'agenda.status.changed',
      timestamp: new Date(now.getTime() + 1),
      payload: { status: 'IN_PROGRESS' },
    });
    machine.apply({ type: 'decisions.voting.started', timestamp: new Date(now.getTime() + 2) });

    machine.tick(new Date(now.getTime() + 2002));

    expect(machine.getState()).toBe('resolving');
  });

  it('recovery flow: snapshot restore and continue', () => {
    const staging = new InMemoryStagingTKG();
    const production = new InMemoryProductionTKG();
    const observer = new TKGObserver(staging);
    const reflector = new TKGReflector();

    const machine = new MeetingStateMachine();
    machine.apply({ type: 'agenda.created' });
    machine.apply({ type: 'agenda.status.changed', payload: { status: 'IN_PROGRESS' } });

    observer.observe({
      id: 'evt-1',
      type: 'decisions.agenda.started',
      timestamp: new Date(),
      source: 'system',
      payload: { confidence: 0.8 },
    } as never);

    const snapshot = machine.toSnapshot();
    const restored = MeetingStateMachine.fromSnapshot(snapshot);
    restored.apply({ type: 'decisions.voting.started' });
    restored.apply({ type: 'decisions.voting.ended' });
    restored.apply({ type: 'workflow.consensus.computed' });

    const mergeResult = reflector.reflect(staging, production);

    expect(restored.getState()).toBe('resolved');
    expect(mergeResult.nodesPromoted).toBeGreaterThanOrEqual(1);
  });
});
