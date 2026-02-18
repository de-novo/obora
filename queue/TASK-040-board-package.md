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
- [x] board 패키지 엔트리 생성
- [x] blackboard 도메인 의존만 허용 (중복 구현 금지)
- [x] API 초안(예: `runMeeting`)이 blackboard 이벤트 모델과 정합성 확보

## 의존성
- 선행 필수: TASK-036, TASK-037, TASK-038, TASK-039

## SSOT / 참고
- [[../architecture/blackboard-actor-design|Blackboard + Actor 아키텍처]]

## 용어 정리
- `board package = 구현 본체` ❌
- `board package = orchestration/facade` ✅

## 3모델 재리뷰 재실행 (2026-02-13 17:00 KST)
- Opus 4.6: 9.1/10, P0=0, P1=0 (PASS)
- Codex 5.3: 6.7/10, P0=0, P1=2 (FAIL)
- GLM 5: 출력 완결성 실패(점수/P0/P1 미제공, 재시도 1회 동일 실패)
- 판정: **🟡 조건부완료 유지**
- 미충족 원인: TASK 문서 상태/근거 동기화 부족(Codex P1), GLM 게이트 증빙 미완
- 액션: TASK-040 완료 기준 재정렬 및 증빙 보강 후 3모델 재리뷰

## 워크플로우 재실행 로그 (2026-02-13 18:09 KST)
- 최소 수정: 완료 기준 체크박스 3개를 구현 상태와 동기화([x])
- 테스트: `pnpm --filter @obora-kit/board test -- test/BoardFacade.test.ts` (4/4 pass)
- 3모델 리뷰: OpenCode 재실행 시 Opus/Codex/GLM에서 파일 읽기 후 종료 미완료 케이스 재발(추가 안정화 필요)
- 판정: 🟡 조건부완료 유지 (잔여: 3모델 완결 점수 증빙 확보)

## 야간 점검 로그 (2026-02-14 06:57 KST)
- 점검 단위: blackboard-first 기준 TASK-040 facade 회귀 검증 1건
- 기준 브랜치: `origin/main`
- 작업 브랜치: `wip/blackboard-agenda-20260213-0225` (HEAD 유지)
- 실행 테스트: `pnpm --filter @obora-kit/board test -- test/BoardFacade.test.ts`
- 결과: 통과 (1 file, 21 tests)
- 메모: 현재 라운드는 점검 중심(기능 추가 없음), 조건부완료 상태 유지

## 야간 점검 로그 (2026-02-15 10:42 KST)
- 점검 단위: blackboard-first 기준 TASK-040 facade 회귀 검증 1건
- 기준 브랜치: `origin/main`
- 작업 브랜치: `main` (HEAD 유지)
- 실행 테스트: `pnpm --filter @obora-kit/board test -- test/BoardFacade.test.ts`
- 결과: 통과 (1 file, 21 tests)
- 메모: 변경 없이 회귀 통과 확인, 조건부완료 상태 유지

## 야간 점검 로그 (2026-02-16 00:12 KST)
- 점검 단위: blackboard-first 기준 TASK-040 facade 회귀 검증 1건
- 기준 브랜치: `origin/main`
- 작업 브랜치: `main` (HEAD 유지)
- 실행 테스트: `pnpm --filter @obora-kit/board test -- test/BoardFacade.test.ts`
- 결과: 통과 (1 file, 21 tests)
- 메모: 변경 없이 회귀 통과 확인, 조건부완료 상태 유지

## 야간 점검 로그 (2026-02-16 21:12 KST)
- 점검 단위: blackboard-first 기준 TASK-040 facade 회귀 검증 1건
- 기준 브랜치: `origin/main`
- 작업 브랜치: `main` (HEAD 유지)
- 실행 테스트: `pnpm --filter @obora-kit/board test -- test/BoardFacade.test.ts`
- 결과: 통과 (1 file, 21 tests)
- 메모: 변경 없이 회귀 통과 확인, 조건부완료 상태 유지

## 야간 점검 로그 (2026-02-17 08:27 KST)
- 점검 단위: blackboard-first 기준 TASK-040 facade 회귀 검증 1건
- 기준 브랜치: `origin/main` (`ef54166`)
- 작업 브랜치: `main` (HEAD 유지, `21424c4`)
- 실행 테스트: `pnpm --filter @obora-kit/board test -- test/BoardFacade.test.ts`
- 결과: 통과 (1 file, 21 tests)
- 메모: 블로커 없음, 조건부완료 상태 유지

## 야간 점검 로그 (2026-02-18 15:56 KST)
- 점검 단위: blackboard-first 기준 TASK-040 실행 가능성 점검 1건
- 기준 브랜치: `origin/main` (`40e3c43`)
- 작업 브랜치: `main` (HEAD 유지, `4b3d86f`)
- 실행 검증: `pnpm --filter @obora-kit/board test -- test/BoardFacade.test.ts`
- 결과: 실패 — `No projects matched the filters`
- 메모: 현재 저장소에 `packages/board` 및 blackboard 관련 패키지가 확인되지 않아 기존 회귀 경로로 검증 불가. BLOCKER 상태로 전환.

## 야간 점검 로그 (2026-02-18 19:41 KST)
- 점검 단위: blackboard-first 기준 TASK-040 BLOCKER 재확인 1건(무리한 재시도 없이 점검/정리)
- 기준 브랜치: `origin/main` (`40e3c43`)
- 작업 브랜치: `main` (HEAD 유지, `24526b5`)
- 실행 검증: `test -d packages/board && test -d packages/blackboard`
- 결과: 실패 (`packages/board`, `packages/blackboard` 모두 미존재)
- 메모: 기존 테스트 경로를 다시 때리지 않고 저장소 구조 존재 여부만 검증. BLOCKER 지속.

### BLOCKER (2026-02-18 19:41 KST)
- 원인: blackboard-first queue(TASK-018~023, 040)가 참조하는 패키지 경로(`packages/board`, `packages/blackboard`)가 현재 HEAD 기준 저장소에 없음.
- 필요조치: (1) 해당 패키지 이관/삭제 이력 확인, (2) queue의 SSOT를 현재 모노레포 구조(`packages/runtime|sdk|dashboard|cli|adapters`)에 맞게 재매핑.
- 다음실행조건: 유효한 blackboard-first 대상 경로/테스트 커맨드가 확정될 것.
