import { describe, expect, it } from 'vitest';
import { EventBus } from '../../../events';
import type { ConsensusResult } from '../../../domains/consensus';
import { MeetingStateMachine } from '../MeetingStateMachine';

function consensus(status: ConsensusResult['status'] = 'APPROVED'): ConsensusResult {
  return {
    sessionId: 'session-1',
    status,
    approved: status === 'APPROVED',
    summary: status.toLowerCase(),
    snapshot: {
      sessionId: 'session-1',
      policy: {
        quorum: 1,
        threshold: 0.5,
        allowAbstain: true,
      },
      tally: {
        sessionId: 'session-1',
        totalVotes: 1,
        approves: status === 'APPROVED' ? 1 : 0,
        rejects: status === 'REJECTED' ? 1 : 0,
        abstains: 0,
        quorumMet: true,
        passed: status === 'APPROVED',
      },
    },
  };
}

describe('MeetingStateMachine', () => {
  it('runs the agenda, discussion, vote, quorum, and consensus phases', () => {
    const eventBus = new EventBus({ historySize: 10 });
    const machine = new MeetingStateMachine(eventBus);
    const startedAt = new Date('2026-05-06T00:00:00.000Z');

    expect(machine.getState()).toBe('idle');
    expect(machine.apply({ type: 'decisions.voting.started', timestamp: startedAt })).toBe('idle');
    expect(machine.getLogs()).toHaveLength(0);

    expect(machine.apply({ type: 'agenda.created', timestamp: startedAt })).toBe('agenda_setting');
    expect(
      machine.apply({
        type: 'agenda.status.changed',
        timestamp: new Date('2026-05-06T00:01:00.000Z'),
        payload: { status: 'PENDING' },
      }),
    ).toBe('agenda_setting');
    expect(
      machine.apply({
        type: 'agenda.status.changed',
        timestamp: new Date('2026-05-06T00:02:00.000Z'),
        payload: { status: 'IN_PROGRESS' },
      }),
    ).toBe('discussion');
    expect(
      machine.apply({
        type: 'decisions.voting.started',
        timestamp: new Date('2026-05-06T00:03:00.000Z'),
      }),
    ).toBe('voting');
    expect(
      machine.apply({
        type: 'workflow.quorum.lost',
        timestamp: new Date('2026-05-06T00:04:00.000Z'),
      }),
    ).toBe('debate');
    expect(
      machine.apply({
        type: 'decisions.voting.started',
        timestamp: new Date('2026-05-06T00:05:00.000Z'),
      }),
    ).toBe('voting');
    expect(
      machine.apply({
        type: 'decisions.voting.ended',
        timestamp: new Date('2026-05-06T00:06:00.000Z'),
      }),
    ).toBe('resolving');
    expect(
      machine.apply(MeetingStateMachine.consensusEvent(consensus(), new Date('2026-05-06T00:07:00.000Z'))),
    ).toBe('resolved');

    expect(machine.getLogs().map((log) => `${log.from}->${log.to}`)).toEqual([
      'idle->agenda_setting',
      'agenda_setting->discussion',
      'discussion->voting',
      'voting->debate',
      'debate->voting',
      'voting->resolving',
      'resolving->resolved',
    ]);
    expect(eventBus.getHistory({ type: 'state.phase.changed' })).toHaveLength(7);
  });

  it('times out discussion, voting, and debate phases into resolving', () => {
    const discussion = new MeetingStateMachine(new EventBus(), {
      discussionTimeoutMs: 10,
      votingTimeoutMs: 10,
    });
    const enteredAt = new Date('2026-05-06T01:00:00.000Z');
    discussion.apply({ type: 'agenda.created', timestamp: enteredAt });
    discussion.apply({
      type: 'agenda.status.changed',
      timestamp: enteredAt,
      payload: { status: 'IN_PROGRESS' },
    });

    expect(discussion.tick(new Date('2026-05-06T01:00:00.009Z'))).toBe('discussion');
    expect(discussion.tick(new Date('2026-05-06T01:00:00.010Z'))).toBe('resolving');
    expect(discussion.getLogs().at(-1)?.reason).toBe('discussion timeout');

    const voting = new MeetingStateMachine(new EventBus(), {
      discussionTimeoutMs: 10,
      votingTimeoutMs: 10,
    });
    voting.apply({ type: 'agenda.created', timestamp: enteredAt });
    voting.apply({
      type: 'agenda.status.changed',
      timestamp: enteredAt,
      payload: { status: 'IN_PROGRESS' },
    });
    voting.apply({ type: 'decisions.voting.started', timestamp: enteredAt });

    expect(voting.tick(new Date('2026-05-06T01:00:00.010Z'))).toBe('resolving');
    expect(voting.getLogs().at(-1)?.reason).toBe('voting timeout');

    const debate = new MeetingStateMachine();
    debate.apply({ type: 'agenda.created', timestamp: enteredAt });
    debate.apply({
      type: 'agenda.status.changed',
      timestamp: enteredAt,
      payload: { status: 'IN_PROGRESS' },
    });
    debate.apply({ type: 'decisions.voting.started', timestamp: enteredAt });
    debate.apply({ type: 'workflow.quorum.lost', timestamp: enteredAt });

    expect(debate.apply({ type: 'workflow.timeout', timestamp: enteredAt })).toBe('resolving');
  });

  it('restores snapshots and supports cancellation', () => {
    const eventBus = new EventBus({ historySize: 10 });
    const machine = new MeetingStateMachine(eventBus);
    const timestamp = new Date('2026-05-06T02:00:00.000Z');

    machine.apply({ type: 'agenda.created', timestamp });
    machine.apply({
      type: 'agenda.status.changed',
      timestamp,
      payload: { status: 'IN_PROGRESS' },
    });

    const restored = MeetingStateMachine.fromSnapshot(machine.toSnapshot(), eventBus);
    expect(restored.getState()).toBe('discussion');
    expect(restored.apply({ type: 'workflow.cancelled', timestamp, payload: { reason: 'operator stop' } })).toBe(
      'resolved',
    );
    expect(restored.apply({ type: 'workflow.timeout', timestamp })).toBe('resolved');
    expect(restored.getLogs().at(-1)).toMatchObject({
      from: 'discussion',
      to: 'resolved',
      eventType: 'workflow.cancelled',
      reason: 'operator stop',
    });
    expect(MeetingStateMachine.consensusEvent(consensus('REJECTED'), timestamp).payload?.reason).toBe('REJECTED');
  });
});
