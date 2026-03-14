# Implementation Handoff

## 한줄 목표
Obora Runtime에 **validation-repair loop 패턴**을 제품 기능으로 구현한다.

## 구현 범위
이번 구현은 연구 결과에서 도출된 아래 항목을 코드로 옮기는 것을 목표로 한다.

1. `ValidationResult` / `RepairContext` 타입 및 계약 도입
2. loop policy 파싱 및 enforcement
3. counter reset / no-progress / repeated-critical-issue 규칙 구현
4. review/remediation 패턴이 실제 runtime에서 동작하도록 orchestration 확장
5. 테스트 및 문서화

---

## 구현 우선순위

### Phase 1 — 타입/계약 정의
**목표:** validator → repair step 간 실행 계약을 명확히 고정

작업:
- `packages/runtime/src/validation/types.ts` 신설
- `ValidationResult` 타입 정의
- `RepairContext` 타입 정의
- `RepairLoopPolicy` 타입 정의
- export surface 정리

완료 기준:
- 타입 정의가 컴파일됨
- schema/documentation과 불일치 없음
- validator/repair 경계에서 사용할 입력 구조가 문서와 동일함

---

### Phase 2 — RuntimeOrchestrator 확장
**목표:** repair loop를 실제 실행 경로에 통합

작업:
- loop policy extraction 함수 추가
- repair context build 함수 추가
- latest validation result를 repair step에 자동 주입
- no-progress counter / repeated-critical-issue counter 상태 추적
- stop / continue 판정 경로 추가

완료 기준:
- 정책 기반으로 loop 실행/중단 가능
- counter 증가/리셋 로직이 문서 규칙과 일치
- FAIL → remediation → retry 흐름이 runtime에서 재현됨

---

### Phase 3 — Safety / Policy Enforcement
**목표:** 무한 루프와 의사 수렴을 방지

작업:
- `max_iterations`
- `no_progress_ceiling`
- `repeated_critical_issue_ceiling`
- bounded-stop 처리
- audit event emit 추가

완료 기준:
- ceiling 도달 시 종료가 예측 가능하게 작동
- bounded conclusion 경로 존재
- audit trail에서 상태 전이 추적 가능

---

### Phase 4 — 테스트
**목표:** 설계가 아니라 실제 동작을 검증

필수 테스트:
- T1: 3 iteration 이내 성공 repair
- T2: max iterations exhaustion
- T3: no-progress detection
- T4: repeated critical issue detection
- T5: opt-in disabled backward compatibility
- T6: malformed ValidationResult / contract violation

완료 기준:
- 핵심 시나리오 자동화
- flaky 없이 재현 가능
- backward compatibility 깨지지 않음

---

### Phase 5 — 문서화
**목표:** workflow author가 기능을 실제로 쓸 수 있게 함

작업:
- README 섹션 추가
- loop policy 예제 YAML 추가
- migration guide 작성
- failure mode / troubleshooting 문서 추가

완료 기준:
- 새 사용자가 예제로 기능 사용 가능
- opt-in 사용법이 명확함
- 기존 사용자에게 breaking change가 없음

---

## 핵심 구현 규칙

### Rule 1 — STOP/CONTINUE 의미론 분리
- review FAIL이면 STOP 금지
- PASS일 때만 정상 STOP 허용
- bounded stop은 별도 reason 코드로 남길 것

### Rule 2 — output / artifact 경로 일관성
- sandbox 상대경로와 runtime cwd 차이로 결과가 분산되지 않게 할 것
- artifact root를 명시적으로 통제할 것

### Rule 3 — policy는 정량 기준 기반
- progress/no-progress는 정성 문장으로 처리하지 말고 수치 규칙으로 다룰 것
- counter reset 조건은 명시적 if/else 경로로 둘 것

### Rule 4 — runtime 상태 정리
- failed/aborted run이 `running`으로 남지 않도록 cleanup 경로 점검

---

## 구현 태스크 분해

### Task A — Types & Schema
- validation types 파일 추가
- schema docs 반영
- export 경로 정리

### Task B — Repair Loop Runtime Hook
- policy parsing
- validation result capture
- repair context inject

### Task C — Counter Engine
- no-progress counter
- repeated critical issue counter
- reset condition engine

### Task D — Termination Engine
- PASS/FAIL contract
- STOP/CONTINUE/bounded-stop reason code
- audit event integration

### Task E — E2E Sandbox
- `.sandbox` 예제 추가 또는 기존 예제 승격
- iteration 로그 및 상태 검증

### Task F — Docs & Adoption
- README
- migration guide
- example workflow

---

## 권장 구현 순서
1. Task A
2. Task B
3. Task C
4. Task D
5. Task E
6. Task F

---

## 완료 정의 (Definition of Done)
- 타입/계약 구현 완료
- runtime loop 동작 확인
- safety ceiling 동작 확인
- PASS/FAIL/STOP/CONTINUE 의미론 일관성 확보
- 테스트 시나리오 통과
- 문서 공개 가능 상태

---

## 비고
이번 handoff는 **연구 결과를 구현 태스크로 변환한 문서**다.
즉, 여기서부터는 추가 연구가 아니라 실제 runtime/product 작업으로 넘어간다.
