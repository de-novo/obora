import type { ConsensusResult } from '../../domains/consensus';

export const MEETING_STATES = [
  'idle',
  'agenda_setting',
  'discussion',
  'debate',
  'voting',
  'resolving',
  'resolved',
] as const;

export type MeetingState = (typeof MEETING_STATES)[number];

export type MeetingEventType =
  | 'agenda.created'
  | 'agenda.status.changed'
  | 'decisions.voting.started'
  | 'decisions.voting.ended'
  | 'workflow.consensus.computed'
  | 'workflow.timeout'
  | 'workflow.quorum.lost'
  | 'workflow.cancelled';

export interface MeetingEvent {
  readonly type: MeetingEventType;
  readonly timestamp?: Date;
  readonly payload?: {
    readonly status?: string;
    readonly consensus?: ConsensusResult;
    readonly reason?: string;
  };
}

export interface TransitionLog {
  readonly from: MeetingState;
  readonly to: MeetingState;
  readonly eventType: MeetingEventType;
  readonly timestamp: Date;
  readonly reason?: string;
}

export interface MeetingStateSnapshot {
  readonly state: MeetingState;
  readonly enteredAt: Date;
  readonly lastEventAt: Date;
  readonly logs: readonly TransitionLog[];
}

export interface MeetingStateMachineOptions {
  readonly discussionTimeoutMs?: number;
  readonly votingTimeoutMs?: number;
}
