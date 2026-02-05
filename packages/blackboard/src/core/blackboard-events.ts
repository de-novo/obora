/**
 * @module blackboard-events
 * @description EventAwareBlackboard - 이벤트 발행 기능이 통합된 Blackboard
 */

import { Blackboard, type BlackboardOptions } from './blackboard';
import { EventBus, type EventBusOptions } from '../events/event-bus';
import { EventFactory, type CreateEventOptions } from '../events/event-factory';
import type { Event as BBEvent } from '../events/types';

import type {
  AgentStatus,
  Task,
  Agenda,
  Opinion,
  Resolution,
  Fact,
  Inference,
  Pattern,
  TaskError,
  BoardPhase,
  AgentId,
  TaskId,
  AgendaId,
  FactCreateInput,
  InferenceCreateInput,
  PatternCreateInput,
  AgendaCreateInput,
} from '../types';
import { TaskStatus, AgendaStatus } from '../types';

/**
 * 이벤트 발행 기능이 통합된 Blackboard 옵션
 */
export interface EventAwareBlackboardOptions extends BlackboardOptions {
  /** Event Bus 옵션 */
  eventBusOptions?: EventBusOptions;
  /** 자동 이벤트 발행 활성화 여부 (기본: true) */
  autoEmitEvents?: boolean;
  /** 이벤트 발행 실패 시 throw 여부 (기본: false) */
  throwOnEventError?: boolean;
}

/**
 * 이벤트 발행 기능이 통합된 Blackboard
 * @description Blackboard의 상태 변경 시 자동으로 이벤트 발행
 *
 * @example
 * ```typescript
 * import { EventAwareBlackboard, createSessionId, createAgentId } from '@obora-kit/blackboard';
 *
 * const board = new EventAwareBlackboard({
 *   sessionId: createSessionId('session-001'),
 *   eventBusOptions: { historySize: 1000 },
 * });
 *
 * // 작업 관련 모든 이벤트 구독 (와일드카드)
 * board.events.subscribe('task.*', (event) => {
 *   console.log(`Task event: ${event.type}`);
 * });
 *
 * // 특정 이벤트 구독
 * board.events.subscribe('decision.consensus.reached', (event) => {
 *   console.log(`Consensus reached`);
 * });
 *
 * // 상태 변경 시 자동으로 이벤트 발행됨
 * board.setPhase('discussion'); // → PhaseChangedEvent 발행
 * board.submitAgenda({...}); // → AgendaSubmittedEvent 발행
 * ```
 */
export class EventAwareBlackboard extends Blackboard {
  /** Event Bus 인스턴스 */
  public readonly events: EventBus;

  /** Event Factory 인스턴스 */
  public readonly eventFactory: EventFactory;

  private _autoEmitEvents: boolean;
  private readonly _throwOnEventError: boolean;

  constructor(options: EventAwareBlackboardOptions = {}) {
    const { eventBusOptions, autoEmitEvents = true, throwOnEventError = false, ...blackboardOptions } = options;
    super(blackboardOptions);

    this.events = new EventBus(eventBusOptions);
    this.eventFactory = new EventFactory(() => this.generateEventId());
    this._autoEmitEvents = autoEmitEvents;
    this._throwOnEventError = throwOnEventError;
  }

  // === 이벤트 헬퍼 메서드 ===

  private generateEventId(): string {
    return `evt-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  }

  private emitEvent(eventCreator: () => BBEvent): void {
    if (!this._autoEmitEvents) return;

    try {
      const event = eventCreator();
      this.events.emit(event);
    } catch (error) {
      if (this._throwOnEventError) {
        throw error;
      }
      console.error('Error emitting event:', error);
    }
  }

  /** 자동 이벤트 발행 활성화/비활성화 */
  setAutoEmit(enabled: boolean): void {
    this._autoEmitEvents = enabled;
  }

  /** 수동 이벤트 발행 */
  emitCustomEvent<T extends BBEvent>(event: T): void {
    this.events.emit(event);
  }

  /** 수동 비동기 이벤트 발행 */
  async emitCustomEventAsync<T extends BBEvent>(event: T): Promise<void> {
    await this.events.emitAsync(event);
  }

  // === 단계 관리 (이벤트 발행 포함) ===

  /** 단계 설정 */
  setPhase(newPhase: BoardPhase): void {
    const previousPhase = this.state.phase;
    if (previousPhase === newPhase) return;

    this.state.phase = newPhase;

    this.emitEvent(() =>
      this.eventFactory.createPhaseChanged(previousPhase, newPhase, { source: 'system' })
    );
  }

  /** 컨텍스트 설정 */
  setContext(key: string, value: unknown): void {
    const previousValue = this.state.getContext(key);
    this.state.setContext(key, value);

    this.emitEvent(() =>
      this.eventFactory.createContextUpdated(key, previousValue, value, { source: 'system' })
    );
  }

  // === 에이전트 관리 (이벤트 발행 포함) ===

  /** 에이전트 등록 */
  registerAgent(agent: AgentStatus): void {
    this.state.registerAgent(agent);

    this.emitEvent(() =>
      this.eventFactory.createStateAgentRegistered(agent, { source: agent.id })
    );
    this.emitEvent(() =>
      this.eventFactory.createAgentRegistered(agent, { source: agent.id })
    );
  }

  /** 에이전트 업데이트 */
  updateAgent(agentId: AgentId, updates: Partial<AgentStatus>): void {
    const previousAgent = this.state.getAgent(agentId);
    if (!previousAgent) return;

    this.state.updateAgent(agentId, updates);

    const newAgent = this.state.getAgent(agentId)!;

    this.emitEvent(() =>
      this.eventFactory.createStateAgentUpdated(agentId, previousAgent, newAgent, {
        source: updates.lastHeartbeat ? agentId : 'system',
      })
    );
    this.emitEvent(() =>
      this.eventFactory.createAgentStatusChanged(agentId, previousAgent, newAgent, {
        source: updates.lastHeartbeat ? agentId : 'system',
      })
    );
  }

  /** 에이전트 제거 */
  removeAgent(agentId: AgentId, reason: string = 'unknown'): void {
    this.state.removeAgent(agentId);

    this.emitEvent(() =>
      this.eventFactory.createAgentRemoved(agentId, reason, { source: 'system' })
    );
  }

  // === 작업 관리 (이벤트 발행 포함) ===

  /** 작업 추가 */
  addTask(task: Task): void {
    this.state.addTask(task);

    this.emitEvent(() =>
      this.eventFactory.createStateTaskCreated(task, { source: task.assignedTo ?? 'system' })
    );
    this.emitEvent(() =>
      this.eventFactory.createTaskCreated(task, { source: task.assignedTo ?? 'system' })
    );
  }

  /** 작업 업데이트 */
  updateTask(taskId: TaskId, updates: Partial<Task>): void {
    const previousTask = this.state.getTask(taskId);
    if (!previousTask) return;

    this.state.updateTask(taskId, updates);
    const newTask = this.state.getTask(taskId)!;

    // 할당 변경 이벤트
    if (updates.assignedTo !== undefined && updates.assignedTo !== previousTask.assignedTo && updates.assignedTo !== null) {
      this.emitEvent(() =>
        this.eventFactory.createStateTaskAssigned(taskId, updates.assignedTo!, { source: 'system' })
      );
      this.emitEvent(() =>
        this.eventFactory.createTaskAssigned(taskId, updates.assignedTo!, { source: 'system' })
      );
    }

    // 완료 이벤트
    if (updates.status === TaskStatus.COMPLETED && previousTask.status !== TaskStatus.COMPLETED) {
      const duration = newTask.completedAt && newTask.startedAt
        ? newTask.completedAt.getTime() - newTask.startedAt.getTime()
        : 0;
      this.emitEvent(() =>
        this.eventFactory.createStateTaskCompleted(taskId, newTask.outputs, duration, {
          source: newTask.assignedTo ?? 'system',
        })
      );
      this.emitEvent(() =>
        this.eventFactory.createTaskCompleted(taskId, newTask.outputs, duration, {
          source: newTask.assignedTo ?? 'system',
        })
      );
    }

    // 실패 이벤트
    if (updates.status === TaskStatus.FAILED && previousTask.status !== TaskStatus.FAILED) {
      const error = updates.error ?? { code: 'UNKNOWN', message: 'Unknown error', retryable: false };
      this.emitEvent(() =>
        this.eventFactory.createStateTaskFailed(taskId, error, error.retryable, { source: 'system' })
      );
      this.emitEvent(() =>
        this.eventFactory.createTaskFailed(taskId, error, error.retryable, { source: 'system' })
      );
    }

    // 상태 변경 이벤트
    if (updates.status !== undefined && updates.status !== previousTask.status) {
      this.emitEvent(() =>
        this.eventFactory.createTaskStatusChanged(taskId, previousTask.status, updates.status!, {
          source: 'system',
        })
      );
    }
  }

  // === 지식 관리 (이벤트 발행 포함) ===

  /** 사실 추가 */
  addFact(factInput: FactCreateInput): Fact {
    const fact = this.knowledge.addFact(factInput);

    this.emitEvent(() =>
      this.eventFactory.createFactAdded(fact, { source: factInput.source })
    );

    return fact;
  }

  /** 추론 추가 */
  addInference(inferenceInput: InferenceCreateInput): Inference {
    const inference = this.knowledge.addInference(inferenceInput);

    this.emitEvent(() =>
      this.eventFactory.createInferenceAdded(inference, { source: inferenceInput.derivedBy })
    );

    return inference;
  }

  /** 패턴 추가/업데이트 */
  upsertPattern(patternInput: PatternCreateInput): Pattern {
    const pattern = this.knowledge.upsertPattern(patternInput);

    this.emitEvent(() =>
      this.eventFactory.createKnowledgePatternLearned(pattern, { source: patternInput.discoveredBy })
    );

    return pattern;
  }

  // === 의사결정 관리 (이벤트 발행 포함) ===

  /** 안건 제출 */
  submitAgenda(agendaInput: AgendaCreateInput): Agenda {
    const agenda = this.decisions.submitAgenda(agendaInput);

    this.emitEvent(() =>
      this.eventFactory.createDecisionsAgendaCreated(agenda, { source: agendaInput.proposer })
    );
    this.emitEvent(() =>
      this.eventFactory.createAgendaSubmitted(agenda, { source: agendaInput.proposer })
    );

    return agenda;
  }

  /** 현재 안건 설정 */
  setCurrentAgenda(agendaId: AgendaId): void {
    const agenda = this.decisions.getAgenda(agendaId);
    const previousStatus = agenda?.status;

    this.decisions.setCurrentAgenda(agendaId);

    this.emitEvent(() =>
      this.eventFactory.createDecisionsAgendaStarted(agendaId, {
        source: agenda?.proposer ?? 'system',
      })
    );

    if (previousStatus && agenda) {
      this.emitEvent(() =>
        this.eventFactory.createAgendaStatusChanged(agendaId, previousStatus, AgendaStatus.DISCUSSING, {
          source: 'system',
        })
      );
    }
  }

  /** 안건 취소 */
  cancelAgenda(agendaId: AgendaId, reason: string): void {
    const agenda = this.decisions.getAgenda(agendaId);
    const previousStatus = agenda?.status;

    this.decisions.cancelAgenda(agendaId, reason);

    if (previousStatus && agenda) {
      this.emitEvent(() =>
        this.eventFactory.createAgendaStatusChanged(agendaId, previousStatus, AgendaStatus.CANCELLED, {
          source: 'system',
        })
      );
    }
  }

  /** 의견 제출 */
  submitOpinion(opinion: Omit<Opinion, 'createdAt' | 'updatedAt'>): void {
    this.decisions.submitOpinion(opinion);

    this.emitEvent(() =>
      this.eventFactory.createDecisionsOpinionSubmitted(opinion as Opinion, { source: opinion.agentId })
    );
    this.emitEvent(() =>
      this.eventFactory.createOpinionSubmitted(opinion as Opinion, { source: opinion.agentId })
    );
  }

  /** 결정 기록 */
  recordResolution(resolutionInput: Omit<Resolution, 'id' | 'createdAt' | 'updatedAt'>): Resolution {
    const resolution = this.decisions.recordResolution(resolutionInput);

    this.emitEvent(() =>
      this.eventFactory.createDecisionsConsensusReached(resolution, { source: resolutionInput.decidedBy })
    );
    this.emitEvent(() =>
      this.eventFactory.createDecisionsAgendaResolved(resolutionInput.agendaId, resolution, {
        source: resolutionInput.decidedBy,
      })
    );
    this.emitEvent(() =>
      this.eventFactory.createConsensusReached(resolution, { source: resolutionInput.decidedBy })
    );

    return resolution;
  }

  // === 시스템 이벤트 ===

  /** 스냅샷 생성 이벤트 발행 */
  emitSnapshotCreated(snapshotId: string): void {
    this.emitEvent(() =>
      this.eventFactory.createSystemSnapshotCreated(snapshotId, new Date(), { source: 'system' })
    );
  }

  /** 스냅샷 복원 이벤트 발행 */
  emitSnapshotRestored(snapshotId: string): void {
    this.emitEvent(() =>
      this.eventFactory.createSystemSnapshotRestored(snapshotId, new Date(), { source: 'system' })
    );
  }

  /** 시스템 에러 이벤트 발행 */
  emitSystemError(code: string, message: string, details?: unknown): void {
    this.emitEvent(() =>
      this.eventFactory.createSystemError(code, message, details, { source: 'system' })
    );
  }

  /** 버전 충돌 이벤트 발행 */
  emitVersionConflict(path: string, expectedVersion: number, actualVersion: number): void {
    this.emitEvent(() =>
      this.eventFactory.createVersionConflict(path, expectedVersion, actualVersion, { source: 'system' })
    );
  }
}
