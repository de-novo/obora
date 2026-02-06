/**
 * @module knowledge
 * @description 지식 관련 타입 정의 - Fact, Inference, Pattern
 */

import type { Identifiable, Timestamped } from './base';
import type { AgentId } from './base';

/**
 * 추론 방법
 * @description 사실로부터 결론을 도출하는 방법
 */
export type InferenceMethod = 'deduction' | 'induction' | 'abduction';

/**
 * 사실 (Fact)
 * @description 검증된 정보
 *
 * @example
 * ```typescript
 * const fact: Fact = {
 *   id: 'fact-001',
 *   content: '2025년 Q4 매출이 전년 대비 20% 증가',
 *   source: createAgentId('analyst-agent'),
 *   confidence: 0.95,
 *   category: 'finance',
 *   tags: ['revenue', 'growth'],
 *   expiresAt: null,
 *   createdAt: new Date(),
 *   updatedAt: new Date(),
 * };
 * ```
 */
export interface Fact extends Identifiable, Timestamped {
  /** 사실 내용 */
  content: string;
  /** 출처 에이전트 */
  source: AgentId;
  /** 신뢰도 (0.0 - 1.0) */
  confidence: number;
  /** 카테고리 */
  category: string;
  /** 태그 */
  tags: string[];
  /** 유효 기간 (만료 시간, null이면 영구) */
  expiresAt: Date | null;
}

/**
 * 추론 (Inference)
 * @description 사실들로부터 도출된 결론
 *
 * @example
 * ```typescript
 * const inference: Inference = {
 *   id: 'inference-001',
 *   conclusion: '고객 만족도가 매출 증가와 상관관계가 있음',
 *   premises: ['fact-001', 'fact-002'],
 *   source: createAgentId('analyst-agent'),
 *   confidence: 0.8,
 *   tags: ['correlation'],
 *   createdAt: new Date(),
 *   updatedAt: new Date(),
 * };
 * ```
 */
export interface Inference extends Identifiable, Timestamped {
  /** 결론 */
  conclusion: string;
  /** 전제 (참조하는 Fact ID들) */
  premises: string[];
  /** 추론한 에이전트 (deprecated: source 사용) */
  derivedBy?: AgentId;
  /** 출처 에이전트 */
  source: AgentId;
  /** 추론 방법 */
  method?: InferenceMethod;
  /** 신뢰도 */
  confidence: number;
  /** 태그 */
  tags: string[];
}

/**
 * 패턴 조건/결과 항목
 */
export interface PatternCondition {
  type: string;
  value: string;
}

/**
 * 패턴 (Pattern)
 * @description 학습된 패턴
 *
 * @example
 * ```typescript
 * const pattern: Pattern = {
 *   id: 'pattern-001',
 *   name: '매출 증가 패턴',
 *   description: '고객 만족도 상승 후 2달 내 매출 증가',
 *   conditions: [{ type: 'trigger', value: 'satisfaction_up' }],
 *   consequences: [{ type: 'result', value: 'revenue_increase' }],
 *   confidence: 0.85,
 *   tags: ['finance'],
 *   createdAt: new Date(),
 *   updatedAt: new Date(),
 * };
 * ```
 */
export interface Pattern extends Identifiable, Timestamped {
  /** 패턴 이름 */
  name: string;
  /** 패턴 설명 */
  description: string;
  /** 패턴 조건 */
  conditions: PatternCondition[];
  /** 패턴 결과 */
  consequences: PatternCondition[];
  /** 신뢰도 */
  confidence: number;
  /** 태그 */
  tags: string[];
  /** 발견한 에이전트 (optional) */
  discoveredBy?: AgentId;
  /** 적용 횟수 */
  usageCount?: number;
  /** 성공률 */
  successRate?: number;
}

/**
 * 사실 생성 옵션
 * @description 새 사실 생성 시 필요한 필드
 */
export interface FactCreateInput {
  /** 사실 내용 */
  content: string;
  /** 출처 에이전트 */
  source: AgentId;
  /** 신뢰도 */
  confidence: number;
  /** 카테고리 */
  category: string;
  /** 태그 */
  tags?: string[];
  /** 유효 기간 (선택) */
  expiresAt?: Date | null;
}

/**
 * 추론 생성 옵션
 * @description 새 추론 생성 시 필요한 필드
 */
export interface InferenceCreateInput {
  /** 결론 */
  conclusion: string;
  /** 전제 (참조하는 Fact ID들) */
  premises: string[];
  /** 출처 에이전트 */
  source: AgentId;
  /** 추론 방법 (optional) */
  method?: InferenceMethod;
  /** 신뢰도 */
  confidence: number;
  /** 태그 */
  tags?: string[];
}

/**
 * 패턴 생성 옵션
 * @description 새 패턴 생성 시 필요한 필드
 */
export interface PatternCreateInput {
  /** 패턴 이름 */
  name: string;
  /** 패턴 설명 */
  description: string;
  /** 패턴 조건 */
  conditions: PatternCondition[];
  /** 패턴 결과 */
  consequences: PatternCondition[];
  /** 신뢰도 */
  confidence: number;
  /** 태그 */
  tags?: string[];
  /** 발견한 에이전트 (optional) */
  discoveredBy?: AgentId;
  /** 초기 적용 횟수 */
  usageCount?: number;
  /** 초기 성공률 */
  successRate?: number;
}

/**
 * 지식 검색 쿼리
 * @description 지식 섹션에서 검색하기 위한 쿼리 옵션
 */
export interface KnowledgeQuery {
  /** 검색할 카테고리 */
  category?: string;
  /** 검색할 태그 (복수) */
  tags?: string[];
  /** 검색할 태그 (단일) */
  tag?: string;
  /** 최소 신뢰도 */
  minConfidence?: number;
  /** 만료되지 않은 것만 검색 */
  validOnly?: boolean;
  /** 출처 에이전트 ID */
  source?: AgentId;
  /** 검색 텍스트 */
  text?: string;
}

/**
 * 추론 검색 쿼리
 */
export interface InferenceQuery {
  /** 출처 에이전트 */
  source?: AgentId;
  /** 전제 포함 */
  premises?: string[];
  /** 최소 신뢰도 */
  minConfidence?: number;
}

/**
 * 패턴 검색 쿼리
 */
export interface PatternQuery {
  /** 태그 */
  tag?: string;
  /** 최소 신뢰도 */
  minConfidence?: number;
}
