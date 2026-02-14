import type { ConsensusResult } from '../../domains/consensus';
import type { Event } from '../../events';
import { EventBus } from '../../events';
import type {
  MeetingEvent,
  MeetingState,
  MeetingStateMachineOptions,
  MeetingStateSnapshot,
  TransitionLog,
} from './types';

const DEFAULT_DISCUSSION_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_VOTING_TIMEOUT_MS = 5 * 60 * 1000;

export class MeetingStateMachine {
  private state: MeetingState = 'idle';
  private enteredAt = new Date();
  private lastEventAt = new Date();
  private logs: TransitionLog[] = [];
  private readonly discussionTimeoutMs: number;
  private readonly votingTimeoutMs: number;

  constructor(
    private readonly eventBus = new EventBus(),
    options: MeetingStateMachineOptions = {},
  ) {
    this.discussionTimeoutMs = options.discussionTimeoutMs ?? DEFAULT_DISCUSSION_TIMEOUT_MS;
    this.votingTimeoutMs = options.votingTimeoutMs ?? DEFAULT_VOTING_TIMEOUT_MS;
  }

  getState(): MeetingState {
    return this.state;
  }

  getLogs(): readonly TransitionLog[] {
    return this.logs;
  }

  apply(event: MeetingEvent): MeetingState {
    const next = this.resolveNextState(this.state, event);
    const ts = event.timestamp ?? new Date();

    this.lastEventAt = ts;

    if (next !== this.state) {
      const previous = this.state;
      this.state = next;
      this.enteredAt = ts;
      this.logs.push({
        from: previous,
        to: next,
        eventType: event.type,
        timestamp: ts,
        reason: event.payload?.reason,
      });

      this.emitTransitionEvent(previous, next, event);
    }

    return this.state;
  }

  tick(now = new Date()): MeetingState {
    const elapsed = now.getTime() - this.enteredAt.getTime();

    if (this.state === 'discussion' && elapsed >= this.discussionTimeoutMs) {
      return this.apply({
        type: 'workflow.timeout',
        timestamp: now,
        payload: { reason: 'discussion timeout' },
      });
    }

    if (this.state === 'voting' && elapsed >= this.votingTimeoutMs) {
      return this.apply({
        type: 'workflow.timeout',
        timestamp: now,
        payload: { reason: 'voting timeout' },
      });
    }

    return this.state;
  }

  toSnapshot(): MeetingStateSnapshot {
    return {
      state: this.state,
      enteredAt: this.enteredAt,
      lastEventAt: this.lastEventAt,
      logs: [...this.logs],
    };
  }

  static fromSnapshot(snapshot: MeetingStateSnapshot, eventBus = new EventBus()): MeetingStateMachine {
    const machine = new MeetingStateMachine(eventBus);
    machine.state = snapshot.state;
    machine.enteredAt = snapshot.enteredAt;
    machine.lastEventAt = snapshot.lastEventAt;
    machine.logs = [...snapshot.logs];
    return machine;
  }

  private resolveNextState(current: MeetingState, event: MeetingEvent): MeetingState {
    if (event.type === 'workflow.cancelled') {
      return 'resolved';
    }

    if (event.type === 'workflow.timeout') {
      if (current === 'discussion' || current === 'voting' || current === 'debate') {
        return 'resolving';
      }
      return current;
    }

    if (event.type === 'workflow.quorum.lost') {
      return current === 'voting' ? 'debate' : current;
    }

    switch (current) {
      case 'idle':
        return event.type === 'agenda.created' ? 'agenda_setting' : current;
      case 'agenda_setting':
        return event.type === 'agenda.status.changed' && event.payload?.status === 'IN_PROGRESS'
          ? 'discussion'
          : current;
      case 'discussion':
        return event.type === 'decisions.voting.started' ? 'voting' : current;
      case 'debate':
        return event.type === 'decisions.voting.started' ? 'voting' : current;
      case 'voting':
        return event.type === 'decisions.voting.ended' ? 'resolving' : current;
      case 'resolving':
        return event.type === 'workflow.consensus.computed' ? 'resolved' : current;
      case 'resolved':
      default:
        return current;
    }
  }

  private emitTransitionEvent(from: MeetingState, to: MeetingState, event: MeetingEvent): void {
    this.eventBus.emit({
      id: `evt-workflow-${crypto.randomUUID()}`,
      type: 'state.phase.changed',
      source: 'system',
      timestamp: event.timestamp ?? new Date(),
      payload: {
        previousPhase: from,
        newPhase: to,
        eventType: event.type,
      },
    } as unknown as Event);
  }

  static consensusEvent(consensus: ConsensusResult, timestamp = new Date()): MeetingEvent {
    return {
      type: 'workflow.consensus.computed',
      timestamp,
      payload: {
        consensus,
        reason: consensus.status,
      },
    };
  }
}
