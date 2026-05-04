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
  InferenceQuery,
  PatternQuery,
} from '../../types';
import type { AgentId } from '../../types';
import { BlackboardError, BlackboardErrorCode } from '../errors';

/**
 * 지식 섹션 접근자
 * @description knowledge 섹션에 대한 타입 안전한 접근 제공
 */
export class KnowledgeSectionAccessor {
  constructor(private readonly board: Blackboard) {}

  // === 헬퍼 메서드 ===

  /**
   * confidence 값 검증
   * @private
   */
  private validateConfidence(value: number | undefined, fieldName = 'confidence'): void {
    if (value !== undefined) {
      if (typeof value !== 'number' || value < 0 || value > 1 || Number.isNaN(value)) {
        throw new BlackboardError(
          BlackboardErrorCode.INVALID_INPUT,
          `${fieldName} must be a number between 0 and 1`
        );
      }
    }
  }

  // === Getters ===

  /**
   * 전체 사실 목록
   */
  get facts(): Fact[] {
    return this.board.read<KnowledgeSection>('knowledge').facts;
  }

  /**
   * 전체 추론 목록
   */
  get inferences(): Inference[] {
    return this.board.read<KnowledgeSection>('knowledge').inferences;
  }

  /**
   * 전체 패턴 목록
   */
  get patterns(): Pattern[] {
    return this.board.read<KnowledgeSection>('knowledge').patterns;
  }

  /**
   * 사실 수
   */
  get factCount(): number {
    return this.board.read<KnowledgeSection>('knowledge').facts.length;
  }

  /**
   * 추론 수
   */
  get inferenceCount(): number {
    return this.board.read<KnowledgeSection>('knowledge').inferences.length;
  }

  /**
   * 패턴 수
   */
  get patternCount(): number {
    return this.board.read<KnowledgeSection>('knowledge').patterns.length;
  }

  // === 사실 관리 ===

  /**
   * 사실 추가
   * @param factInput - 새 사실 입력
   */
  addFact(factInput: FactCreateInput): Fact {
    // 필수 필드 검증
    if (!factInput.content || factInput.content.trim().length === 0) {
      throw new BlackboardError(
        BlackboardErrorCode.INVALID_INPUT,
        'Fact content is required'
      );
    }
    if (!factInput.source) {
      throw new BlackboardError(
        BlackboardErrorCode.INVALID_INPUT,
        'Fact source is required'
      );
    }
    if (!factInput.category || factInput.category.trim().length === 0) {
      throw new BlackboardError(
        BlackboardErrorCode.INVALID_INPUT,
        'Fact category is required'
      );
    }
    this.validateConfidence(factInput.confidence, 'Fact confidence');

    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    const now = new Date();

    const fact: Fact = {
      id: `fact-${crypto.randomUUID()}`,
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
   * 사실 업데이트
   */
  updateFact(factId: string, updates: Partial<Omit<Fact, 'id' | 'createdAt'>>): Fact | undefined {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    const factIndex = knowledge.facts.findIndex(f => f.id === factId);

    if (factIndex === -1) {
      return undefined;
    }

    const existingFact = knowledge.facts[factIndex];
    const updatedFact: Fact = {
      ...existingFact,
      ...updates,
      id: existingFact.id,
      createdAt: existingFact.createdAt,
      updatedAt: new Date(),
    };

    const updatedFacts = [...knowledge.facts];
    updatedFacts[factIndex] = updatedFact;
    this.board.write('knowledge.facts', updatedFacts);

    return updatedFact;
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
      if (query.minConfidence !== undefined) {
        if (fact.confidence === undefined || fact.confidence < query.minConfidence) {
          return false;
        }
      }

      // 단일 태그 필터
      if (query.tag !== undefined && !fact.tags.includes(query.tag)) {
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
   * 사실 수 조회 (deprecated: factCount getter 사용)
   */
  getFactCount(): number {
    return this.factCount;
  }

  // === 추론 관리 ===

  /**
   * 추론 추가
   */
  addInference(inferenceInput: InferenceCreateInput): Inference {
    // 필수 필드 검증
    if (!inferenceInput.conclusion || inferenceInput.conclusion.trim().length === 0) {
      throw new BlackboardError(
        BlackboardErrorCode.INVALID_INPUT,
        'Inference conclusion is required'
      );
    }
    if (!inferenceInput.source) {
      throw new BlackboardError(
        BlackboardErrorCode.INVALID_INPUT,
        'Inference source is required'
      );
    }
    if (!Array.isArray(inferenceInput.premises)) {
      throw new BlackboardError(
        BlackboardErrorCode.INVALID_INPUT,
        'Inference premises must be an array'
      );
    }
    this.validateConfidence(inferenceInput.confidence, 'Inference confidence');

    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    const now = new Date();

    const inference: Inference = {
      id: `inference-${crypto.randomUUID()}`,
      conclusion: inferenceInput.conclusion,
      premises: inferenceInput.premises,
      source: inferenceInput.source,
      method: inferenceInput.method,
      confidence: inferenceInput.confidence,
      tags: inferenceInput.tags || [],
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
   * 추론 업데이트
   */
  updateInference(
    inferenceId: string,
    updates: Partial<Omit<Inference, 'id' | 'createdAt'>>
  ): Inference | undefined {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    const inferenceIndex = knowledge.inferences.findIndex(i => i.id === inferenceId);

    if (inferenceIndex === -1) {
      return undefined;
    }

    const existingInference = knowledge.inferences[inferenceIndex];
    const updatedInference: Inference = {
      ...existingInference,
      ...updates,
      id: existingInference.id,
      createdAt: existingInference.createdAt,
      updatedAt: new Date(),
    };

    const updatedInferences = [...knowledge.inferences];
    updatedInferences[inferenceIndex] = updatedInference;
    this.board.write('knowledge.inferences', updatedInferences);

    return updatedInference;
  }

  /**
   * 추론 검색
   */
  findInferences(query: InferenceQuery): Inference[] {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');

    return knowledge.inferences.filter(inference => {
      // 출처 필터
      if (query.source !== undefined && inference.source !== query.source) {
        return false;
      }

      // 전제 필터 (모든 전제 포함)
      if (query.premises && query.premises.length > 0) {
        const hasAllPremises = query.premises.every(p => inference.premises.includes(p));
        if (!hasAllPremises) {
          return false;
        }
      }

      // 최소 신뢰도 필터
      if (query.minConfidence !== undefined) {
        if (inference.confidence === undefined || inference.confidence < query.minConfidence) {
          return false;
        }
      }

      return true;
    });
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
    return knowledge.inferences.filter(i => i.source === agentId);
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
   * 추론 수 조회 (deprecated: inferenceCount getter 사용)
   */
  getInferenceCount(): number {
    return this.inferenceCount;
  }

  // === 패턴 관리 ===

  /**
   * 패턴 추가
   */
  addPattern(patternInput: PatternCreateInput): Pattern {
    // 필수 필드 검증
    if (!patternInput.name || patternInput.name.trim().length === 0) {
      throw new BlackboardError(
        BlackboardErrorCode.INVALID_INPUT,
        'Pattern name is required'
      );
    }
    if (!patternInput.description || patternInput.description.trim().length === 0) {
      throw new BlackboardError(
        BlackboardErrorCode.INVALID_INPUT,
        'Pattern description is required'
      );
    }
    if (!Array.isArray(patternInput.conditions)) {
      throw new BlackboardError(
        BlackboardErrorCode.INVALID_INPUT,
        'Pattern conditions must be an array'
      );
    }
    if (!Array.isArray(patternInput.consequences)) {
      throw new BlackboardError(
        BlackboardErrorCode.INVALID_INPUT,
        'Pattern consequences must be an array'
      );
    }
    this.validateConfidence(patternInput.confidence, 'Pattern confidence');

    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    const now = new Date();

    const pattern: Pattern = {
      id: `pattern-${crypto.randomUUID()}`,
      name: patternInput.name,
      description: patternInput.description,
      conditions: patternInput.conditions,
      consequences: patternInput.consequences,
      confidence: patternInput.confidence,
      tags: patternInput.tags || [],
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
        conditions: patternInput.conditions,
        consequences: patternInput.consequences,
        confidence: patternInput.confidence,
        tags: patternInput.tags || existingPattern.tags,
        discoveredBy: patternInput.discoveredBy ?? existingPattern.discoveredBy,
        updatedAt: now,
      };

      const updatedPatterns = knowledge.patterns.map(p =>
        p.id === existingPattern.id ? updatedPattern : p
      );

      this.board.write('knowledge.patterns', updatedPatterns);
      return updatedPattern;
    }

    // 새 패턴 생성
    return this.addPattern(patternInput);
  }

  /**
   * 패턴 조회
   */
  getPattern(patternId: string): Pattern | undefined {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    return knowledge.patterns.find(p => p.id === patternId);
  }

  /**
   * 패턴 업데이트
   */
  updatePattern(
    patternId: string,
    updates: Partial<Omit<Pattern, 'id' | 'createdAt'>>
  ): Pattern | undefined {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    const patternIndex = knowledge.patterns.findIndex(p => p.id === patternId);

    if (patternIndex === -1) {
      return undefined;
    }

    const existingPattern = knowledge.patterns[patternIndex];
    const updatedPattern: Pattern = {
      ...existingPattern,
      ...updates,
      id: existingPattern.id,
      createdAt: existingPattern.createdAt,
      updatedAt: new Date(),
    };

    const updatedPatterns = [...knowledge.patterns];
    updatedPatterns[patternIndex] = updatedPattern;
    this.board.write('knowledge.patterns', updatedPatterns);

    return updatedPattern;
  }

  /**
   * 패턴 검색
   */
  findPatterns(query: PatternQuery): Pattern[] {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');

    return knowledge.patterns.filter(pattern => {
      // 태그 필터
      if (query.tag !== undefined && !pattern.tags.includes(query.tag)) {
        return false;
      }

      // 최소 신뢰도 필터
      if (query.minConfidence !== undefined) {
        if (pattern.confidence === undefined || pattern.confidence < query.minConfidence) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * 에이전트가 발견한 패턴 조회
   */
  findPatternsByAgent(agentId: AgentId): Pattern[] {
    const knowledge = this.board.read<KnowledgeSection>('knowledge');
    return knowledge.patterns.filter(p => p.discoveredBy === agentId);
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

    const currentUsageCount = pattern.usageCount ?? 0;
    const currentSuccessRate = pattern.successRate ?? 0;
    const newUsageCount = currentUsageCount + 1;
    const newSuccessRate = (currentSuccessRate * currentUsageCount + (success ? 1 : 0)) / newUsageCount;

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
   * 패턴 수 조회 (deprecated: patternCount getter 사용)
   */
  getPatternCount(): number {
    return this.patternCount;
  }

  // === 전체 관리 ===

  /**
   * 모든 지식 초기화
   */
  clearAll(): void {
    this.board.write('knowledge.facts', []);
    this.board.write('knowledge.inferences', []);
    this.board.write('knowledge.patterns', []);
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
