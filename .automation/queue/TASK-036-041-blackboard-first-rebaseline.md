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
