/**
 * @module decisions-accessor
 * @description 의사결정 섹션 접근자
 */

import type { Blackboard } from '../blackboard';
import type { DecisionsSection } from '../../types';
import type {
  Agenda,
  AgendaCreateInput,
  Opinion,
  OpinionCreateInput,
  Resolution,
  DecisionType,
  VoteSummary,
  NextAction,
} from '../../types';
import {
  AgendaStatus,
} from '../../types';
import type { AgentId, AgendaId } from '../../types';
import { createAgendaId } from '../../types';
import { BlackboardError, BlackboardErrorCode } from '../blackboard';

/**
 * 의사결정 섹션 접근자
 * @description decisions 섹션에 대한 타입 안전한 접근 제공
 */
export class DecisionsSectionAccessor {
  constructor(private readonly board: Blackboard) {}

  /**
   * 의견 키 생성 (agendaId + agentId 조합)
   * @private
   */
  private getOpinionKey(agendaId: AgendaId, agentId: AgentId): string {
    return `${agendaId}:${agentId}`;
  }

  // === 안건 관리 ===

  /** 현재 안건 */
  get current(): Agenda | null {
    const decisions = this.board.read<DecisionsSection>('decisions');
    return decisions.current;
  }

  /** 대기 중인 안건들 */
  get pending(): Agenda[] {
    const decisions = this.board.read<DecisionsSection>('decisions');
    return decisions.pending.filter(a => a.status === AgendaStatus.SUBMITTED);
  }

  /** 모든 대기 안건 */
  get allPending(): Agenda[] {
    return this.board.read<DecisionsSection>('decisions').pending;
  }

  /**
   * 안건 제출
   * @param agendaInput - 새 안건 입력
   */
  submitAgenda(agendaInput: AgendaCreateInput): Agenda {
    const decisions = this.board.read<DecisionsSection>('decisions');
    const now = new Date();

    const agenda: Agenda = {
      id: createAgendaId(`agenda-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`),
      title: agendaInput.title,
      description: agendaInput.description,
      proposer: agendaInput.proposer,
      status: AgendaStatus.SUBMITTED,
      deadline: agendaInput.deadline ?? null,
      requiredQuorum: agendaInput.requiredQuorum ?? 3,
      votingMethod: agendaInput.votingMethod ?? 'majority',
      priority: agendaInput.priority ?? 1,
      tags: agendaInput.tags ?? [],
      attachments: agendaInput.attachments ?? [],
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    const updatedPending = [...decisions.pending, agenda];
    this.board.write('decisions.pending', updatedPending);
    this.board.emit('agenda_submitted', { agendaId: agenda.id, agenda });

    return agenda;
  }

  /**
   * 안건 상태 변경
   */
  updateAgendaStatus(agendaId: AgendaId, status: AgendaStatus): void {
    const decisions = this.board.read<DecisionsSection>('decisions');

    // pending에서 찾기
    let targetIndex = -1;
    let targetPending = false;

    for (let i = 0; i < decisions.pending.length; i++) {
      if (decisions.pending[i].id === agendaId) {
        targetIndex = i;
        targetPending = true;
        break;
      }
    }

    if (targetIndex === -1 && decisions.current?.id === agendaId) {
      targetIndex = 0;
      targetPending = false;
    }

    if (targetIndex === -1) {
      throw new BlackboardError(
        BlackboardErrorCode.AGENDA_NOT_FOUND,
        `Agenda ${agendaId} not found`
      );
    }

    if (targetPending) {
      const updatedAgenda = {
        ...decisions.pending[targetIndex],
        status,
        updatedAt: new Date(),
        version: decisions.pending[targetIndex].version + 1,
      };

      const updatedPending = [...decisions.pending];
      updatedPending[targetIndex] = updatedAgenda;

      this.board.write('decisions.pending', updatedPending);
    } else if (decisions.current) {
      const updatedAgenda = {
        ...decisions.current,
        status,
        updatedAt: new Date(),
        version: decisions.current.version + 1,
      };

      this.board.write('decisions.current', updatedAgenda);
    }

    this.board.emit('agenda_updated', { agendaId, status });
  }

  /**
   * 현재 안건 설정
   */
  setCurrentAgenda(agendaId: AgendaId): void {
    const decisions = this.board.read<DecisionsSection>('decisions');

    // 현재 안건이 있으면 pending으로 이동
    let updatedPending = [...decisions.pending];
    if (decisions.current) {
      updatedPending.push(decisions.current);
    }

    // pending에서 해당 안건 찾기
    const agendaIndex = updatedPending.findIndex(a => a.id === agendaId);
    if (agendaIndex === -1) {
      throw new BlackboardError(
        BlackboardErrorCode.AGENDA_NOT_FOUND,
        `Agenda ${agendaId} not found in pending`
      );
    }

    const [agenda] = updatedPending.splice(agendaIndex, 1);

    // 안건 상태 업데이트
    const updatedAgenda: Agenda = {
      ...agenda,
      status: AgendaStatus.DISCUSSING,
      updatedAt: new Date(),
      version: agenda.version + 1,
    };

    this.board.write('decisions.current', updatedAgenda);
    this.board.write('decisions.pending', updatedPending);
  }

  /**
   * 안건 취소
   */
  cancelAgenda(agendaId: AgendaId, reason: string): void {
    const decisions = this.board.read<DecisionsSection>('decisions');

    // current 안건인 경우
    if (decisions.current?.id === agendaId) {
      this.board.write('decisions.current', null);
      this.board.emit('agenda_updated', { agendaId, status: AgendaStatus.CANCELLED, reason });
      return;
    }

    // pending 안건인 경우
    const agendaIndex = decisions.pending.findIndex(a => a.id === agendaId);
    if (agendaIndex === -1) {
      throw new BlackboardError(
        BlackboardErrorCode.AGENDA_NOT_FOUND,
        `Agenda ${agendaId} not found`
      );
    }

    const updatedPending = decisions.pending.filter(a => a.id !== agendaId);
    this.board.write('decisions.pending', updatedPending);
    this.board.emit('agenda_updated', { agendaId, status: AgendaStatus.CANCELLED, reason });
  }

  /**
   * 안건 조회
   */
  getAgenda(agendaId: AgendaId): Agenda | undefined {
    const decisions = this.board.read<DecisionsSection>('decisions');

    if (decisions.current?.id === agendaId) {
      return decisions.current;
    }

    return decisions.pending.find(a => a.id === agendaId);
  }

  /**
   * 모든 안건 조회
   */
  getAllAgendas(): Agenda[] {
    const decisions = this.board.read<DecisionsSection>('decisions');
    const result: Agenda[] = [];

    if (decisions.current) {
      result.push(decisions.current);
    }

    result.push(...decisions.pending);
    return result;
  }

  // === 의견 관리 ===

  /**
   * 의견 제출
   */
  submitOpinion(
    opinion: Omit<Opinion, 'createdAt' | 'updatedAt'>
  ): void {
    const decisions = this.board.read<DecisionsSection>('decisions');
    const now = new Date();

    // 안건 확인
    const agenda = this.getAgenda(opinion.agendaId);
    if (!agenda) {
      throw new BlackboardError(
        BlackboardErrorCode.AGENDA_NOT_FOUND,
        `Agenda ${opinion.agendaId} not found`
      );
    }

    const fullOpinion: Opinion = {
      ...opinion,
      createdAt: now,
      updatedAt: now,
    };

    const updatedOpinions = new Map(decisions.opinions);
    // agendaId + agentId 조합으로 키 생성
    const opinionKey = this.getOpinionKey(opinion.agendaId, opinion.agentId);
    updatedOpinions.set(opinionKey, fullOpinion);

    this.board.write('decisions.opinions', updatedOpinions);
    this.board.emit('opinion_added', { opinion: fullOpinion });
  }

  /**
   * 특정 안건의 모든 의견 조회
   */
  getOpinions(agendaId: AgendaId): Opinion[] {
    const decisions = this.board.read<DecisionsSection>('decisions');
    const opinions: Opinion[] = [];

    for (const opinion of decisions.opinions.values()) {
      if (opinion.agendaId === agendaId) {
        opinions.push(opinion);
      }
    }

    return opinions;
  }

  /**
   * 에이전트의 의견 조회
   * @param agentId - 에이전트 ID
   * @param agendaId - 안건 ID (필수)
   */
  getAgentOpinion(agentId: AgentId, agendaId: AgendaId): Opinion | undefined {
    const decisions = this.board.read<DecisionsSection>('decisions');
    // agendaId + agentId 조합으로 키 조회
    const opinionKey = this.getOpinionKey(agendaId, agentId);
    const opinion = decisions.opinions.get(opinionKey);

    return opinion;
  }

  /**
   * 의견 요약
   */
  summarizeOpinions(agendaId: AgendaId): {
    total: number;
    approve: number;
    reject: number;
    conditional: number;
    abstain: number;
  } {
    const opinions = this.getOpinions(agendaId);

    const summary = {
      total: opinions.length,
      approve: 0,
      reject: 0,
      conditional: 0,
      abstain: 0,
    };

    for (const opinion of opinions) {
      summary[opinion.stance]++;
    }

    return summary;
  }

  /**
   * 모든 의견 초기화 (재투표 시)
   */
  clearOpinions(agendaId: AgendaId): void {
    const decisions = this.board.read<DecisionsSection>('decisions');
    const updatedOpinions = new Map(decisions.opinions);

    for (const [key, opinion] of decisions.opinions.entries()) {
      if (opinion.agendaId === agendaId) {
        updatedOpinions.delete(key);
      }
    }

    this.board.write('decisions.opinions', updatedOpinions);
  }

  // === 결정 관리 ===

  /**
   * 결정 기록
   */
  recordResolution(resolutionInput: Omit<Resolution, 'id' | 'createdAt' | 'updatedAt'>): Resolution {
    const decisions = this.board.read<DecisionsSection>('decisions');
    const now = new Date();

    const resolution: Resolution = {
      id: `resolution-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      agendaId: resolutionInput.agendaId,
      decision: resolutionInput.decision,
      summary: resolutionInput.summary,
      voteSummary: resolutionInput.voteSummary,
      conditions: resolutionInput.conditions,
      dissent: resolutionInput.dissent,
      decidedBy: resolutionInput.decidedBy,
      nextActions: resolutionInput.nextActions,
      createdAt: now,
      updatedAt: now,
    };

    const updatedHistory = [...decisions.history, resolution];
    this.board.write('decisions.history', updatedHistory);

    // 현재 안건 초기화
    if (decisions.current?.id === resolution.agendaId) {
      this.board.write('decisions.current', null);
    } else {
      // pending에서 제거
      const updatedPending = decisions.pending.filter(a => a.id !== resolution.agendaId);
      this.board.write('decisions.pending', updatedPending);
    }

    this.board.emit('resolution_created', { resolution });

    return resolution;
  }

  /**
   * 결정 이력 조회
   */
  getHistory(filter?: { agendaId?: AgendaId; decision?: DecisionType }): Resolution[] {
    const decisions = this.board.read<DecisionsSection>('decisions');
    let history = [...decisions.history];

    if (!filter) {
      return history;
    }

    if (filter.agendaId) {
      history = history.filter(r => r.agendaId === filter.agendaId);
    }

    if (filter.decision) {
      history = history.filter(r => r.decision === filter.decision);
    }

    return history;
  }

  /**
   * 최근 N개 결정 조회
   */
  getRecentResolutions(count: number): Resolution[] {
    const decisions = this.board.read<DecisionsSection>('decisions');
    return decisions.history.slice(-count).reverse();
  }

  /**
   * 결정 조회
   */
  getResolution(resolutionId: string): Resolution | undefined {
    const decisions = this.board.read<DecisionsSection>('decisions');
    return decisions.history.find(r => r.id === resolutionId);
  }

  /**
   * 안건에 대한 결정 조회
   */
  getResolutionByAgenda(agendaId: AgendaId): Resolution | undefined {
    const decisions = this.board.read<DecisionsSection>('decisions');
    return decisions.history.find(r => r.agendaId === agendaId);
  }

  // === 통계 ===

  /**
   * 결정 수 조회
   */
  getResolutionCount(): number {
    return this.board.read<DecisionsSection>('decisions').history.length;
  }

  /**
   * 안건 수 조회
   */
  getAgendaCount(): number {
    const decisions = this.board.read<DecisionsSection>('decisions');
    let count = decisions.current ? 1 : 0;
    count += decisions.pending.length;
    return count;
  }

  /**
   * 의견 수 조회
   */
  getOpinionCount(): number {
    return this.board.read<DecisionsSection>('decisions').opinions.size;
  }
}
