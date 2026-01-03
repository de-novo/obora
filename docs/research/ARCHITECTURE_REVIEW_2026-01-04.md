# Obora Architecture Review (2026-01-04)

**평가 방법**: DebatePattern (Claude vs OpenAI, Strong Mode)  
**평가 등급**: C+ → 조건부 승인 (Critical Gaps 존재)

---

## Executive Summary

새로운 Pattern 기반 아키텍처는 **방향은 올바르나 기반 프로토콜이 부족**합니다.

| 영역 | 초기 평가 | 수정 평가 | 이유 |
|------|---------|---------|------|
| 확장성 | A | B- | 패턴 조합 시 이벤트 계층화 미정의 |
| 레거시 제거 | B | C | 847라인 내 암묵적 품질 규칙 존재 가능 |
| ChatModel 추상화 | A | B | Capability negotiation 부재 |
| 스트리밍 | B+ | C+ | 취소/에러 귀속 프로토콜 미정의 |
| Skill 보안 | - | D | 격리/권한 모델 부재 |

---

## 1. 확장성 문제: 패턴 조합 프로토콜

### 현재 문제
```typescript
// 이 코드는 프로덕션에서 실패할 것
const ensemble = new EnsemblePattern({
  patterns: [
    new DebatePattern({ rounds: 3 }),
    new CrossCheckPattern({ checks: 5 }),
  ]
});

// 이벤트 스트림이 뒤섞임:
// debate.round.1.start, cross.check.1.start, debate.round.1.agent.1...
// ❌ traceId, spanId 없어서 계층 복원 불가
```

### 필요한 수정
```typescript
interface PatternEvent {
  type: string;
  traceId: string;        // 패턴 간 상관관계
  spanId: string;         // 이벤트 계층
  parentSpanId?: string;  // 중첩 관계
  patternPath: string[];  // ["EnsemblePattern", "DebatePattern", "round-2"]
  timestamp: number;
  payload: unknown;
}
```

---

## 2. 레거시 DebateEngine 마이그레이션

### 위험 요소
847라인에 숨겨진 **암묵적 품질 규칙**:

| 규칙 유형 | 예시 | 테스트로 발견? |
|----------|------|--------------|
| 온도 설정 | Judge는 temperature=0.3 | ❌ |
| 모델별 포맷 | Claude는 XML 래핑 필요 | ❌ |
| 재시도 정책 | 타임아웃 시 해당 라운드만 재시도 | △ |
| 프롬프트 최적화 | 특정 문구가 품질 향상 | ❌ |

### 필수 선행 작업

1. **조건문 추출**
   ```bash
   rg "if.*provider|if.*model|if.*timeout|if.*temperature" \
      packages/core/src/engine/DebateEngine.ts
   ```

2. **암묵 규칙 문서화**
   ```
   docs/migration/legacy-quality-rules.md
   ```

3. **품질 회귀 테스트**
   ```typescript
   test('judge coherence matches legacy ±5%', async () => {
     const legacyScores = goldenDataset.map(d => 
       scoreJudgeCoherence(await legacyEngine.run(d))
     );
     const patternScores = goldenDataset.map(d => 
       scoreJudgeCoherence(await newPattern.run(d).result)
     );
     expect(mean(patternScores)).toBeCloseTo(mean(legacyScores), 0.05);
   });
   ```

---

## 3. ChatModel Capability Negotiation

### 현재 문제
```typescript
// 사용자가 로컬 모델 사용 시도
const localModel = new OllamaAdapter("llama3.1");

// DebatePattern이 structured output 가정
const pattern = new DebatePattern({
  model: localModel,
  judgeSchema: z.object({ winner: z.enum(['A', 'B']) })
  // ❌ Ollama는 schema-constrained generation 미지원!
});
```

### 필요한 수정
```typescript
interface ChatModelCapabilities {
  structuredOutput: boolean;
  toolCalling: boolean;
  streaming: 'token' | 'sentence' | 'none';
  maxContextWindow: number;
  supportsSystemMessages: boolean;
  promptCaching?: boolean;
}

interface ChatModel {
  readonly capabilities: ChatModelCapabilities;
  call(messages: Message[], options?: CallOptions): RunHandle;
}
```

---

## 4. 스트리밍 프로토콜

### 미정의 영역

| 질문 | 현재 상태 |
|------|---------|
| 병렬 LLM 호출 시 이벤트 순서? | 미정의 |
| 취소 시 하위 호출 즉시 중단? | 미정의 |
| 에러 발생 시 어떤 모델/라운드인지? | 미정의 |
| 이벤트로 replay 가능? | 불가 |

### 필요한 명세
```typescript
interface StreamingProtocol {
  // 순서 보장
  eventOrdering: 'causal' | 'arrival' | 'undefined';
  
  // 취소 전파
  cancellationPropagation: 'immediate' | 'graceful' | 'best-effort';
  
  // 에러 귀속
  errorAttribution: {
    modelId: string;
    roundIndex: number;
    promptHash: string;
  };
}
```

---

## 5. Skill 보안 모델

### 현재 위험

| 취약점 | 설명 | 심각도 |
|--------|------|--------|
| 프롬프트 인젝션 | 악성 스킬이 시스템 프롬프트 덮어쓰기 | Critical |
| 권한 상승 | 스킬이 도구 권한 획득 | High |
| 공급망 공격 | 외부 스킬 패키지 변조 | High |
| 코드 실행 | frontmatter 파싱 시 RCE | Critical |

### 필요한 설계
```typescript
interface SkillSecurityModel {
  // 스킬 검증
  signing: {
    required: boolean;
    trustedKeys: string[];
  };
  
  // 권한 모델
  permissions: {
    allowedTools: string[];
    maxTokenBudget: number;
    networkAccess: boolean;
  };
  
  // 격리
  isolation: 'process' | 'container' | 'none';
  
  // 감사
  audit: {
    logSkillLoads: boolean;
    logToolInvocations: boolean;
  };
}
```

---

## 6. 권장 Action Items

### 🔴 Critical (1주 내)

1. **PatternEvent에 traceId/spanId 추가**
2. **ChatModelCapabilities 인터페이스 정의**
3. **DebateEngine 조건문 추출 및 문서화**

### 🟡 Important (2주 내)

4. **스트리밍 프로토콜 명세 작성**
5. **품질 회귀 테스트 구축**
6. **Skill 권한 모델 설계**

### 🟢 Nice-to-have (1개월 내)

7. **패턴 조합 예제 및 가이드**
8. **마이그레이션 CLI 도구**
9. **A/B 테스트 프레임워크**

---

## 7. 마이그레이션 체크리스트

```
레거시 DebateEngine 제거 전 필수 조건:

[ ] 암묵 규칙 문서화 완료
[ ] 품질 회귀 테스트 통과
[ ] 성능 벤치마크 ±10% 이내
[ ] 스트리밍 이벤트 호환성 확인
[ ] 에러 핸들링 동등성 확인
[ ] 프로덕션 A/B 테스트 완료
[ ] 롤백 계획 수립
[ ] 사용자 마이그레이션 가이드 작성
```

---

## 결론

새 아키텍처는 **올바른 방향**이지만, 현재 상태로 레거시 제거는 **위험**합니다.

**권장 순서**:
1. 프로토콜/명세 정의 (이벤트, capability, 보안)
2. 포렌식 마이그레이션 (암묵 규칙 추출)
3. 품질 검증 (회귀 테스트, A/B)
4. 점진적 전환 (deprecated shim)
5. 최종 제거 (v2.0.0)

---

*Generated by DebatePattern E2E (Claude vs OpenAI, Strong Mode)*  
*Duration: ~200s | Rounds: 7 | Position Changes: 1*
