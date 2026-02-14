import { describe, expect, it } from 'vitest';
import { MeetingStateMachine } from '../../src/workflow';

describe('MeetingStateMachine', () => {
  it('transitions through nominal flow', () => {
    const machine = new MeetingStateMachine();

    machine.apply({ type: 'agenda.created' });
    machine.apply({ type: 'agenda.status.changed', payload: { status: 'IN_PROGRESS' } });
    machine.apply({ type: 'decisions.voting.started' });
    machine.apply({ type: 'decisions.voting.ended' });
    machine.apply({ type: 'workflow.consensus.computed' });

    expect(machine.getState()).toBe('resolved');
    expect(machine.getLogs()).toHaveLength(5);
  });

  it('handles timeout and snapshot restore', () => {
    const now = new Date('2026-02-13T10:00:00.000Z');
    const machine = new MeetingStateMachine(undefined, { discussionTimeoutMs: 1000 });

    machine.apply({ type: 'agenda.created', timestamp: now });
    machine.apply({
      type: 'agenda.status.changed',
      timestamp: new Date(now.getTime() + 10),
      payload: { status: 'IN_PROGRESS' },
    });

    machine.tick(new Date(now.getTime() + 2000));

    expect(machine.getState()).toBe('resolving');

    const restored = MeetingStateMachine.fromSnapshot(machine.toSnapshot());
    restored.apply({ type: 'workflow.consensus.computed' });

    expect(restored.getState()).toBe('resolved');
  });
});
