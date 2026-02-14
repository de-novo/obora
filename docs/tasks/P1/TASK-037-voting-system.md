# TASK-037: Blackboard Voting Session 모델 재정의

## 개요
- **상태**: ✅ 완료
- 우선순위: P1
- 예상 소요: 7시간
- 담당: 개발자
- **분류**: 재정의 필요 (board → blackboard)

## 재기준화 배경
기존 문서는 `packages/board` 내부 투표 엔진 중심이었으나, 현재 로드맵은 투표 상태를 Blackboard에서 공유/추적 가능한 형태로 먼저 고정하는 것이 우선입니다.

## 목표
`packages/blackboard`에 VotingSession/Vote/Tally 규약을 구축하고, Board는 이를 orchestration 수준에서 호출하도록 분리합니다.

## 구현 범위 (blackboard 우선)

### 1) 경로 재정의
- 기존: `packages/board/src/voting/*`
- 변경: `packages/blackboard/src/domains/voting/*`

예상 파일:
- `packages/blackboard/src/domains/voting/types.ts`
- `packages/blackboard/src/domains/voting/VotingSessionStore.ts`
- `packages/blackboard/src/domains/voting/tally/*.ts`
- `packages/blackboard/test/domains/voting/*.test.ts`

### 2) 핵심 책임
- VotingSession 생명주기(PENDING/OPEN/CLOSED)
- Vote 제출/변경/철회
- quorum 계산 및 tally 결과 산출
- voting 도메인 이벤트 발행 (`voting.session.*`, `voting.vote.*`)

### 3) 완료 기준
- [x] VotingSession 모델/스토어가 blackboard에 구현됨
- [x] majority/unanimous/weighted tally 테스트 통과
- [x] quorum 계산 로직과 정책이 문서화됨
- [x] board 패키지 의존 없이 단독 테스트 가능

## 의존성
- 선행: TASK-036, TASK-020
- 후행: TASK-038, TASK-039

## SSOT / 참고
- [[../architecture/blackboard-actor-design|Blackboard + Actor 아키텍처]]
- [[TASK-036-agenda-management|TASK-036]]

## 용어 정리
- **Board VotingManager**(직접 구현) → **Blackboard voting domain**(기본 계층)
