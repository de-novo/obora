# TASK-041: Blackboard-first E2E 시나리오 정비

## 개요
- **상태**: 📋 대기
- 우선순위: P1
- 예상 소요: 6시간
- 담당: 개발자
- **분류**: 유지 (범위 조정)

## 유지 판단
E2E 검증 자체는 즉시 필요하며 blackboard-first 기준에도 직접 적용 가능합니다. 다만 대상 시스템을 `packages/board` 단독이 아닌 **blackboard workflow 중심**으로 수정합니다.
- 2026-02-13 night check: 선행 태스크(TASK-039) 미완료 상태 확인, 본 태스크는 📋 대기 유지.
- 2026-02-13 18:12 KST 점검: 선행 태스크(TASK-036~039) 완료 상태 및 `packages/blackboard/test/e2e/workflow-e2e.test.ts` 5/5 통과 확인.
- 2026-02-13 19:42 KST 점검: 정상 흐름 케이스에 `MeetingStateMachine.getLogs()` 검증(최소 전이 수 + 마지막 resolving→resolved 전이 이벤트) 추가, 단일 E2E 재실행 5/5 통과.
- 2026-02-13 20:27 KST 점검: `pnpm vitest run packages/blackboard/test/e2e/workflow-e2e.test.ts` 재실행 5/5 통과, 시나리오 5종 유지 및 테스트 파일 내 board-specific 이벤트명 의존 없음 확인.
- 2026-02-13 21:12 KST night cycle 점검: 동일 단일 E2E(`pnpm vitest run packages/blackboard/test/e2e/workflow-e2e.test.ts`) 재검증 5/5 통과 확인.
- 2026-02-13 22:42 KST 점검: 단일 E2E(`pnpm vitest run packages/blackboard/test/e2e/workflow-e2e.test.ts`) 재실행 5/5 통과(435ms), blackboard-first 회귀 기준 유지 확인.
- 2026-02-14 00:57 KST night 점검: 단일 E2E(`pnpm vitest run packages/blackboard/test/e2e/workflow-e2e.test.ts`) 재실행 5/5 통과(437ms), 선행 회귀 결과와 편차 없이 안정 동작 확인.
- 2026-02-14 01:42 KST night 점검: 단일 E2E(`pnpm vitest run packages/blackboard/test/e2e/workflow-e2e.test.ts`) 재실행 5/5 통과(451ms), blackboard-first 회귀 기준(시나리오/이벤트/전이로그) 재확인.
- 2026-02-14 02:27 KST night 점검: 단일 E2E(`pnpm vitest run packages/blackboard/test/e2e/workflow-e2e.test.ts`) 재실행 5/5 통과(439ms), 최근 3회(00:57/01:42/02:27) 연속 통과로 회귀 안정성 유지 확인.
- 2026-02-14 04:42 KST night 점검: E2E 5/5 통과(442ms). CI 워크플로우(.github/workflows/) 미존재 확인 — 마지막 체크박스(CI 안정 재실행)는 CI 인프라 구축 후 완료 가능.
- 2026-02-14 06:57 KST night 점검: 단일 E2E(`pnpm vitest run packages/blackboard/test/e2e/workflow-e2e.test.ts`) 재실행 5/5 통과(총 556ms), 최근 회귀 추세(02:27/04:42/06:57) 기준 안정 상태 유지 확인.
- 2026-02-14 07:42 KST night 점검: 단일 E2E(`pnpm vitest run packages/blackboard/test/e2e/workflow-e2e.test.ts`) 재실행 5/5 통과(총 450ms), CI 미구성 상태 유지로 체크박스(재실행 안정성)는 보류.
- 2026-02-14 09:57 KST night 점검: 단일 E2E(`pnpm vitest run packages/blackboard/test/e2e/workflow-e2e.test.ts`) 재실행 5/5 통과(총 473ms), `.github/workflows` 부재 재확인으로 CI 체크박스는 계속 보류.
- 2026-02-14 10:42 KST cron 점검: 단일 E2E(`pnpm vitest run packages/blackboard/test/e2e/workflow-e2e.test.ts`) 재실행 5/5 통과(총 468ms), blackboard-first 회귀선 유지 및 CI 미구성 상태 지속 확인.
- 2026-02-14 12:12 KST cron 점검: 단일 E2E(`pnpm vitest run packages/blackboard/test/e2e/workflow-e2e.test.ts`) 재실행 5/5 통과(총 423ms), 최근 점검(09:57/10:42/12:12) 연속 통과로 회귀 안정성 유지 확인.
- 2026-02-14 12:12 KST cron 점검: 단일 E2E(`pnpm vitest run packages/blackboard/test/e2e/workflow-e2e.test.ts`) 재실행 5/5 통과(총 490ms), `.github/workflows` 미구성 상태로 CI 체크박스 보류 유지.
- 2026-02-14 13:42 KST cron 점검: 단일 E2E(`pnpm vitest run packages/blackboard/test/e2e/workflow-e2e.test.ts`) 재실행 5/5 통과(총 1.55s), blackboard-first 회귀선 유지 및 CI 미구성으로 마지막 체크박스 보류 유지.
- 2026-02-14 18:12 KST cron 점검: 단일 E2E(`pnpm vitest run packages/blackboard/test/e2e/workflow-e2e.test.ts`) 재실행 5/5 통과(총 427ms), 최근 점검(12:12/13:42/18:12) 연속 통과로 workflow 회귀 안정성 유지 확인.

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
- [ ] CI에서 안정적으로 재실행 가능

## 의존성
- 선행: TASK-036, TASK-037, TASK-038, TASK-039
- 참고: TASK-040(보류)와 독립적으로 수행 가능

## SSOT / 참고
- [[../architecture/blackboard-actor-design|Blackboard + Actor 아키텍처]]

## 용어 정리
- `Board E2E` → `Blackboard workflow E2E`
