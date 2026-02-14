No tools. Use provided TASK doc context only.
Output exact lines: SCORE:, P0:, P1:, Completion decision:
# TASK-042: TKG + Observer/Reflector 조건부 적용 (Phased Rollout)

## 개요
- **상태**: 🟡 조건부완료
- **우선순위**: P1
- **예상 소요**: 12시간 (MVP 8h + 후속 4h)
- **담당**: 개발자
- **의존성(선행 필수)**: TASK-020, TASK-022, TASK-023
- **의존성(권장)**: TASK-018, TASK-019

## 목표
Blackboard 메모리를 Temporal Knowledge Graph(TKG)로 확장하되, 한 번에 전부 구현하지 않고 **실행 가능한 3단계**로 분할합니다.

- 042a: 타입/인터페이스 정렬 (MVP)
- 042b: Observer/Reflector MVP (MVP)
- 042c: Conflict/Guardrail 고도화 (후속)

핵심은 아래 3가지를 문서 SSOT로 고정하는 것입니다.
1. MVP/후속 경계 명확화
2. 선행 의존성 현실화 (EventBus/패키지/테스트 우선)
3. 인터페이스 계약 충돌 해소 (Production readonly + 승격 API)

---

## 분할 실행안 (하위 태스크)

## 042a — 타입/인터페이스(MVP)
- 문서: [TASK-042a: TKG 타입/인터페이스 MVP](./TASK-042a-tkg-types-interface-mvp.md)
- 범위
  - `types/tkg.ts` 최소 타입 집합
  - `core/tkg.ts` 공통 조회 인터페이스
  - Production readonly 계약 + Promotion Port 계약 정의
  - 기존 knowledge API와의 최소 호환 레이어(타입 수준)
- 산출물
  - 컴파일 가능한 타입/인터페이스
  - 구현 전 계약(Contract) 확정

## 042b — Observer/Reflector MVP
- 문서: [TASK-042b: Observer/Reflector MVP](./TASK-042b-observer-reflector-mvp.md)
- 범위
  - Observer: 이벤트→Staging 기록
  - Reflector: Staging→Production 승격 (Promotion API 경유)
  - 최소 Guardrail(임계치) + 기본 이벤트 발행
  - 기본 통합 테스트(핵심 플로우 1개)
- 산출물
  - “관찰→승격→조회” MVP 동작

## 042c — Conflict/Guardrail/고도화
- 문서: [TASK-042c: conflict-guardrail-advanced](./TASK-042c-conflict-guardrail-advanced.md)
- 범위
  - 충돌 감지/해결 정책
  - 고급 Guardrail, 자동 규칙
  - 롤백/배치 승격/관측성 확장
- 산출물
  - 운영 안정성 기능

---

## MVP vs 후속 범위 (완료 기준 재작성)

### ✅ 필수(MVP, 042a+042b)
- [x] `TemporalNode`, `TemporalEdge`, `GraphQuery`, `QueryResult` 타입 확정
- [x] `StagingTKG`(write 가능), `ProductionTKG`(read only) 인터페이스 확정
- [x] **`IProductionPromotionPort`(또는 동등 명칭) 추가**
  - [x] `promoteNode`, `promoteEdge`, `promoteBatch` 제공
  - [x] Reflector는 `production.nodes.set(...)` 직접 접근 금지
- [x] Observer 기본 구현
  - [x] Blackboard 이벤트를 Staging 노드로 변환
  - [x] Staging 임계치 검증(최소 1개 룰)
- [x] Reflector MVP 구현
  - [x] Staging에서 승격 후보 추출
  - [x] Promotion Port로만 Production 반영
  - [x] 승격 성공/실패 이벤트 발행
- [x] 통합 테스트 1개 이상
  - [x] `observe -> staging -> reflect -> production query` 흐름 검증
- [x] 문서 링크/의존성/계약 불일치 0건

### ⏭️ 후속(고도화, 042c)
- [ ] Conflict 유형 세분화 + 자동 해결 규칙
- [ ] 롤백/재시도/배치 전략
- [ ] 고급 Guardrail(문맥 기반, 히스토리 기반)
- [ ] 성능 최적화(인덱스/캐시)
- [ ] 상세 운영 메트릭/알람

---

## 의존성 정리 (현실 선행조건)

### 선행 필수
1. **TASK-020 Event Bus**: Observer/Reflector 이벤트 계약 기반
2. **TASK-022 Package 구성**: 모듈 경계/exports 정리 필요
3. **TASK-023 Tests**: MVP 통합 테스트 기반

### 선행 권장
4. **TASK-018 Schema**: 기본 타입 일관성 확보
5. **TASK-019 Core**: blackboard 섹션 접근 패턴 재사용

> 기존 문서의 `TASK-018, 019, 022`만으로는 테스트/이벤트 선행조건이 불충분하므로, **020/023을 필수로 승격**합니다.

---

## 인터페이스 계약 충돌 해소 (SSOT 반영)

기존 충돌:
- Production은 readonly여야 하나,
- Reflector 예시 코드에서 `target.nodes.set(...)` 직접 쓰기 수행

해결 원칙:
1. `ProductionTKG`는 모든 소비자에게 readonly 뷰만 제공
2. Reflector의 쓰기는 `IProductionPromotionPort`로만 수행
3. 승격 시 버전/유효기간/신뢰도 검증은 Promotion Port에서 원자적으로 수행

### 권장 계약(요약)
```ts
export interface ProductionTKG extends TemporalKnowledgeGraph {
  readonly nodes: ReadonlyMap<NodeId, TemporalNode>;
  readonly edges: ReadonlyMap<EdgeId, TemporalEdge>;
  getValidNodes(at?: Date): TemporalNode[];
  getValidEdges(at?: Date): TemporalEdge[];
}

export interface IProductionPromotionPort {
  promoteNode(node: TemporalNode, meta?: PromotionMeta): PromotionResult;
  promoteEdge(edge: TemporalEdge, meta?: PromotionMeta): PromotionResult;
  promoteBatch(payload: {
    nodes: TemporalNode[];
    edges: TemporalEdge[];
    meta?: PromotionMeta;
  }): MergeResult;
}
```

---

## 즉시 착수 순서 (실행 플랜)
1. 042a 시작: 타입/인터페이스 + Promotion Port 계약 확정
2. 042b 시작: Observer/Reflector MVP 구현
3. MVP 테스트 통과 후 042c로 확장

---

## 관련 문서 (SSOT 링크)
- [Blackboard 시스템 스펙](../../spec/12-blackboard.md)
- [TASK-020: Event Bus](./TASK-020-event-bus.md)
- [TASK-022: Blackboard Package](./TASK-022-blackboard-package.md)
- [TASK-023: Blackboard Tests](./TASK-023-blackboard-tests.md)
- [Blackboard + Actor 설계](../../architecture/blackboard-actor-design.md)

---

*문서 버전: 2.0*  
*수정일: 2026-02-13*  
*변경 요약: TASK-042를 042a/042b/042c로 분할, MVP 게이트 및 승격 API 계약 명문화*

## 재동기화 근거 (2026-02-13)
- 코드 변경: 상위 TASK 분할 하위 구현(042a/042b/042c) 반영, MVP 플로우 구현(`ace01da`)
- 테스트: `pnpm --filter @obora-kit/blackboard test` 통과 (518/518, 2026-02-13)
- 2모델 리뷰: 042a는 `/tmp/review-glm-042a-result.md`, `/tmp/review-codex-042a-result.md` 확인되나 042 전체 롤업 게이트 증빙은 미완
- 커밋: `ace01da`, `d8707c3`

## 2모델 게이트 재실행 (2026-02-13)
- 증빙 파일:
  - GLM: `/tmp/review-rerun-20260213/result-TASK-042-glm.md`
  - Codex: `/tmp/review-rerun-20260213/result-TASK-042-codex.md`
- 결과:
  - GLM: N/A, P0=0, P1=1(상위 롤업 증빙 불완), Gate FAIL
  - Codex: 8.7/10, P0=0, P1=1(상위 롤업 증빙 불완), Gate FAIL
- 판정: **🟡 조건부완료 유지**

## 3모델 재실행 (2026-02-13 14:57 KST)
- 하위(042b/042c) 테스트 강화 반영 후 롤업 재평가
- 테스트: tkg observer/reflector 5/5, board 5/5, agenda 8/8, agents 281/281
- Opus 4.6: 9.2/10 (PASS)
- Codex 5.3: 9.2/10 (PASS)
- GLM 5: opencode 안정 템플릿(pty+timeout+retry) 재시도했으나 출력 미완료(게이트 증빙 미확정)
- 판정: **🟡 조건부완료 유지** (잔여: GLM 9+ 점수 증빙)

## 3모델 재리뷰 재실행 (2026-02-13 17:00 KST)
- Opus 4.6: 8.7/10, P0=0, P1=1 (FAIL)
- Codex 5.3: 8.8/10, P0=0, P1=1 (FAIL)
- GLM 5: 출력 완결성 실패(점수/P0/P1 미제공, 재시도 1회 동일 실패)
- 판정: **🟡 조건부완료 유지**
- 미충족 원인: 상위 롤업 9.0 미달(Opus/Codex), GLM 완결 증빙 미확보
- 액션: 042b/042c 게이트 선해결 + 상위 롤업 재리뷰 증빙 확정

## 워크플로우 재실행 로그 (2026-02-13 18:09 KST)
- 최소 수정: 상위 문서 MVP 체크리스트를 실제 구현 상태로 동기화([x])
- 테스트: `pnpm --filter @obora-kit/blackboard test -- test/domains/tkg/observer-reflector.test.ts` (5/5 pass), 전체 blackboard/board 회귀 통과
- 3모델 리뷰: 하위 태스크와 동일하게 OpenCode 재실행이 파일 읽기 후 종료 미완료로 반복되어 롤업 점수 확정 실패
- 판정: 🟡 조건부완료 유지 (잔여: 042b/042c/042 3모델 완결 증빙)

