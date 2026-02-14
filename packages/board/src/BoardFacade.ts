import {
  AgendaStore,
  VotingSessionStore,
  MeetingStateMachine,
  evaluateConsensus,
  createAgentId,
  createAgendaId,
  createSessionId,
} from '@obora-kit/blackboard';
import type {
  CreateAgendaInput,
  MeetingState,
  ConsensusResult,
  VotingSessionSnapshot,
  VotingPolicy,
} from '@obora-kit/blackboard';

export interface VoteInput {
  voterId: string;
  option: 'approve' | 'reject' | 'abstain';
  weight?: number;
}

export interface RunMeetingOptions {
  agendas: CreateAgendaInput[];
  quorum?: number;
  votingPolicy?: VotingPolicy | 'supermajority';
  supermajorityThreshold?: number;
  votesByAgendaId?: Record<string, VoteInput[]>;
}

export interface MeetingRunResult {
  finalState: MeetingState;
  consensusResults: ConsensusResult[];
  snapshots: VotingSessionSnapshot[];
}

function toVotingPolicy(policy: RunMeetingOptions['votingPolicy']): VotingPolicy {
  // VotingSessionStore supports majority|unanimous|weighted only.
  // supermajority is evaluated at consensus stage via threshold option.
  if (!policy || policy === 'supermajority') {
    return 'majority';
  }
  return policy;
}

export async function runMeeting(options: RunMeetingOptions): Promise<MeetingRunResult> {
  const machine = new MeetingStateMachine();
  const agendaStore = new AgendaStore();
  const votingStore = new VotingSessionStore();

  const policy = options.votingPolicy ?? 'majority';
  const sessionPolicy = toVotingPolicy(policy);
  const consensusResults: ConsensusResult[] = [];
  const snapshots: VotingSessionSnapshot[] = [];

  for (const agendaInput of options.agendas) {
    const agenda = agendaStore.create(agendaInput);
    machine.apply({ type: 'agenda.created', timestamp: new Date(), payload: { status: agenda.status } });

    agendaStore.transition(agenda.id, 'pending');
    agendaStore.transition(agenda.id, 'active');
    machine.apply({ type: 'agenda.status.changed', timestamp: new Date(), payload: { status: 'IN_PROGRESS' } });

    const session = votingStore.create({
      agendaId: agenda.id,
      policy: sessionPolicy,
      quorum: options.quorum ?? 1,
      createdBy: createAgentId('system'),
    });

    machine.apply({ type: 'decisions.voting.started', timestamp: new Date() });
    votingStore.open(session.id);

    for (const vote of options.votesByAgendaId?.[agenda.id] ?? []) {
      votingStore.addVote({
        sessionId: session.id,
        voterId: createAgentId(vote.voterId),
        option: vote.option,
        weight: vote.weight,
      });
    }

    votingStore.close(session.id);
    machine.apply({ type: 'decisions.voting.ended', timestamp: new Date() });

    const tally = votingStore.getTally(session.id);
    if (!tally) continue;

    const snapshot: VotingSessionSnapshot = {
      sessionId: session.id,
      policy: session.policy,
      tally,
    };
    snapshots.push(snapshot);

    const consensus = evaluateConsensus(snapshot, {
      method: policy,
      supermajorityThreshold: options.supermajorityThreshold,
      summary: `agenda:${agenda.id}`,
    });

    consensusResults.push(consensus);
    machine.apply(MeetingStateMachine.consensusEvent(consensus));
  }

  return {
    finalState: machine.getState(),
    consensusResults,
    snapshots,
  };
}

export class BoardFacade {
  private readonly agendaStore = new AgendaStore();
  private readonly votingStore = new VotingSessionStore();
  private readonly stateMachine = new MeetingStateMachine();

  createAgenda(input: CreateAgendaInput) {
    const agenda = this.agendaStore.create(input);
    this.stateMachine.apply({ type: 'agenda.created', timestamp: new Date() });
    return agenda;
  }

  listAgendas() {
    return this.agendaStore.list();
  }

  startVoting(agendaId: string, policy: VotingPolicy, quorum = 1) {
    this.stateMachine.apply({ type: 'agenda.status.changed', timestamp: new Date(), payload: { status: 'IN_PROGRESS' } });
    const session = this.votingStore.create({
      agendaId: createAgendaId(agendaId),
      policy,
      quorum,
      createdBy: createAgentId('system'),
    });
    this.votingStore.open(session.id);
    this.stateMachine.apply({ type: 'decisions.voting.started', timestamp: new Date() });
    return session;
  }

  recordVote(sessionId: string, vote: VoteInput) {
    return this.votingStore.addVote({
      sessionId: createSessionId(sessionId),
      voterId: createAgentId(vote.voterId),
      option: vote.option,
      weight: vote.weight,
    });
  }

  closeVoting(sessionId: string) {
    this.votingStore.close(createSessionId(sessionId));
    this.stateMachine.apply({ type: 'decisions.voting.ended', timestamp: new Date() });
  }

  computeConsensus(sessionId: string, method: RunMeetingOptions['votingPolicy'] = 'majority', supermajorityThreshold?: number) {
    const sid = createSessionId(sessionId);
    const tally = this.votingStore.getTally(sid);
    const session = this.votingStore.get(sid);
    if (!tally || !session) {
      return undefined;
    }

    const result = evaluateConsensus(
      {
        sessionId: session.id,
        policy: session.policy,
        tally,
      },
      {
        method,
        supermajorityThreshold,
      },
    );

    this.stateMachine.apply(MeetingStateMachine.consensusEvent(result));
    return result;
  }

  getState(): MeetingState {
    return this.stateMachine.getState();
  }

  getMeetingSnapshot() {
    return this.stateMachine.toSnapshot();
  }
}
