# TASK-041: Blackboard-first E2E 시나리오 정비

## 개요
- **상태**: ✅ 완료
- 우선순위: P1
- 예상 소요: 6시간
- 담당: 개발자
- **분류**: 유지 (범위 조정)

## 유지 판단
E2E 검증 자체는 즉시 필요하며 blackboard-first 기준에도 직접 적용 가능합니다. 다만 대상 시스템을 `packages/board` 단독이 아닌 **blackboard workflow 중심**으로 수정합니다.

## 목표
agenda → voting → consensus → workflow 상태전이의 통합 흐름을 blackboard 기준으로 검증합니다.

## 구현 범위 (수정)

### 1) 경로 재정의
- 기존: `packages/board/test/e2e/*`
- 변경: `packages/blackboard/test/e2e/*`

### 2) 테스트 축 재정의
- 정상 흐름: agenda 생성→투표→합의→resolved
- 실패 흐름: 정족수 미달, 동률, 조건 미충족
- 시간 흐름: discussion/voting timeout
- 복구 흐름: snapshot restore 후 재개

### 3) 완료 기준
- [x] blackboard 중심 E2E 시나리오 4종 이상 통과
- [x] board-specific 이벤트명 의존 제거
- [x] workflow 전이 로그 검증 포함
- [x] CI에서 안정적으로 재실행 가능

## 의존성
- 선행: TASK-036, TASK-037, TASK-038, TASK-039
- 참고: TASK-040(보류)와 독립적으로 수행 가능

## SSOT / 참고
- [[../architecture/blackboard-actor-design|Blackboard + Actor 아키텍처]]

## 용어 정리
- `Board E2E` → `Blackboard workflow E2E`

## 야간 실행 점검 로그
- 2026-02-13 12:12 (KST)
  - 실행: `pnpm --filter @obora-kit/blackboard test -- test/e2e`
  - 결과: `test/e2e/workflow-e2e.test.ts` 5/5 통과
  - 판정: blackboard-first E2E 기준 유지 (이상 없음)
