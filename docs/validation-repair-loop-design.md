# Validation-Repair Loop Design for Obora

## 한줄 요약

Obora는 이미 **Judgment / Recovery / Back-edge loop**를 갖고 있다.
이번 제안의 목표는 새 엔진을 만드는 것이 아니라, 기존 기능을 재사용해 **validation log 기반 self-repair loop**를 Obora의 1급 실행 패턴으로 끌어올리는 것이다.

---

## 1. 배경

Obora의 공식 포지셔닝은 다음에 가깝다.

- deterministic orchestration
- policy enforcement
- audit trail
- recovery / retry / repair / resume

즉 Obora의 목표는 단순히 "AI가 무언가를 생성하게 하는 것"이 아니라,
**흔들리는 AI 출력을 운영 가능한 시스템 안에 넣는 것**이다.

이번 `.sandbox/12-reddit-clone-modern-repair-loop` 실험은 이 방향과 잘 맞는다.
해당 실험에서 Obora는:

1. live research 수행
2. 초기 프로젝트 생성
3. install / typecheck / build / Playwright validate
4. validation failure log를 읽고 수정
5. 다시 validate
6. 최종적으로 수렴

을 수행했다.

핵심은 **처음부터 완벽한 생성**이 아니라,
**실패를 읽고 스스로 수리하며 수렴하는 실행 모델**이 실제로 가치가 있다는 점이다.

---

## 2. 현재 코드베이스에 이미 있는 것

### 2.1 JudgmentEngine

파일:
- `packages/runtime/src/judgment/JudgmentEngine.ts`

이미 제공하는 것:
- `pass / fail`
- `retry`
- `goto`
- `needs-human-review`
- `timeout`
- state transition trace

즉, **판단 상태기계 자체는 이미 존재**한다.

### 2.2 Workflow back-edge loop

파일:
- `packages/sdk/src/execution/workflow-runner.ts`
- `packages/runtime/src/orchestrator/RuntimeOrchestrator.ts`

이미 제공하는 것:
- `on_fail.goto`
- `max_iterations`
- `escalate_on_exhaust`
- `cooldown_ms`
- `reset_state`
- audit events:
  - `workflow.back_edge_triggered`
  - `workflow.back_edge_exhausted`
  - `workflow.back_edge_cost_exceeded`

즉, **실패 시 이전 단계로 되돌아가는 loop 메커니즘도 이미 존재**한다.

### 2.3 Recovery / Resume / Audit

관련 파일:
- `packages/runtime/src/recovery/*`
- `packages/runtime/src/audit/*`
- `packages/cli/src/commands/resume.ts`

이미 제공하는 것:
- retry strategy
- escalation
- resume
- audit persistence
- run replay / re-execution 기반 구조

즉, **운영 관점의 안전장치도 이미 있다.**

---

## 3. 현재 부족한 것

현재 Obora는 다음을 잘한다.

- step 성공/실패 판단
- retry/goto/escalation
- audit 기록
- workflow loop 제어

하지만 아직 다음이 제품 기능으로는 약하다.

1. **validator의 실패 로그를 repair step의 표준 입력으로 전달하는 계약**
2. **repair 결과가 실제로 개선됐는지 판단하는 수렴 규칙**
3. **같은 에러 반복 / no-progress / 변경 범위 위반을 감지하는 loop policy**
4. **validation -> repair -> validation**을 자연스럽게 선언하는 workflow 표면

즉 지금은 조각은 있는데,
**artifact-aware engineering loop**는 아직 1급 abstraction이 아니다.

---

## 4. 문제 정의

현재의 retry/back-edge는 주로 이런 모델이다.

- 어떤 step이 실패했다
- 같은 step을 재시도하거나
- 이전 step으로 돌아가거나
- 사람에게 escalation 한다

하지만 실제 소프트웨어 생성/수정 작업에서는 다음이 필요하다.

1. 생성 결과를 실제 validator가 검사한다
2. validator가 구조화된 실패 결과를 남긴다
3. repair step이 그 실패 결과를 근거로 수정한다
4. 다시 validator가 검사한다
5. 개선이 없으면 stop / escalate 한다

즉 필요한 것은 단순한 retry가 아니라,
**검증 결과를 입력으로 삼는 수리 루프**다.

---

## 5. 목표

### Goals

- Obora가 **validation-driven self-repair**를 기본 실행 패턴으로 지원한다.
- 기존 `on_fail.goto` / back-edge 메커니즘을 최대한 재사용한다.
- validator 출력이 repair step에 **구조화된 컨텍스트**로 전달된다.
- audit trail에서 loop의 각 반복, 실패 이유, 수리 결과를 추적할 수 있다.
- no-progress / repeated failure를 감지해 무한 루프를 막는다.

### Non-Goals

- 새로운 거대 runtime을 별도로 만드는 것
- 첫 단계에서 복잡한 범용 planner/critic 시스템을 도입하는 것
- 모든 종류의 external validation을 한 번에 추상화하는 것
- 첫 단계에서 YAML DSL을 대대적으로 바꾸는 것

---

## 6. 핵심 설계 원칙

1. **새 엔진보다 기존 엔진 재사용**
2. **실패는 예외가 아니라 loop의 정상 입력**
3. **repair는 반드시 validator evidence 기반**
4. **수렴하지 않으면 정중하게 실패해야 함**
5. **audit 가능한 구조로 남겨야 함**

---

## 7. 제안: Phase 1 최소 설계

Phase 1에서는 새로운 대형 DSL 없이,
**기존 back-edge를 validation-repair loop로 해석 가능하게 만드는 얇은 확장**만 넣는다.

### 7.1 추천 실행 형태

가장 자연스러운 최소 패턴은 아래다.

```yaml
steps:
  - name: research
    agent: researcher

  - name: build_or_repair
    agent: builder
    depends_on: [research]

  - name: validate
    tool: validator
    depends_on: [build_or_repair]
    on_fail:
      goto: build_or_repair
      max_iterations: 3
      escalate_on_exhaust: fail

  - name: final_report
    agent: reviewer
    depends_on: [validate]
```

이 구조의 장점:
- 기존 `on_fail.goto`만으로 loop 구성 가능
- 첫 번째 `build_or_repair`는 generate 역할
- 두 번째부터는 repair 역할
- `validate -> build_or_repair -> validate` 순환이 자연스럽다

즉, **repair 전용 step을 뒤에 두는 것보다, build step이 repair도 담당하는 구조가 Phase 1에 더 적합**하다.

---

## 8. Phase 1에 추가할 표준 계약

### 8.1 Validation Result Contract

validator step은 실패 시 단순 throw만 하는 게 아니라,
가능하면 아래 구조를 output으로 남긴다.

```ts
export interface ValidationResult {
  passed: boolean;
  summary: string;
  errorCode?: string;
  failedChecks: Array<{
    name: string;
    message: string;
    severity?: "error" | "warning";
    file?: string;
  }>;
  logPath?: string;
  artifactPaths?: string[];
  suggestedTargets?: string[];
  signature?: string;
}
```

#### 의미
- `passed`: 통과 여부
- `summary`: repair agent에게 보여줄 압축 요약
- `failedChecks`: 구조화된 실패 목록
- `logPath`: 상세 로그 파일 경로
- `artifactPaths`: 관련 산출물 경로
- `suggestedTargets`: 수정이 예상되는 파일/영역
- `signature`: 반복 여부를 판정하기 위한 실패 fingerprint

### 8.2 Repair Context Contract

repair 가능한 step은 실행 시 아래 컨텍스트를 자동으로 받는다.

```ts
export interface RepairContext {
  mode: "initial_build" | "repair";
  attempt: number;
  latestValidation?: ValidationResult;
  previousValidationResults?: ValidationResult[];
}
```

#### 규칙
- 첫 실행이면 `mode = initial_build`
- validate 실패 후 back-edge로 재진입하면 `mode = repair`
- `latestValidation.logPath`가 있으면 agent는 그 파일을 우선 읽는다
- agent는 실패 근거 없이 임의로 넓은 수정 범위를 잡지 않는다

---

## 9. 판단모델(Judgment)과의 관계

중요한 점은 **JudgmentEngine을 대체하지 않는다는 것**이다.

### JudgmentEngine이 계속 담당할 것
- run state transition
- retry / timeout / human review
- goto / escalation
- policy / schema 기반 판정

### Validation-Repair loop가 추가로 담당할 것
- validator evidence 구조화
- repair input 자동 주입
- 반복 간 개선 여부 판단
- engineering task에 특화된 convergence 제어

즉 관계는 다음과 같다.

- **JudgmentEngine = 상태 판단의 공용 기반 레이어**
- **Validation-Repair loop = engineering execution에 특화된 상위 orchestration 규약**

---

## 10. Workflow surface 제안

Phase 1에서는 새로운 최상위 문법 없이도 시작 가능하다.
다만 DX를 위해 아래의 얇은 확장은 유효하다.

### Option A — Existing surface 유지 + convention

기존 step에 아래 config만 추가:

```yaml
- name: build_or_repair
  agent: builder
  config:
    repair_loop:
      enabled: true
      validation_step: validate

- name: validate
  tool: validator
  config:
    validation:
      emit_structured_result: true
  on_fail:
    goto: build_or_repair
    max_iterations: 3
```

장점:
- 기존 parser 영향 작음
- 기존 workflow와 충돌 적음

단점:
- 의도가 문법에서 아주 선명하진 않음

### Option B — 신규 sugar 문법

```yaml
loop:
  kind: validation_repair
  worker: build_or_repair
  validator: validate
  max_iterations: 3
  on_exhaust: fail
```

장점:
- 의도가 명확함
- UX가 좋음

단점:
- parser/runtime 변경 범위 커짐
- 첫 단계로는 무거움

### 권장
**Phase 1은 Option A**

즉,
- 기존 `on_fail.goto`
- 기존 back-edge
- 얇은 `repair_loop` / `validation` config

조합으로 시작하는 것이 가장 현실적이다.

---

## 11. 수렴(convergence) 규칙

이 기능이 제품화되려면 단순 반복이 아니라 **개선 여부 판단**이 필요하다.

### 11.1 Stop 조건

다음 중 하나면 루프 중단:
- `ValidationResult.passed = true`
- `max_iterations` 초과
- `max_cost` 초과
- `timeout budget` 초과
- human escalation 필요

### 11.2 No-progress 조건

다음 중 하나면 no-progress로 간주 가능:
- `signature`가 2회 이상 동일
- `failedChecks`가 의미 있게 변하지 않음
- 수정된 파일 수 = 0
- 출력 artifact hash가 동일
- validator summary가 동일하고 severity도 동일

### 11.3 Exhaustion 처리

현재 `escalate_on_exhaust`를 그대로 활용:
- `fail`
- `human`
- `dlq`

Phase 1에서는 여기까지면 충분하다.

---

## 12. Audit / Observability

기존 audit 이벤트를 최대한 재사용하되,
아래 이벤트를 추가하면 운영성이 좋아진다.

### 재사용
- `workflow.back_edge_triggered`
- `workflow.back_edge_exhausted`
- `workflow.back_edge_cost_exceeded`

### 추가 제안
- `workflow.validation_failed`
- `workflow.validation_passed`
- `workflow.repair_started`
- `workflow.repair_completed`
- `workflow.repair_no_progress`

예시 payload:

```json
{
  "step": "validate",
  "attempt": 2,
  "signature": "ts:TS1484+css:missing-import",
  "failedChecks": 3,
  "logPath": "artifacts/VALIDATION-ATTEMPT-02.log"
}
```

이렇게 남겨야:
- 어떤 실패가 반복됐는지
- 어떤 수정 이후 통과했는지
- 수렴 비용이 얼마였는지

를 운영적으로 볼 수 있다.

---

## 13. SDK / Runtime 변경 포인트

### 13.1 SDK

파일 후보:
- `packages/sdk/src/workflow.ts`
- `packages/sdk/src/execution/workflow-runner.ts`
- `packages/sdk/src/step-executor.ts`

추가 제안:
- `WorkflowStep.config.repair_loop`
- `WorkflowStep.config.validation`
- `StepExecutor`가 repair mode일 때 최신 validation result를 prompt context에 삽입
- `WorkflowRunner`가 latest validation output을 execution metadata로 추적

### 13.2 Runtime

파일 후보:
- `packages/runtime/src/orchestrator/RuntimeOrchestrator.ts`
- `packages/runtime/src/judgment/JudgmentEngine.ts`
- `packages/runtime/src/audit/types.ts`

추가 제안:
- validation signature 저장
- no-progress 판정 helper
- repair 관련 audit event 추가
- exhaustion reason에 `no_progress` 포함 고려

### 13.3 CLI

가능한 UX:
- loop 상태를 `obora status`에서 표시
- 현재 attempt / 마지막 validation 요약 표시
- exhaustion 원인 표시

예:

```bash
Loop: build_or_repair <-> validate
Attempt: 2/3
Last validation: 3 failed checks (TS1484, missing CSS import, no default export)
```

---

## 14. 구현 단계 제안

### Phase 1 — Minimal productization
- `.sandbox/12`를 reference implementation으로 유지
- structured validation result schema 도입
- repair mode context injection 도입
- existing back-edge에 얹어서 validate->repair->validate 가능하게 정리
- audit event 추가
- e2e 1개 추가

### Phase 2 — Better DX
- workflow authoring guide 추가
- CLI status 표시 개선
- helper validator utilities 제공
- no-progress heuristic 강화

### Phase 3 — Declarative sugar
- 필요 시 `loop:` 문법 도입
- 복수 validator / staged validator 지원
- validator 종류(command, test, browser, custom tool) 추상화

---

## 15. 권장 첫 구현 범위

가장 추천하는 1차 구현 범위는 아래다.

1. **새 엔진 만들지 않기**
2. **`build_or_repair -> validate` 패턴을 공식화**
3. **validator output schema 표준화**
4. **repair step에 latest validation context 자동 주입**
5. **back-edge + max_iterations + no-progress만 연결**
6. **`.sandbox/12`를 e2e 기준 테스트로 승격**

이렇게 하면 변경량은 비교적 작으면서,
Obora는 문서상 목표와 실제 제품 능력 사이의 간극을 크게 줄일 수 있다.

---

## 16. 결론

Obora에는 이미 판단모델이 있다.
하지만 현재 그 판단모델은 주로 **상태 전이 / retry / escalation** 중심이다.

우리가 지금 추가해야 하는 것은 새 판단모델이 아니라,
**validator evidence를 먹고 수정하며 다시 검증하는 self-repair execution contract**다.

즉 이번 제안의 본질은 다음이다.

- 새 시스템을 또 만드는 것 ❌
- 기존 Judgment / Recovery / Back-edge를 재사용해
- Obora를 **수렴 가능한 엔지니어링 런타임**으로 한 단계 끌어올리는 것 ✅

이 방향은 Obora의 포지셔닝과도 일치하고,
`.sandbox/12` 실험으로도 이미 실용성이 검증됐다.
