You are a strict reviewer. IMPORTANT: Do not use tools or request additional file reads.
Use ONLY the provided context blocks to produce the final review output immediately.
Required output lines (exact):
SCORE: <0.0-10.0>/10
P0: <count>
P1: <count>
Completion decision: PASS_FOR_DONE | KEEP_CONDITIONAL
Then include bullets for summary, P0 issues, P1 issues, and reason.
=== CONTEXT ===
# TASK-040: Board 패키지 스캐폴딩

## 개요
- **상태**: 🟡 조건부완료
- 우선순위: P2
- 예상 소요: 3시간
- 담당: 개발자
- **분류**: 보류 (후속 단계 이동)

## 보류 사유
기존 TASK-040은 `packages/board` 전체 구조를 먼저 만드는 것을 목표로 했습니다. 하지만 현재는 blackboard-first 전환으로 인해 board 패키지의 공개 API가 아직 고정되지 않았고, 선행 도메인(TASK-036~039) 결과를 반영해야 합니다.

## 재정의 방향 (실행 시점: TASK-036~039 완료 후)
- `packages/board`는 도메인 구현이 아니라 **오케스트레이션/Facade 계층**으로 제한
- `@obora-kit/blackboard`의 agenda/voting/consensus/workflow를 조합
- 최소 엔트리(`src/index.ts`, `BoardFacade.ts`)부터 시작

## 잠정 완료 기준 (재개 시)
- [ ] board 패키지 엔트리 생성
- [ ] blackboard 도메인 의존만 허용 (중복 구현 금지)
- [ ] API 초안(예: `runMeeting`)이 blackboard 이벤트 모델과 정합성 확보

## 의존성
- 선행 필수: TASK-036, TASK-037, TASK-038, TASK-039

## TASK-039 연동 메모 (2026-02-13)
- `MeetingStateMachine` 구현은 `packages/blackboard/src/workflow/meeting-state-machine/*`로 확정
- `BoardController`/`runMeeting()` 통합은 TASK-040에서만 수행 (TASK-039 범위 밖)
- board 계층은 상태 전이 로직 재구현 금지, blackboard workflow를 조합만 수행

## SSOT / 참고
- [[../architecture/blackboard-actor-design|Blackboard + Actor 아키텍처]]

## 용어 정리
- `board package = 구현 본체` ❌
- `board package = orchestration/facade` ✅

## 재동기화 근거 (2026-02-13)
- 코드 변경: `packages/board/src/BoardFacade.ts` 스캐폴딩 및 export 반영 (`e4cd60a`)
- 테스트: blackboard/actor/agents 테스트 전체 통과(2026-02-13), 단 board 패키지 전용 게이트 증빙 없음
- 2모델 리뷰: `/tmp/review-task040-*.md` 일부 9점 미만 결과 존재, 최종 2모델 9+ 세트 증빙 불완전
- 커밋: `e4cd60a`, `6ad196a`

## 2모델 게이트 재실행 (2026-02-13)
- 증빙 파일:
  - GLM: `/tmp/review-rerun-20260213/result-TASK-040-glm.md`
  - Codex: `/tmp/review-rerun-20260213/result-TASK-040-codex.md`
- 결과:
  - GLM: N/A(컨텍스트만으로 검증불가), Gate FAIL
  - Codex: 8.7/10, P0=0, P1=1(2모델 최종 게이트 미완), Gate FAIL
- 판정: **🟡 조건부완료 유지**

## 3모델 재실행 (2026-02-13 14:57 KST)
- 최소 수정: supermajority 임계치 동작 테스트 추가 + 정책 매핑 주석 명시
- 테스트: `pnpm --filter @obora-kit/board test` (5/5)
- Opus 4.6: 9.0/10 (PASS)
- Codex 5.3: 9.2/10 (PASS)
- GLM 5: opencode 안정 템플릿(pty+timeout+retry) 재시도했으나 출력 미완료(게이트 증빙 미확정)
- 판정: **🟡 조건부완료 유지** (잔여: GLM 9+ 점수 증빙)

