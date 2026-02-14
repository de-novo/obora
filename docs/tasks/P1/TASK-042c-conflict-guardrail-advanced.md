# TASK-042c: Conflict/Guardrail 고도화

## 개요
- **상태**: ✅ 완료
- **우선순위**: P1
- **예상 소요**: 4시간
- **담당**: 개발자
- **의존성**: TASK-042b

## 목표
MVP 이후 운영 안정성을 위한 충돌 처리 및 가드레일 고도화를 구현합니다.

## 작업 범위
1. Conflict Handler 고도화
   - 유형별 감지 규칙(contradiction/version/confidence)
   - 수동/자동 해결 정책
2. Guardrail 고도화
   - 배치 승격 기준
   - 상황별 임계치/예외 정책
3. 운영 기능
   - 롤백
   - 배치 승격 리포트
   - 충돌/승격 메트릭

## 완료 기준 (후속)
- [x] 충돌 감지/해결 E2E 시나리오 통과
- [x] defer/auto-resolve 정책 동작 검증
- [x] 롤백 1회 이상 검증
- [x] 문서화(운영 규칙, 장애 대응)

## 참고
- [TASK-042 상위 문서](./TASK-042-tkg-observer-reflector.md)
- [TASK-042b](./TASK-042b-observer-reflector-mvp.md)
- [Blackboard 시스템 스펙](../../spec/12-blackboard.md)


## 재동기화 근거 (2026-02-13)
- 코드 변경: conflict/guardrail 확장 로직 반영 (`ace01da`)
- 테스트: `pnpm --filter @obora-kit/blackboard test` 통과 (518/518, 2026-02-13)
- 2모델 리뷰: TASK-042c 전용 GLM+Codex 9점 이상 결과 파일 증빙 미확인
- 커밋: `ace01da`

## 2모델 게이트 재실행 (2026-02-13)
- 증빙 파일:
  - GLM: `/tmp/review-rerun-20260213/result-TASK-042c-glm.md`
  - Codex: `/tmp/review-rerun-20260213/result-TASK-042c-codex.md`
- 결과:
  - GLM: N/A, P0=0, P1=1(2모델 9+ 증빙 부족), Gate FAIL
  - Codex: 8.9/10, P0=0, P1=1(2모델 9+ 증빙 부족), Gate FAIL
- 판정: **🟡 조건부완료 유지**

## 3모델 재실행 (2026-02-13 14:57 KST)
- 최소 수정: version/confidence conflict 분기 테스트 강화 + rollback 검증 유지
- 테스트: `pnpm --filter @obora-kit/blackboard test -- test/domains/tkg/observer-reflector.test.ts` (5/5)
- Opus 4.6: 9.2/10 (PASS)
- Codex 5.3: 9.2/10 (PASS)
- GLM 5: opencode 안정 템플릿(pty+timeout+retry) 재시도했으나 출력 미완료(게이트 증빙 미확정)
- 판정: **🟡 조건부완료 유지** (잔여: GLM 9+ 점수 증빙)

## 3모델 재리뷰 재실행 (2026-02-13 17:00 KST)
- Opus 4.6: 8.8/10, P0=0, P1=1 (FAIL)
- Codex 5.3: 8.9/10, P0=0, P1=1 (FAIL)
- GLM 5: 출력 완결성 실패(점수/P0/P1 미제공, 재시도 1회 동일 실패)
- 판정: **🟡 조건부완료 유지**
- 미충족 원인: 9.0 미만 점수(Opus/Codex), GLM 증빙 미완
- 액션: conflict/guardrail 운영 근거 보강 + GLM 완결 출력 확보 후 재리뷰

## 워크플로우 재실행 로그 (2026-02-13 18:09 KST)
- 최소 수정: 추가 코드 변경 없이 게이트 증빙 재수집 시도
- 테스트: `pnpm --filter @obora-kit/blackboard test -- test/domains/tkg/observer-reflector.test.ts` (5/5 pass)
- 3모델 리뷰: OpenCode Opus/Codex/GLM 재실행 시 파일 읽기 후 종료 미완료가 반복되어 점수 라인 확정 실패
- 판정: 🟡 조건부완료 유지 (잔여: 3모델 완결 출력 + 9+/P0/P1 증빙)

## 형식 강제 3모델 재리뷰 (2026-02-13 20:xx KST)
- 산출물 경로: `.automation/review-format-forced-20260213/results/`
- Opus 4.6: 2/10, P0=0, P1=0
- GLM 5: 10/10, P0=0, P1=0
- Codex 5.3: 10/10, P0=0, P1=0
- 판정: **🟡 조건부완료 유지** (사유: Opus 점수 9 미달)
- 최소 다음 액션: Opus 재리뷰에 실제 conflict/rollback 근거를 포함한 증빙형 프롬프트 적용

## 단일 루프 재실행 (2026-02-13 22:3x KST)
- P1 최소 수정(2건):
  - conflict 감지를 eligible 노드가 아닌 candidate 전체 기준으로 변경
  - 동일 statement+버전에서 근거 없는 contradiction 생성 제거(과탐 방지)
- 재검증:
  - `pnpm --filter @obora-kit/blackboard test -- test/domains/tkg/observer-reflector.test.ts` ✅ (6/6)
  - `pnpm --filter @obora-kit/blackboard build` ✅
- 3모델 리뷰(형식 4라인 강제):
  - Opus: SCORE 7 / P0 0 / P1 3 / FAIL
  - Codex: SCORE 8.8 / P0 0 / P1 1 / FAIL
  - GLM: attempt1/attempt2 출력 미완결(점수 라인 미생성)
- 판정: **🟡 조건부완료 유지**
- 미충족 원인: 042c 범위(수동/자동 해결정책, 운영 리포트/메트릭)에 비해 현재 구현 범위가 MVP 수준에 머물러 리뷰 기준 미달

## 단일 루프 재실행 #2 (2026-02-13 22:49 KST)
- 최소 보강(핵심 지적 반영):
  - `ReflectorOptions`에 conflict별 `auto/manual/defer` 정책 추가
  - 자동 해결/수동 보류 정책 분기 + contradiction/version/confidence 요약 리포트 추가
  - 운영 메트릭(`totalMerges/autoResolved/deferred/manualReview/rollbacks`) 집계 및 getter 추가
  - 테스트 2건 추가(정책 동작 + 운영 리포트/메트릭 검증)
- 재검증:
  - `pnpm --filter @obora-kit/blackboard test -- test/domains/tkg/observer-reflector.test.ts` ✅ (8/8)
  - `pnpm --filter @obora-kit/blackboard test` ✅ (524/524)
  - `pnpm --filter @obora-kit/blackboard build` ✅
- 3모델 리뷰(형식 4라인):
  - Opus: SCORE 7.5 / P0 0 / P1 3 / FAIL (`.automation/single-loop-20260213/results/result-042c-anthropic_claude-opus-4-6.md`)
  - Codex: SCORE 8.8 / P0 0 / P1 1 / FAIL (`.automation/single-loop-20260213/results/result-042c-openai_gpt-5.3-codex.md`)
  - GLM: 재시도 1회 모두 출력 미완결(점수 라인 미생성, 프로토콜 실패)
- 판정: **🟡 조건부완료 유지**
- 미충족 원인: 수동해결 워크플로우/지속형 운영리포트 요구 대비 구현이 인메모리 수준으로 평가됨


## GLM 4.7 단일 루프 재실행 (2026-02-13 23:xx KST)
- 최소 수정(1~2건):
  - rollback unknown merge-id 안전 no-op 처리
  - report history/queue 해소 API(`getReportHistory`, `resolveManualReview`, `resolveDeferred`) 추가
- 재검증:
  - `pnpm --filter @obora-kit/blackboard test -- test/domains/tkg/observer-reflector.test.ts` ✅ (10/10)
  - `pnpm --filter @obora-kit/blackboard build` ✅
- 3모델 리뷰:
  - Opus 4.6: SCORE 7 / P0 0 / P1 3 / FAIL
  - GLM 4.7: SCORE 7.5 / P0 0 / P1 2 / FAIL
  - Codex 5.3: SCORE 8.4 / P0 0 / P1 2 / FAIL
- 판정: **🟡 조건부완료 유지**
- 미충족 원인: 운영급 persistence/수동해결 워크플로우/production rollback 범위 미달
- 증빙: `.automation/glm47-final-loop-20260213/results/result-042c-*.md`

## 최종 루프 (GLM 4.7 정책, 2026-02-14 00:xx KST)
- 최소 수정(ops-grade gap):
  - `JsonFileReflectorStateStore` 추가(파일 기반 지속성)
  - atomic write(`.tmp`→rename), corrupted JSON tolerant load
  - runtime read-only production map guard + unserializable payload 안전 처리
- 재검증:
  - `pnpm --filter @obora-kit/blackboard test -- test/domains/tkg/observer-reflector.test.ts` ✅ (17/17)
  - `pnpm --filter @obora-kit/blackboard build` ✅
- 3모델 리뷰(형식 4라인):
  - Opus 4.6: SCORE 9.2 / P0 0 / P1 0 / PASS
  - GLM 4.7: SCORE 9.5 / P0 0 / P1 0 / PASS
  - Codex 5.3: SCORE 9.3 / P0 0 / P1 0 / PASS
- 판정: **✅ 완료 전환**
- 증빙: `.automation/final-loop-20260214/results/result-042c-*.md`
