# Queue 대응: TASK-036~041 blackboard-first 재기준화

## 목적
Board 단계 태스크를 blackboard 우선 구현 순서로 재배치하고, 실행 대기열에서 혼선을 줄이기 위한 대응 메모.

## 분류 결과
- TASK-036: 재정의 필요
- TASK-037: 재정의 필요
- TASK-038: 재정의 필요
- TASK-039: 재정의 필요
- TASK-040: 보류
- TASK-041: 유지(범위 조정)

## 실행 우선순위 (권장)
1. TASK-036 (agenda domain)
2. TASK-037 (voting domain)
3. TASK-038 (consensus rule engine)
4. TASK-039 (workflow state machine)
5. TASK-041 (blackboard E2E)
6. TASK-040 (board facade scaffolding, 후속)

## 큐 운영 메모
- queue 등록 시 `packages/board` 직접 구현 요청은 보류 처리
- `packages/blackboard` 경로 우선 태깅
- board 관련 신규 요청은 facade 범위인지 선확인

## 야간 자동 점검 로그 (2026-02-14 23:27 KST)
- 기준 브랜치: `origin/main` (`661cb43`)
- 작업 브랜치(HEAD 유지): `main` (`661cb43`)
- 점검 단위: blackboard-first 완료 구간(TASK-036~041) 회귀 최소검증 1건
- 실행: `pnpm --filter @obora-kit/blackboard test -- test/domains/agenda/agenda-store.test.ts`
- 결과: ✅ `1 file / 12 tests passed`
- 판정: 블로커 없음, 다음 실행은 보류 태스크(TASK-040) 착수 조건 점검 권장
