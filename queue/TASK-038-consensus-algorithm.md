# TASK-038: Consensus Rule Engine 기준 재정렬

## 개요
- **상태**: ✅ 완료 (2026-02-13 night 점검 반영)
- 우선순위: P1
- 예상 소요: 8시간
- 담당: 개발자
- **분류**: 재정의 필요 (board 의존 축소)

## 재기준화 배경
기존 문서는 `packages/board`의 ConsensusEngine 중심으로 작성되어 TASK-037의 board 구현을 강하게 전제합니다. blackboard-first 기준에서는 합의 규칙을 독립 Rule Engine으로 두고, 입력을 blackboard voting snapshot으로 표준화합니다.

## 목표
합의 알고리즘을 blackboard 스냅샷 기반 순수 함수/엔진으로 재정의해 board 계층 의존성을 제거합니다.

## 구현 범위

### 1) 경로 재정의
- 기존: `packages/board/src/consensus/*`
- 변경: `packages/blackboard/src/domains/consensus/*`

### 2) 핵심 책임
- 입력: VotingSessionResult snapshot
- 출력: ConsensusResult (+ 조건부/에스컬레이션 메타)
- majority/supermajority/unanimous/weighted 규칙 함수화
- 조건부 승인 및 dissent 기록 스키마 정의

### 3) 완료 기준
- [x] 합의 계산 로직이 blackboard 도메인으로 분리됨 (`ConsensusRuleEngine` 추가)
- [x] board-specific 객체 참조 제거
- [x] conditional/escalation 시나리오 테스트 통과
- [x] 합의 결과 스키마가 후속 상태기계(TASK-039)에서 재사용 가능

## 의존성
- 선행: TASK-037
- 후행: TASK-039, TASK-041

## SSOT / 참고
- [[../architecture/blackboard-actor-design|Blackboard + Actor 아키텍처]]
- [[TASK-037-voting-system|TASK-037]]

## 용어 정리
- **Board ConsensusEngine** → **Blackboard consensus rule engine**

## 야간 점검 로그 (2026-02-13)
- 점검 범위: TASK-038 consensus 도메인 완료 기준 재검증
- 실행 검증: `pnpm --filter @obora-kit/blackboard test -- test/domains/consensus`
- 결과: 통과 (2 files, 5 tests)
- 추가 확인: consensus 소스/테스트 경로에서 board 패키지 직접 참조 없음 (`rg` 점검)
