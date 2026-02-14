# TASK-039: 회의 상태기계 재정의 (Blackboard Event-driven)

## 개요
- **상태**: ✅ 완료 (2026-02-13 night 점검 반영)
- 우선순위: P1
- 예상 소요: 7시간
- 담당: 개발자
- **분류**: 재정의 필요

## 재기준화 배경
기존 문서는 `BoardStateMachine + BoardController`를 `packages/board`에 강결합으로 설계했습니다. 현 시점에서는 상태기계를 blackboard 이벤트 기반으로 먼저 안정화하고, controller 통합은 후속 단계로 분리해야 충돌이 줄어듭니다.

## 목표
회의 진행 FSM을 blackboard 이벤트 스트림으로 구현/검증하고, BoardController 범위를 후속 태스크로 분리합니다.

## 구현 범위

### 1) 경로 재정의
- 기존: `packages/board/src/state-machine/*`
- 변경: `packages/blackboard/src/workflow/meeting-state-machine/*`

### 2) 핵심 책임
- 상태: `idle → agenda_setting → discussion → debate → voting → resolving → resolved`
- 이벤트 입력: agenda/voting/consensus 도메인 이벤트
- 타임아웃/정족수 상실/취소 시나리오 처리
- 상태 전이 로그를 blackboard에 기록

### 3) 범위 조정
- `BoardController`/`runMeeting()`는 본 태스크에서 제외
- 해당 항목은 `TASK-040` 재정의 문서로 이관

### 4) 완료 기준
- [x] 상태 전이 규칙이 blackboard workflow 계층에 구현됨 (`packages/blackboard/src/workflow/meeting-state-machine/*`)
- [x] 타임아웃/예외 전이 테스트 통과 (`pnpm vitest run packages/blackboard/test/workflow/meeting-state-machine.test.ts`)
- [x] 전이 로그(snapshot) 직렬화 가능 (`toSnapshot()/fromSnapshot()` 검증)
- [x] controller 통합 코드 요구사항이 분리 문서화됨 (본 문서의 범위 조정 + TASK-040 이관)

## 의존성
- 선행: TASK-036, TASK-037, TASK-038
- 후행: TASK-041

## SSOT / 참고
- [[../architecture/blackboard-actor-design|Blackboard + Actor 아키텍처]]
- [[TASK-038-consensus-algorithm|TASK-038]]

## 용어 정리
- **Board 상태기계** → **Blackboard workflow 상태기계**

## 추가 점검 로그 (2026-02-14 21:57 KST)
- 기준선 확인: 작업 브랜치 `main` (HEAD 유지), 기준 브랜치 `origin/main`
- 실행: `pnpm vitest run packages/blackboard/test/workflow/meeting-state-machine.test.ts`
- 결과: ✅ 1 file / 2 tests 통과
