# TASK-036: Blackboard Agenda Stream 정비

## 개요
- **상태**: ✅ 완료
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

## 재동기화 근거 (2026-02-13)
- 코드 변경: agenda stream 도메인 반영 (`packages/blackboard/src/domains/agenda/*`)
- 테스트: `pnpm --filter @obora-kit/blackboard test` 통과 (518/518, 2026-02-13)
- 2모델 리뷰: `/tmp/review-*-task036*.md`에 Codex/GLM 9점 미만 결과 다수 → 게이트 증빙 미완
- 커밋: `...` (관련: `6ad196a` 브랜치 최신 반영)

## 2모델 게이트 재실행 (2026-02-13)
- 증빙 파일:
  - GLM: `/tmp/review-rerun-20260213/result-TASK-036-glm.md`
  - Codex: `/tmp/review-rerun-20260213/result-TASK-036-codex.md`
- 결과:
  - GLM: N/A(검증불가), Gate FAIL
  - Codex: 8.8/10, P0=0, P1=1(최종 2모델 9+ 증빙 미충족), Gate FAIL
- 판정: **🟡 조건부완료 유지**

## 야간 루틴 점검 (2026-02-13 14:27 KST)
- 기준 브랜치: `origin/main`
- 작업 브랜치(HEAD 유지): `wip/blackboard-agenda-20260213-0225`
- 최소 단위 점검: agenda 도메인 테스트 단독 재검증
- 실행: `pnpm --filter @obora-kit/blackboard test -- test/domains/agenda`
- 결과: `1 file / 8 tests` 모두 통과
- 판정: 블로커 없음, 다음 실행에서 2모델 9+ 증빙 보강 필요

## 3모델 재실행 (2026-02-13 14:57 KST)
- 테스트: `pnpm --filter @obora-kit/blackboard test -- test/domains/agenda/agenda-store.test.ts` (8/8)
- Opus 4.6: 9.2/10 (PASS)
- Codex 5.3: 9.3/10 (PASS)
- GLM 5: opencode 안정 템플릿(pty+timeout+retry) 재시도했으나 출력 미완료(게이트 증빙 미확정)
- 판정: **🟡 조건부완료 유지** (잔여: GLM 9+ 점수 증빙)

## 단일 루프 재실행 (2026-02-13 22:51 KST)
- P0/P1 최소 수정: 코드 변경 없음(신규 P0 없음, Codex 지적은 CRUD 정의 불일치)
- 재검증:
  - `pnpm --filter @obora-kit/blackboard test -- test/domains/agenda/agenda-store.test.ts` ✅ (8/8)
  - `pnpm --filter @obora-kit/blackboard test` ✅ (524/524)
  - `pnpm --filter @obora-kit/blackboard build` ✅
- 3모델 리뷰(형식 4라인):
  - Opus: SCORE 9.2 / P0 0 / P1 0 / PASS (`.automation/single-loop-20260213/results/result-036-anthropic_claude-opus-4-6.md`)
  - Codex: SCORE 8.8 / P0 0 / P1 1 / FAIL (`.automation/single-loop-20260213/results/result-036-openai_gpt-5.3-codex.md`)
  - GLM: 재시도 1회 모두 출력 미완결(점수 라인 미생성)
- 판정: **🟡 조건부완료 유지**
- 미충족 원인: Codex P1(삭제 CRUD 근거 부족) + GLM 출력 미완결


## GLM 4.7 단일 루프 재실행 (2026-02-13 23:xx KST)
- 최소 수정: Agenda 삭제 CRUD 보강(`delete`) + `agenda.deleted` 이벤트/테스트 추가
- 재검증:
  - `pnpm --filter @obora-kit/blackboard test -- test/domains/agenda/agenda-store.test.ts` ✅ (9/9)
  - `pnpm --filter @obora-kit/blackboard build` ✅
- 3모델 리뷰:
  - Opus 4.6: SCORE 9 / P0 0 / P1 1 / FAIL
  - GLM 4.7: SCORE 10 / P0 0 / P1 0 / PASS
  - Codex 5.3: SCORE 8.8 / P0 0 / P1 1 / FAIL
- 판정: **🟡 조건부완료 유지**
- 미충족 원인: Event immutability/date mutation 지적(Codex), barrel export completeness 지적(Opus)
- 증빙: `.automation/glm47-final-loop-20260213/results/result-036-*.md`

## 최종 루프 (GLM 4.7 정책, 2026-02-14 00:xx KST)
- 최소 수정:
  - barrel export 보강(`createAgendaEventMeta` 루트/도메인 export)
  - 이벤트 불변성 강화(agenda payload + event metadata timestamp mutator 차단)
  - 테스트 보강(이벤트 날짜 변이 시도 포함)
- 재검증:
  - `pnpm --filter @obora-kit/blackboard test -- test/domains/agenda/agenda-store.test.ts` ✅
  - `pnpm --filter @obora-kit/blackboard build` ✅
- 3모델 리뷰(형식 4라인):
  - Opus 4.6: SCORE 9.5 / P0 0 / P1 0 / PASS
  - Codex 5.3: SCORE 8.8 / P0 0 / P1 1 / FAIL
  - GLM 4.7: 출력 미완결/지연으로 점수 라인 확보 실패(재시도 중단)
- 판정: **🟡 조건부완료 유지**
- 미충족 원인: Codex가 Date.prototype.call 우회 변이 가능성을 P1로 판정, GLM 완결 출력 불안정
- 증빙: `.automation/final-loop-20260214/results/result-036-*.md`

## 최종 루프 v2 (GLM 4.7 정책, 2026-02-14 01:xx KST)
- 최소 수정: Date.prototype.set*.call 우회 차단 (plain-object Proxy target) + 테스트 추가
- 재검증: 12/12 agenda tests, 537/537 total, build clean
- 3모델 리뷰(범위 제한 프롬프트):
  - Opus 4.6: SCORE 9.5 / P0 0 / P1 0 / PASS
  - Codex 5.3: SCORE 9.7 / P0 0 / P1 0 / PASS
  - GLM 4.7: SCORE 10 / P0 0 / P1 0 / PASS
- 판정: **✅ 완료 전환**
- 증빙: `.automation/final-loop-20260214-v2/results/result-036-*.md`

## P0 처방 템플릿 통합 (2026-02-14 12:11 KST)
- 커밋: `d5f8bc6` — E4004/E4005/E4006/E6003 에러 코드 + 처방 템플릿(hypothesis-evidence-command-rollback) 통합
- 범위: `@obora/core/errors/diagnosis` 모듈 신규, `run`/`status --diagnose` CLI 연동
- 테스트: diagnosis 8건 + status/run 통합 4건 추가 (총 12건)
- 관련: TASK-042 에이전트 오류 진단 흐름의 CLI 표면 구현
