/**
 * @module knowledge-accessor
 * @description 지식 섹션 접근자
 */

import type { Blackboard } from '../blackboard';
import type { KnowledgeSection } from '../../types';
import type {
  Fact,
  FactCreateInput,
  Inference,
  InferenceCreateInput,
  Pattern,
  PatternCreateInput,
  KnowledgeQuery,
} from '../../types';
import type { AgentId, createAgentId, createTaskId, createAgendaId } from '../../types';
import { createAgentId as createId } from '../../types';
import { BlackboardError, BlackboardErrorCode } from '../blackboard';

/**
 * 지식 섹션 접근자
 * @description knowledge 섹션에 대한 타입 안전한 접근 제공
 */
export class KnowledgeSectionAccessor {
  constructor(private readonly board: Blackboard) {}

  // === 사실 관리 ===

  /**
   * 사실 추가
   * @param factInput - 새 사실 입력
   */
  addFact(factInput: FactCreateInput): Fact {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    const now = new Date();

    const fact: Fact = {
      id: `fact-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      content: factInput.content,
      source: factInput.source,
      confidence: factInput.confidence,
      category: factInput.category,
      tags: factInput.tags || [],
      expiresAt: factInput.expiresAt ?? null,
      createdAt: now,
      updatedAt: now,
    };

    const updatedFacts = [...knowledge.facts, fact];
    this.board.write('knowledge.facts', updatedFacts);

    return fact;
  }

  /**
   * 사실 조회
   */
  getFact(factId: string): Fact | undefined {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    return knowledge.facts.find(f => f.id === factId);
  }

  /**
   * 사실 검색
   */
  findFacts(query: KnowledgeQuery): Fact[] {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    const now = new Date();

    return knowledge.facts.filter(fact => {
      // 유효 기간 필터
      if (query.validOnly && fact.expiresAt && fact.expiresAt < now) {
        return false;
      }

      // 카테고리 필터
      if (query.category !== undefined && fact.category !== query.category) {
        return false;
      }

      // 출처 필터
      if (query.source !== undefined && fact.source !== query.source) {
        return false;
      }

      // 최소 신뢰도 필터
      if (query.minConfidence !== undefined && fact.confidence < query.minConfidence) {
        return false;
      }

      // 태그 필터 (모든 태그가 포함되어야 함)
      if (query.tags && query.tags.length > 0) {
        const hasAllTags = query.tags.every(tag => fact.tags.includes(tag));
        if (!hasAllTags) {
          return false;
        }
      }

      // 텍스트 검색
      if (query.text && !fact.content.toLowerCase().includes(query.text.toLowerCase())) {
        return false;
      }

      return true;
    });
  }

  /**
   * 만료된 사실 정리
   */
  cleanupExpiredFacts(): number {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    const now = new Date();

    const validFacts = knowledge.facts.filter(
      fact => !fact.expiresAt || fact.expiresAt >= now
    );

    const removedCount = knowledge.facts.length - validFacts.length;

    if (removedCount > 0) {
      this.board.write('knowledge.facts', validFacts);
    }

    return removedCount;
  }

  /**
   * 사실 삭제
   */
  removeFact(factId: string): void {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    const updatedFacts = knowledge.facts.filter(f => f.id !== factId);

    if (updatedFacts.length === knowledge.facts.length) {
      throw new BlackboardError(
        BlackboardErrorCode.FACT_NOT_FOUND,
        `Fact ${factId} not found`
      );
    }

    this.board.write('knowledge.facts', updatedFacts);
  }

  /**
   * 사실 수 조회
   */
  getFactCount(): number {
    return this.board.read<KnowledgeSection>('knowledge').facts.length;
  }

  // === 추론 관리 ===

  /**
   * 추론 추가
   */
  addInference(inferenceInput: InferenceCreateInput): Inference {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    const now = new Date();

    // 전제 사실 검증
    const factIds = new Set(knowledge.facts.map(f => f.id));
    const invalidPremises = inferenceInput.premises.filter(p => !factIds.has(p));
    if (invalidPremises.length > 0) {
      throw new BlackboardError(
        BlackboardErrorCode.INVALID_PREMISES,
        `Invalid premises: ${invalidPremises.join(', ')}`
      );
    }

    const inference: Inference = {
      id: `inference-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      conclusion: inferenceInput.conclusion,
      premises: inferenceInput.premises,
      derivedBy: inferenceInput.derivedBy,
      method: inferenceInput.method,
      confidence: inferenceInput.confidence,
      createdAt: now,
      updatedAt: now,
    };

    const updatedInferences = [...knowledge.inferences, inference];
    this.board.write('knowledge.inferences', updatedInferences);

    return inference;
  }

  /**
   * 추론 조회
   */
  getInference(inferenceId: string): Inference | undefined {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    return knowledge.inferences.find(i => i.id === inferenceId);
  }

  /**
   * 특정 사실을 전제로 하는 추론 찾기
   */
  findInferencesByPremise(factId: string): Inference[] {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    return knowledge.inferences.filter(i => i.premises.includes(factId));
  }

  /**
   * 에이전트별 추론 조회
   */
  findInferencesByAgent(agentId: AgentId): Inference[] {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    return knowledge.inferences.filter(i => i.derivedBy === agentId);
  }

  /**
   * 추론 삭제
   */
  removeInference(inferenceId: string): void {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    const updatedInferences = knowledge.inferences.filter(i => i.id !== inferenceId);

    if (updatedInferences.length === knowledge.inferences.length) {
      throw new BlackboardError(
        BlackboardErrorCode.INFERENCE_NOT_FOUND,
        `Inference ${inferenceId} not found`
      );
    }

    this.board.write('knowledge.inferences', updatedInferences);
  }

  /**
   * 추론 수 조회
   */
  getInferenceCount(): number {
    return this.board.read<KnowledgeSection>('knowledge').inferences.length;
  }

  // === 패턴 관리 ===

  /**
   * 패턴 추가/업데이트
   */
  upsertPattern(patternInput: PatternCreateInput): Pattern {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    const now = new Date();

    // 기존 패턴 확인 (같은 이름의 패턴)
    const existingPattern = knowledge.patterns.find(
      p => p.name === patternInput.name
    );

    if (existingPattern) {
      // 업데이트
      const updatedPattern: Pattern = {
        ...existingPattern,
        description: patternInput.description,
        discoveredBy: patternInput.discoveredBy,
        updatedAt: now,
      };

      const updatedPatterns = knowledge.patterns.map(p =>
        p.id === existingPattern.id ? updatedPattern : p
      );

      this.board.write('knowledge.patterns', updatedPatterns);
      return updatedPattern;
    }

    // 새 패턴 생성
    const pattern: Pattern = {
      id: `pattern-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      name: patternInput.name,
      description: patternInput.description,
      discoveredBy: patternInput.discoveredBy,
      usageCount: patternInput.usageCount ?? 0,
      successRate: patternInput.successRate ?? 0,
      createdAt: now,
      updatedAt: now,
    };

    const updatedPatterns = [...knowledge.patterns, pattern];
    this.board.write('knowledge.patterns', updatedPatterns);

    return pattern;
  }

  /**
   * 패턴 사용 기록
   */
  recordPatternUsage(patternId: string, success: boolean): void {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    const pattern = knowledge.patterns.find(p => p.id === patternId);

    if (!pattern) {
      throw new BlackboardError(
        BlackboardErrorCode.PATTERN_NOT_FOUND,
        `Pattern ${patternId} not found`
      );
    }

    const newUsageCount = pattern.usageCount + 1;
    const newSuccessRate = (pattern.successRate * pattern.usageCount + (success ? 1 : 0)) / newUsageCount;

    const updatedPattern: Pattern = {
      ...pattern,
      usageCount: newUsageCount,
      successRate: newSuccessRate,
      updatedAt: new Date(),
    };

    const updatedPatterns = knowledge.patterns.map(p =>
      p.id === patternId ? updatedPattern : p
    );

    this.board.write('knowledge.patterns', updatedPatterns);
  }

  /**
   * 패턴 조회
   */
  getPattern(patternId: string): Pattern | undefined {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    return knowledge.patterns.find(p => p.id === patternId);
  }

  /**
   * 에이전트가 발견한 패턴 조회
   */
  findPatternsByAgent(agentId: AgentId): Pattern[] {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    return knowledge.patterns.filter(p => p.discoveredBy === agentId);
  }

  /**
   * 패턴 삭제
   */
  removePattern(patternId: string): void {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    const updatedPatterns = knowledge.patterns.filter(p => p.id !== patternId);

    if (updatedPatterns.length === knowledge.patterns.length) {
      throw new BlackboardError(
        BlackboardErrorCode.PATTERN_NOT_FOUND,
        `Pattern ${patternId} not found`
      );
    }

    this.board.write('knowledge.patterns', updatedPatterns);
  }

  /**
   * 패턴 수 조회
   */
  getPatternCount(): number {
    return this.board.read<KnowledgeSection>('knowledge').patterns.length;
  }

  // === 통계 ===

  /**
   * 지식 섹션 통계
   */
  getStats(): {
    facts: number;
    inferences: number;
    patterns: number;
    expiredFacts: number;
  } {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    const now = new Date();

    const expiredFacts = knowledge.facts.filter(
      f => f.expiresAt && f.expiresAt < now
    ).length;

    return {
      facts: knowledge.facts.length,
      inferences: knowledge.inferences.length,
      patterns: knowledge.patterns.length,
      expiredFacts,
    };
  }
}
