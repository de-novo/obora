# TASK-036: Blackboard Agenda Stream 정비

## 개요
- **상태**: 🟡 조건부완료
- 우선순위: P1
- 예상 소요: 5시간
- 담당: 개발자
- **분류**: 재정의 필요 (board → blackboard)

## 재기준화 배경
기존 문서는 `packages/board` 내부 `AgendaManager` 구현을 전제로 작성되어 있었으나, 현재 P1 기준은 **blackboard-first**입니다. 따라서 안건(agenda)은 Board 도메인 객체가 아니라 Blackboard 상의 공유 상태/이벤트 스트림으로 먼저 정립합니다.

## 목표
`packages/blackboard`에 안건 엔티티/상태전이/이벤트 규약을 먼저 구현하여 이후 board 계층이 이를 소비하도록 SSOT를 맞춥니다.

## 구현 범위 (blackboard 우선)

### 1) 경로 재정의
- 기존: `packages/board/src/agenda/*`
- 변경: `packages/blackboard/src/domains/agenda/*`

예상 파일:
- `packages/blackboard/src/domains/agenda/types.ts`
- `packages/blackboard/src/domains/agenda/AgendaStore.ts`
- `packages/blackboard/src/domains/agenda/events.ts`
- `packages/blackboard/src/domains/agenda/index.ts`
- `packages/blackboard/test/domains/agenda/*.test.ts`

### 2) 핵심 책임
- Agenda 생성/수정/조회
- 상태 전이 규칙(DRAFT→PENDING→ACTIVE→COMPLETED 등)
- 우선순위/마감시간 필드 검증
- Blackboard EventBus와 도메인 이벤트 연결

### 3) 완료 기준
- [x] Agenda 타입/상태 전이 규칙이 `packages/blackboard`에 정의됨
- [x] CRUD + 상태전이 테스트 통과
- [x] 이벤트 이름 규약이 board/actor와 충돌 없이 문서화됨
- [x] 기존 `board` 용어가 blackboard 기반 용어로 정리됨

## 의존성
- 선행: TASK-019, TASK-020, TASK-023
- 후행: TASK-037, TASK-039

## SSOT / 참고
- [[../architecture/blackboard-actor-design|Blackboard + Actor 아키텍처]]
- [[TASK-019-blackboard-core|TASK-019]]
- [[TASK-020-event-bus|TASK-020]]

## 용어 정리
- **board 안건 관리** → **blackboard agenda domain**
- Board 패키지는 후속 오케스트레이션 계층으로 한정

## 야간 점검 로그 (2026-02-14 05:27 KST)
- 점검 단위: blackboard-first TASK-036 agenda domain 회귀 검증 1건
- 실행 테스트: `pnpm --filter @obora-kit/blackboard test -- test/domains/agenda`
- 결과: 통과 (1 file, 12 tests)
- 기준선 참조: `origin/main` 대비 현재 작업 브랜치(`wip/blackboard-agenda-20260213-0225`)에서 agenda domain 정상 동작 확인

## 야간 점검 로그 (2026-02-13)
- 점검 범위: blackboard-first 기준 TASK-036 agenda domain 회귀 점검
- 실행 테스트: `pnpm --filter @obora-kit/blackboard test -- test/domains/agenda`
- 결과: 통과 (1 file, 8 tests)
- 메모: 초기 오입력(`--runInBand`, 패키지 외부 경로 필터)은 vitest 옵션/경로 불일치로 실패했으며, 표준 명령으로 재검증 완료

## 3모델 재리뷰 재실행 (2026-02-13 17:00 KST)
- Opus 4.6: 9.2/10, P0=0, P1=0 (PASS)
- Codex 5.3: 9.4/10, P0=0, P1=0 (PASS)
- GLM 5: 출력 완결성 실패(점수/P0/P1 미제공, 재시도 1회 동일 실패)
- 판정: **🟡 조건부완료 유지** (사유: 3모델 게이트 미충족)
- 액션: GLM 안정 프로토콜로 재실행하여 점수 라인 + P0/P1 + 완결 출력 확보

## 야간 점검 로그 (2026-02-14 02:27 KST)
- 점검 단위: blackboard-first TASK-036 agenda domain 회귀 검증 1건
- 실행 테스트: `pnpm --filter @obora-kit/blackboard test -- test/domains/agenda`
- 결과: 통과 (1 file, 12 tests)
- 기준선 참조: `origin/main` 대비 현재 작업 브랜치에서 agenda domain 테스트 정상
