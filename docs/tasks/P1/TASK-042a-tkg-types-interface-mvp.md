# TASK-042a: TKG 타입/인터페이스 MVP

## 개요
- **상태**: ✅ 완료
- **우선순위**: P1
- **예상 소요**: 3시간
- **담당**: 개발자
- **의존성**: TASK-018, TASK-019, TASK-022

## 목표
TKG 도입의 구현 리스크를 줄이기 위해, 먼저 타입/인터페이스 계약을 확정합니다.

## 작업 범위
1. `src/types/tkg.ts`
   - `TemporalNode`, `TemporalEdge`, `GraphQuery`, `QueryResult`
   - `MergeResult`, `PromotionResult`, `ValidationResult` 최소형
2. `src/core/tkg.ts`
   - `TemporalKnowledgeGraph`, `StagingTKG`, `ProductionTKG`
3. `IProductionPromotionPort` 정의
   - Reflector가 Production에 직접 쓰지 않고 승격 API를 사용하도록 계약 고정

## 완료 기준 (MVP)
- [x] `tsc --noEmit` 기준 타입 오류 없음
- [x] Production readonly 계약 명시 (`ReadonlyMap`)
- [x] Promotion Port 인터페이스 확정
- [x] spec/12와 용어 충돌 없음

## 산출물
- `packages/blackboard/src/types/tkg.ts`
  - `TemporalNode`, `TemporalEdge`, `GraphQuery`, `QueryResult`
  - `MergeResult`, `PromotionResult`, `ValidationResult`
  - `IProductionPromotionPort` 계약 확정
- `packages/blackboard/src/core/tkg.ts`
  - `TemporalKnowledgeGraph`, `StagingTKG`, `ProductionTKG`
  - `IReflector` 시그니처에 `options?: ReflectionOptions` 반영
- export 연결
  - `packages/blackboard/src/types/index.ts`
  - `packages/blackboard/src/core/index.ts`
  - `packages/blackboard/src/index.ts`
- 타입체크 복구(선행 블로커 해소)
  - `packages/blackboard/src/snapshot/serializer.ts`
  - `packages/blackboard/src/snapshot/types.ts`

## 실행/검증 기록
- 선행조건 점검(TASK-020/022/023):
  - 문서 상태는 대기였으나, 실제 코드 산출물(`events`, `package`, `test`)은 `packages/blackboard`에 준비 완료 확인
- 테스트/타입체크:
  - `pnpm --filter @obora-kit/blackboard typecheck` ✅
  - `pnpm --filter @obora-kit/blackboard test` ✅ (470 passed)
- 2모델 리뷰:
  - Codex 5.3: **9.3/10**, P0/P1 없음, PASS
  - GLM 4.7: **9.5/10**, P0/P1 없음, PASS

## 참고
- [TASK-042 상위 문서](./TASK-042-tkg-observer-reflector.md)
- [Blackboard 시스템 스펙](../../spec/12-blackboard.md)


## 재동기화 근거 (2026-02-13)
- 코드 변경: `packages/blackboard/src/domains/tkg/*` 타입/포트 계약 반영
- 테스트: `pnpm --filter @obora-kit/blackboard test` 통과 (518/518, 2026-02-13)
- 2모델 리뷰: `/tmp/review-glm-042a-result.md`, `/tmp/review-codex-042a-result.md`에서 9점대 결과 확인
- 커밋: `d8707c3`

