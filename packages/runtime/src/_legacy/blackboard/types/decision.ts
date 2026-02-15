/**
 * @module decision
 * @description 의사결정 관련 타입 정의 - Agenda, Opinion, Resolution
 */

import type { Identifiable, Timestamped, Versioned } from "./base";
import type { AgentId, AgendaId, OpinionId } from "./base";

/**
 * 투표 방식
 * @description 안건 결정을 위한 투표 방식
 */
export type VotingMethod = "majority" | "unanimous" | "weighted" | "supermajority";

/**
 * 안건 상태
 * @description 안건의 현재 진행 상태
 */
export enum AgendaStatus {
  /** 초안 - 아직 제출되지 않음 */
  DRAFT = "draft",
  /** 제출됨 - 논의 대기 */
  SUBMITTED = "submitted",
  /** 논의 중 */
  DISCUSSING = "discussing",
  /** 토론 중 */
  DEBATING = "debating",
  /** 투표 중 */
  VOTING = "voting",
  /** 결정됨 */
  RESOLVED = "resolved",
  /** 연기됨 */
  DEFERRED = "deferred",
  /** 취소됨 */
  CANCELLED = "cancelled",
}

/**
 * 입장 (스탠스)
 * @description 의견 제출자의 입장
 */
export type Stance = "approve" | "reject" | "conditional" | "abstain";

/**
 * 최종 결정 유형
 * @description 안건에 대한 최종 결정의 유형
 */
export type DecisionType = "approved" | "rejected" | "deferred" | "amended";

/**
 * 첨부 자료
 * @description 안건에 첨부된 문서, 데이터 등
 */
export interface Attachment {
  /** 파일명 */
  name: string;
  /** MIME 타입 */
  mimeType: string;
  /** URL 또는 데이터 참조 */
  url: string;
  /** 크기 (바이트) */
  size: number;
}

/**
 * 안건 (의제)
 * @description AI 이사회에서 논의할 주제
 *
 * @example
 * ```typescript
 * const agenda: Agenda = {
 *   id: createAgendaId('agenda-001'),
 *   title: '신규 서비스 출시 검토',
 *   description: 'Q2에 출시 예정인 신규 서비스의 적합성 검토',
 *   proposer: createAgentId('ceo-agent'),
 *   status: AgendaStatus.SUBMITTED,
 *   deadline: new Date('2026-02-10'),
 *   requiredQuorum: 3,
 *   votingMethod: 'majority',
 *   priority: 1,
 *   tags: ['business', 'strategy'],
 *   attachments: [],
 *   createdAt: new Date(),
 *   updatedAt: new Date(),
 *   version: 1,
 * };
 * ```
 */
export interface Agenda extends Identifiable<AgendaId>, Timestamped, Versioned {
  /** 안건 제목 */
  title: string;
  /** 안건 상세 설명 */
  description: string;
  /** 제안자 에이전트 ID */
  proposer: AgentId;
  /** 현재 상태 */
  status: AgendaStatus;
  /** 마감 기한 (선택) */
  deadline: Date | null;
  /** 필요 정족수 */
  requiredQuorum: number;
  /** 투표 방식 */
  votingMethod: VotingMethod;
  /** 우선순위 (0-10, 높을수록 중요) */
  priority: number;
  /** 태그 */
  tags: string[];
  /** 첨부 자료 */
  attachments: Attachment[];
}

/**
 * 의견
 * @description 에이전트가 안건에 대해 제출하는 의견
 *
 * @example
 * ```typescript
 * const opinion: Opinion = {
 *   id: createOpinionId('opinion-001'),
 *   agentId: createAgentId('agent-001'),
 *   agendaId: createAgendaId('agenda-001'),
 *   stance: 'approve',
 *   reason: '시장 조사 결과가 긍정적임',
 *   conditions: ['마케팅 예산 확보 필요'],
 *   confidence: 0.85,
 *   references: ['fact-001', 'inference-002'],
 *   createdAt: new Date(),
 *   updatedAt: new Date(),
 * };
 * ```
 */
export interface Opinion extends Identifiable<OpinionId>, Timestamped {
  /** 의견 제출자 */
  agentId: AgentId;
  /** 관련 안건 ID */
  agendaId: AgendaId;
  /** 입장 */
  stance: Stance;
  /** 의견 내용 (근거) */
  reason: string;
  /** 조건 (conditional일 경우) */
  conditions: string[];
  /** 확신도 (0.0 - 1.0) */
  confidence: number;
  /** 참조한 사실/추론 ID 목록 */
  references: string[];
}

/**
 * 투표 요약
 * @description 투표 결과의 요약 통계
 */
export interface VoteSummary {
  /** 찬성 수 */
  approve: number;
  /** 반대 수 */
  reject: number;
  /** 기권 수 */
  abstain: number;
  /** 조건부 찬성 수 */
  conditional: number;
  /** 총 투표 수 */
  total: number;
}

/**
 * 다음 단계 행동
 * @description 결정 후 이행할 행동 항목
 */
export interface NextAction {
  /** 행동 설명 */
  description: string;
  /** 담당자 */
  assignee: AgentId | null;
  /** 기한 */
  dueDate: Date | null;
}

/**
 * 결정 (해결)
 * @description 안건에 대한 최종 결정 기록
 *
 * @example
 * ```typescript
 * const resolution: Resolution = {
 *   id: 'res-001',
 *   agendaId: createAgendaId('agenda-001'),
 *   decision: 'approved',
 *   summary: '신규 서비스 출시 승인',
 *   voteSummary: {
 *     approve: 3,
 *     reject: 1,
 *     abstain: 0,
 *     conditional: 0,
 *     total: 4,
 *   },
 *   conditions: ['Q2 내 출시'],
 *   dissent: ['보안 검토 필요'],
 *   decidedBy: createAgentId('director-agent'),
 *   nextActions: [
 *     {
 *       description: '출시 계획 수립',
 *       assignee: createAgentId('pm-agent'),
 *       dueDate: new Date('2026-02-15'),
 *     },
 *   ],
 *   createdAt: new Date(),
 *   updatedAt: new Date(),
 * };
 * ```
 */
export interface Resolution extends Identifiable, Timestamped {
  /** 관련 안건 ID */
  agendaId: AgendaId;
  /** 결정 유형 */
  decision: DecisionType;
  /** 결정 요약 */
  summary: string;
  /** 투표 결과 요약 */
  voteSummary: VoteSummary;
  /** 이행 조건 (있는 경우) */
  conditions: string[];
  /** 반대 의견 요약 (있는 경우) */
  dissent: string[];
  /** 결정 주체 (director) */
  decidedBy: AgentId;
  /** 다음 단계 행동 */
  nextActions: NextAction[];
}

/**
 * 안건 생성 옵션
 * @description 새 안건 생성 시 필요한 필드
 */
export interface AgendaCreateInput {
  /** 안건 제목 */
  title: string;
  /** 안건 상세 설명 */
  description: string;
  /** 제안자 에이전트 ID */
  proposer: AgentId;
  /** 마감 기한 (선택) */
  deadline?: Date | null;
  /** 필요 정족수 (기본: 3) */
  requiredQuorum?: number;
  /** 투표 방식 (기본: majority) */
  votingMethod?: VotingMethod;
  /** 우선순위 (기본: 1) */
  priority?: number;
  /** 태그 */
  tags?: string[];
  /** 첨부 자료 */
  attachments?: Attachment[];
}

/**
 * 의견 생성 옵션
 * @description 새 의견 제출 시 필요한 필드
 */
export interface OpinionCreateInput {
  /** 관련 안건 ID */
  agendaId: AgendaId;
  /** 입장 */
  stance: Stance;
  /** 의견 내용 (근거) */
  reason: string;
  /** 조건 (conditional일 경우) */
  conditions?: string[];
  /** 확신도 (기본: 1.0) */
  confidence?: number;
  /** 참조한 사실/추론 ID 목록 */
  references?: string[];
}
