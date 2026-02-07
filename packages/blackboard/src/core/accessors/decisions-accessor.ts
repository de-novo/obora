/**
 * @module decisions-accessor
 * @description 의사결정 섹션 접근자
 */

import type { Blackboard } from "../blackboard";
import type { DecisionsSection } from "../../types";
import type {
  Agenda,
  AgendaCreateInput,
  Opinion,
  OpinionCreateInput,
  Resolution,
  DecisionType,
  OpinionId,
  AgendaId,
} from "../../types";
import type { AgentId } from "../../types";
import { AgendaStatus, createOpinionId, createAgendaId } from "../../types";
import { BlackboardError, BlackboardErrorCode } from "../blackboard";

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

  /**
   * opinionId로 opinionKey 찾기
   * @private
   */
  private findOpinionKey(opinionId: OpinionId): string | undefined {
    const decisions = this.board.read<DecisionsSection>("decisions");
    for (const [key, opinion] of decisions.opinions.entries()) {
      if (opinion.id === opinionId) {
        return key;
      }
    }
    return undefined;
  }

  // === 안건 관리 ===

  /** 현재 안건 */
  get current(): Agenda | null {
    const decisions = this.board.read<DecisionsSection>("decisions");
    return decisions.current;
  }

  /** 대기 중인 안건들 */
  get pending(): Agenda[] {
    const decisions = this.board.read<DecisionsSection>("decisions");
    return decisions.pending.filter((a) => a.status === AgendaStatus.SUBMITTED);
  }

  /** 모든 대기 안건 */
  get allPending(): Agenda[] {
    return this.board.read<DecisionsSection>("decisions").pending;
  }

  /** 결정 이력 전체 */
  get history(): Resolution[] {
    return this.board.read<DecisionsSection>("decisions").history;
  }

  /** 대기 중인 안건 수 */
  get pendingCount(): number {
    return this.board.read<DecisionsSection>("decisions").pending.length;
  }

  /** 결정 이력 수 */
  get historyCount(): number {
    return this.board.read<DecisionsSection>("decisions").history.length;
  }

  /**
   * 안건 제출
   * @param agendaInput - 새 안건 입력
   */
  submitAgenda(agendaInput: AgendaCreateInput): Agenda {
    // 필수 필드 검증
    if (!agendaInput.title?.trim()) {
      throw new BlackboardError(BlackboardErrorCode.INVALID_INPUT, "Title is required");
    }
    if (!agendaInput.description?.trim()) {
      throw new BlackboardError(BlackboardErrorCode.INVALID_INPUT, "Description is required");
    }
    if (!agendaInput.proposer) {
      throw new BlackboardError(BlackboardErrorCode.INVALID_INPUT, "Proposer is required");
    }

    const decisions = this.board.read<DecisionsSection>("decisions");
    const now = new Date();

    const agenda: Agenda = {
      id: createAgendaId(`agenda-${crypto.randomUUID()}`),
      title: agendaInput.title,
      description: agendaInput.description,
      proposer: agendaInput.proposer,
      status: AgendaStatus.SUBMITTED,
      deadline: agendaInput.deadline ?? null,
      requiredQuorum: agendaInput.requiredQuorum ?? 3,
      votingMethod: agendaInput.votingMethod ?? "majority",
      priority: agendaInput.priority ?? 1,
      tags: agendaInput.tags ?? [],
      attachments: agendaInput.attachments ?? [],
      createdAt: now,
      updatedAt: now,
      version: 1,
    };

    const updatedPending = [...decisions.pending, agenda];
    this.board.write("decisions.pending", updatedPending);
    this.board.emit("agenda_submitted", { agendaId: agenda.id, agenda });

    return agenda;
  }

  /**
   * 안건 상태 변경
   */
  updateAgendaStatus(agendaId: AgendaId, status: AgendaStatus): void {
    const decisions = this.board.read<DecisionsSection>("decisions");

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

      this.board.write("decisions.pending", updatedPending);
    } else if (decisions.current) {
      const updatedAgenda = {
        ...decisions.current,
        status,
        updatedAt: new Date(),
        version: decisions.current.version + 1,
      };

      this.board.write("decisions.current", updatedAgenda);
    }

    this.board.emit("agenda_updated", { agendaId, status });
  }

  /**
   * 현재 안건 설정
   */
  setCurrentAgenda(agendaId: AgendaId): void {
    const decisions = this.board.read<DecisionsSection>("decisions");

    // 현재 안건이 있으면 pending으로 이동
    const updatedPending = [...decisions.pending];
    if (decisions.current) {
      updatedPending.push(decisions.current);
    }

    // pending에서 해당 안건 찾기
    const agendaIndex = updatedPending.findIndex((a) => a.id === agendaId);
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

    this.board.write("decisions.current", updatedAgenda);
    this.board.write("decisions.pending", updatedPending);
  }

  /**
   * 안건 취소
   */
  cancelAgenda(agendaId: AgendaId, reason: string): void {
    const decisions = this.board.read<DecisionsSection>("decisions");

    // current 안건인 경우
    if (decisions.current?.id === agendaId) {
      this.board.write("decisions.current", null);
      this.board.emit("agenda_updated", { agendaId, status: AgendaStatus.CANCELLED, reason });
      return;
    }

    // pending 안건인 경우
    const agendaIndex = decisions.pending.findIndex((a) => a.id === agendaId);
    if (agendaIndex === -1) {
      throw new BlackboardError(
        BlackboardErrorCode.AGENDA_NOT_FOUND,
        `Agenda ${agendaId} not found`
      );
    }

    const updatedPending = decisions.pending.filter((a) => a.id !== agendaId);
    this.board.write("decisions.pending", updatedPending);
    this.board.emit("agenda_updated", { agendaId, status: AgendaStatus.CANCELLED, reason });
  }

  /**
   * 안건 조회
   */
  getAgenda(agendaId: AgendaId): Agenda | undefined {
    const decisions = this.board.read<DecisionsSection>("decisions");

    if (decisions.current?.id === agendaId) {
      return decisions.current;
    }

    const pendingAgenda = decisions.pending.find((a) => a.id === agendaId);
    if (pendingAgenda) {
      return pendingAgenda;
    }

    // 해결된 안건도 조회 (resolution에 연결된 agenda 정보)
    // 실제로는 agenda가 history에 저장되지 않으므로 null 반환
    return undefined;
  }

  /**
   * 모든 안건 조회
   */
  getAllAgendas(): Agenda[] {
    const decisions = this.board.read<DecisionsSection>("decisions");
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
   * @param opinionInput - 의견 생성 입력 (agentId 포함)
   */
  submitOpinion(opinionInput: OpinionCreateInput & { agentId: AgentId }): Opinion {
    // 필수 필드 검증
    if (!opinionInput.stance) {
      throw new BlackboardError(BlackboardErrorCode.INVALID_INPUT, "Stance is required");
    }
    if (
      opinionInput.confidence !== undefined &&
      (opinionInput.confidence < 0 ||
        opinionInput.confidence > 1 ||
        Number.isNaN(opinionInput.confidence))
    ) {
      throw new BlackboardError(
        BlackboardErrorCode.INVALID_INPUT,
        "Confidence must be between 0 and 1"
      );
    }

    const decisions = this.board.read<DecisionsSection>("decisions");
    const now = new Date();

    // 안건 확인
    const agenda = this.getAgenda(opinionInput.agendaId);
    if (!agenda) {
      throw new BlackboardError(
        BlackboardErrorCode.AGENDA_NOT_FOUND,
        `Agenda ${opinionInput.agendaId} not found`
      );
    }

    // 중복 의견 확인
    const opinionKey = this.getOpinionKey(opinionInput.agendaId, opinionInput.agentId);
    if (decisions.opinions.has(opinionKey)) {
      throw new BlackboardError(
        BlackboardErrorCode.DUPLICATE_OPINION,
        `Agent ${opinionInput.agentId} already submitted an opinion for agenda ${opinionInput.agendaId}`
      );
    }

    const fullOpinion: Opinion = {
      id: createOpinionId(`opinion-${crypto.randomUUID()}`),
      agentId: opinionInput.agentId,
      agendaId: opinionInput.agendaId,
      stance: opinionInput.stance,
      reason: opinionInput.reason,
      conditions: opinionInput.conditions ?? [],
      confidence: opinionInput.confidence ?? 0.5,
      references: opinionInput.references ?? [],
      createdAt: now,
      updatedAt: now,
    };

    const updatedOpinions = new Map(decisions.opinions);
    updatedOpinions.set(opinionKey, fullOpinion);

    this.board.write("decisions.opinions", updatedOpinions);
    this.board.emit("opinion_added", { opinion: fullOpinion });

    return fullOpinion;
  }

  /**
   * 특정 안건의 모든 의견 조회
   */
  getOpinions(agendaId: AgendaId): Opinion[] {
    const decisions = this.board.read<DecisionsSection>("decisions");
    const opinions: Opinion[] = [];

    for (const opinion of decisions.opinions.values()) {
      if (opinion.agendaId === agendaId) {
        opinions.push(opinion);
      }
    }

    return opinions;
  }

  /**
   * 에이전트의 의견 조회 (agendaId 먼저)
   * @deprecated getAgentOpinion() 사용 권장
   */
  getOpinionByAgent(agendaId: AgendaId, agentId: AgentId): Opinion | undefined {
    return this.getAgentOpinion(agentId, agendaId);
  }

  /**
   * 에이전트의 의견 조회
   * @param agentId - 에이전트 ID
   * @param agendaId - 안건 ID (필수)
   */
  getAgentOpinion(agentId: AgentId, agendaId: AgendaId): Opinion | undefined {
    const decisions = this.board.read<DecisionsSection>("decisions");
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
    approvalRate: number;
    quorumReached: boolean;
  } {
    const opinions = this.getOpinions(agendaId);

    const summary = {
      total: opinions.length,
      approve: 0,
      reject: 0,
      conditional: 0,
      abstain: 0,
      approvalRate: 0,
      quorumReached: false,
    };

    // 유효한 stance 값인지 확인 후 처리
    const validStances: readonly string[] = ["approve", "reject", "conditional", "abstain"];

    for (const opinion of opinions) {
      if (validStances.includes(opinion.stance)) {
        summary[opinion.stance as keyof typeof summary]++;
      }
    }

    // 승인률 계산 (찬성 / 총 투표수)
    summary.approvalRate =
      summary.total > 0 ? (summary.approve + summary.conditional) / summary.total : 0;

    // 정족수 도달 여부 확인
    const agenda = this.getAgenda(agendaId);
    if (agenda) {
      summary.quorumReached = summary.total >= agenda.requiredQuorum;
    }

    return summary;
  }

  /**
   * 모든 의견 초기화 (재투표 시)
   */
  clearOpinions(agendaId: AgendaId): void {
    const decisions = this.board.read<DecisionsSection>("decisions");
    const updatedOpinions = new Map(decisions.opinions);

    for (const [key, opinion] of decisions.opinions.entries()) {
      if (opinion.agendaId === agendaId) {
        updatedOpinions.delete(key);
      }
    }

    this.board.write("decisions.opinions", updatedOpinions);
  }

  /**
   * 의견 업데이트
   */
  updateOpinion(opinionId: OpinionId, updates: Partial<Omit<Opinion, "id" | "createdAt">>): void {
    const decisions = this.board.read<DecisionsSection>("decisions");
    const opinionKey = this.findOpinionKey(opinionId);

    if (!opinionKey) {
      throw new BlackboardError(
        BlackboardErrorCode.OPINION_NOT_FOUND,
        `Opinion ${opinionId} not found`
      );
    }

    const existingOpinion = decisions.opinions.get(opinionKey);
    if (!existingOpinion) {
      throw new BlackboardError(
        BlackboardErrorCode.OPINION_NOT_FOUND,
        `Opinion ${opinionId} not found`
      );
    }

    const updatedOpinion: Opinion = {
      ...existingOpinion,
      ...updates,
      id: existingOpinion.id, // ID 변경 불가
      createdAt: existingOpinion.createdAt, // 생성 시간 변경 불가
      updatedAt: new Date(),
    };

    const updatedOpinions = new Map(decisions.opinions);
    updatedOpinions.set(opinionKey, updatedOpinion);

    this.board.write("decisions.opinions", updatedOpinions);
    this.board.emit("opinion_updated", { opinion: updatedOpinion });
  }

  /**
   * 의견 삭제
   */
  removeOpinion(opinionId: OpinionId): void {
    const decisions = this.board.read<DecisionsSection>("decisions");
    const opinionKey = this.findOpinionKey(opinionId);

    if (!opinionKey) {
      throw new BlackboardError(
        BlackboardErrorCode.OPINION_NOT_FOUND,
        `Opinion ${opinionId} not found`
      );
    }

    const updatedOpinions = new Map(decisions.opinions);
    updatedOpinions.delete(opinionKey);

    this.board.write("decisions.opinions", updatedOpinions);
    this.board.emit("opinion_removed", { opinionId });
  }

  // === 결정 관리 ===

  /**
   * 결정 기록 (안건 제거)
   * @description 새 결정을 기록하고 관련 안건을 제거합니다.
   * @warning closeAgenda()를 사용하면 안건이 RESOLVED 상태로 유지됩니다.
   * 이 메서드는 안건을 완전히 제거합니다.
   */
  recordResolution(
    resolutionInput: Omit<Resolution, "id" | "createdAt" | "updatedAt">
  ): Resolution {
    const decisions = this.board.read<DecisionsSection>("decisions");
    const now = new Date();

    const resolution: Resolution = {
      id: `resolution-${crypto.randomUUID()}`,
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
    this.board.write("decisions.history", updatedHistory);

    // 현재 안건 초기화
    if (decisions.current?.id === resolution.agendaId) {
      this.board.write("decisions.current", null);
    } else {
      // pending에서 제거
      const updatedPending = decisions.pending.filter((a) => a.id !== resolution.agendaId);
      this.board.write("decisions.pending", updatedPending);
    }

    this.board.emit("resolution_created", { resolution });

    return resolution;
  }

  /**
   * 결정 기록 (안건 유지)
   * @description 안건을 제거하지 않고 결정만 기록합니다.
   * @private
   */
  private recordResolutionKeepAgenda(
    resolutionInput: Omit<Resolution, "id" | "createdAt" | "updatedAt">
  ): Resolution {
    const decisions = this.board.read<DecisionsSection>("decisions");
    const now = new Date();

    const resolution: Resolution = {
      id: `resolution-${crypto.randomUUID()}`,
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
    this.board.write("decisions.history", updatedHistory);
    this.board.emit("resolution_created", { resolution });

    return resolution;
  }

  /**
   * 결정 이력 조회
   */
  getHistory(filter?: { agendaId?: AgendaId; decision?: DecisionType }): Resolution[] {
    const decisions = this.board.read<DecisionsSection>("decisions");
    let history = [...decisions.history];

    if (!filter) {
      return history;
    }

    if (filter.agendaId) {
      history = history.filter((r) => r.agendaId === filter.agendaId);
    }

    if (filter.decision) {
      history = history.filter((r) => r.decision === filter.decision);
    }

    return history;
  }

  /**
   * 최근 N개 결정 조회
   */
  getRecentResolutions(count: number): Resolution[] {
    const decisions = this.board.read<DecisionsSection>("decisions");
    return decisions.history.slice(-count).reverse();
  }

  /**
   * 결정 조회
   */
  getResolution(resolutionId: string): Resolution | undefined {
    const decisions = this.board.read<DecisionsSection>("decisions");
    return decisions.history.find((r) => r.id === resolutionId);
  }

  /**
   * 안건에 대한 결정 조회
   */
  getResolutionByAgenda(agendaId: AgendaId): Resolution | undefined {
    const decisions = this.board.read<DecisionsSection>("decisions");
    return decisions.history.find((r) => r.agendaId === agendaId);
  }

  // === 통계 ===

  /**
   * 결정 수 조회
   */
  getResolutionCount(): number {
    return this.board.read<DecisionsSection>("decisions").history.length;
  }

  /**
   * 안건 수 조회
   */
  getAgendaCount(): number {
    const decisions = this.board.read<DecisionsSection>("decisions");
    let count = decisions.current ? 1 : 0;
    count += decisions.pending.length;
    return count;
  }

  /**
   * 의견 수 조회
   */
  getOpinionCount(): number {
    return this.board.read<DecisionsSection>("decisions").opinions.size;
  }

  // === 투표 ===

  /**
   * 투표 결과 확인
   * @note conditional은 승인으로 카운트됩니다 (찬성 = approve + conditional)
   */
  checkVotingResult(agendaId: AgendaId): {
    passed: boolean;
    method: "majority" | "unanimous" | "weighted" | "supermajority";
    summary: {
      total: number;
      approve: number;
      reject: number;
      conditional: number;
      abstain: number;
      approvalRate: number;
      quorumReached: boolean;
    };
  } {
    const agenda = this.getAgenda(agendaId);
    if (!agenda) {
      throw new BlackboardError(
        BlackboardErrorCode.AGENDA_NOT_FOUND,
        `Agenda ${agendaId} not found`
      );
    }

    const summary = this.summarizeOpinions(agendaId);
    let passed = false;

    switch (agenda.votingMethod) {
      case "unanimous":
        // 전체 찬성 (반대 없음)
        passed = summary.reject === 0 && summary.total > 0;
        break;
      case "majority": {
        // 단순 과반수 (50% 초과)
        const approveCount = summary.approve + summary.conditional;
        passed = approveCount > summary.total / 2;
        break;
      }
      case "supermajority": {
        // 2/3 이상 찬성
        const superMajorityCount = summary.approve + summary.conditional;
        passed = superMajorityCount >= (summary.total * 2) / 3;
        break;
      }
      case "weighted": {
        // 가중치 투표 (현재는 과반수와 동일하게 처리)
        const weightedCount = summary.approve + summary.conditional;
        passed = weightedCount > summary.total / 2;
        break;
      }
    }

    return {
      passed: summary.quorumReached && passed,
      method: agenda.votingMethod,
      summary,
    };
  }

  // === 안건 관리 추가 ===

  /**
   * 안건 종료 (결정 기록)
   * @description 안건을 RESOLVED 상태로 변경하고 결정을 기록합니다.
   *
   * **정책:** 안건은 RESOLVED 상태로 변경 후에도 pending/current에 유지됩니다.
   * 이는 결정 이력 추적 및 후속 조치 관리를 위함입니다.
   * 안건을 완전히 제거하려면 {@link recordResolution()}을 직접 호출하세요.
   *
   * @param agendaId - 종료할 안건 ID
   * @param decision - 결정 유형 (기본: approved)
   */
  closeAgenda(
    agendaId: AgendaId,
    decision: "approved" | "rejected" | "deferred" = "approved"
  ): void {
    const agenda = this.getAgenda(agendaId);
    if (!agenda) {
      throw new BlackboardError(
        BlackboardErrorCode.AGENDA_NOT_FOUND,
        `Agenda ${agendaId} not found`
      );
    }

    const summary = this.summarizeOpinions(agendaId);

    // 먼저 안건 상태 업데이트 (agenda를 찾을 수 있도록)
    this.updateAgendaStatus(agendaId, AgendaStatus.RESOLVED);

    // 결정 기록 생성 (안건 유지 - 정책에 따름)
    this.recordResolutionKeepAgenda({
      agendaId,
      decision: decision as DecisionType,
      summary: `Agenda ${agenda.title} ${decision}`,
      voteSummary: {
        total: summary.total,
        approve: summary.approve,
        reject: summary.reject,
        conditional: summary.conditional,
        abstain: summary.abstain,
      },
      conditions: [],
      dissent: [],
      decidedBy: agenda.proposer,
      nextActions: [],
    });
  }

  /**
   * 안건 업데이트
   */
  updateAgenda(agendaId: AgendaId, updates: Partial<Omit<Agenda, "id" | "createdAt">>): Agenda {
    const decisions = this.board.read<DecisionsSection>("decisions");

    // current 안건 확인
    if (decisions.current?.id === agendaId) {
      const updatedAgenda: Agenda = {
        ...decisions.current,
        ...updates,
        id: decisions.current.id, // ID 변경 불가
        createdAt: decisions.current.createdAt, // 생성 시간 변경 불가
        updatedAt: new Date(),
        version: decisions.current.version + 1,
      };

      this.board.write("decisions.current", updatedAgenda);
      this.board.emit("agenda_updated", { agendaId, agenda: updatedAgenda });
      return updatedAgenda;
    }

    // pending 안건 확인
    const pendingIndex = decisions.pending.findIndex((a) => a.id === agendaId);
    if (pendingIndex === -1) {
      throw new BlackboardError(
        BlackboardErrorCode.AGENDA_NOT_FOUND,
        `Agenda ${agendaId} not found`
      );
    }

    const existingAgenda = decisions.pending[pendingIndex];
    const updatedAgenda: Agenda = {
      ...existingAgenda,
      ...updates,
      id: existingAgenda.id, // ID 변경 불가
      createdAt: existingAgenda.createdAt, // 생성 시간 변경 불가
      updatedAt: new Date(),
      version: existingAgenda.version + 1,
    };

    const updatedPending = [...decisions.pending];
    updatedPending[pendingIndex] = updatedAgenda;

    this.board.write("decisions.pending", updatedPending);
    this.board.emit("agenda_updated", { agendaId, agenda: updatedAgenda });
    return updatedAgenda;
  }

  // === 초기화 ===

  /**
   * 모든 결정 초기화
   */
  clearAll(): void {
    this.board.write("decisions.current", null);
    this.board.write("decisions.pending", []);
    this.board.write("decisions.opinions", new Map());
    this.board.write("decisions.history", []);
    this.board.emit("decisions_cleared", {});
  }
}
