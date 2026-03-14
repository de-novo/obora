# Validation-Repair Loop Tutorial

Obora SDK는 validator step과 repair step 사이에 **반복형 보정 루프**를 구성할 수 있습니다.
이 패턴은 생성 → 검증 → 실패 시 수정 → 재검증 흐름을 runtime 차원에서 실행할 때 유용합니다.

## 언제 쓰는가
- 코드 생성 후 validator가 실패를 구조화해서 반환할 때
- 같은 종류의 실패가 반복되는지 추적하고 싶을 때
- no-progress / repeated critical issue ceiling으로 루프를 중단하고 싶을 때
- repair step에 최신 validation 결과와 실패 이력을 자동 주입하고 싶을 때

## 핵심 개념

### Validation step
validator step은 structured `ValidationResult`를 반환할 수 있습니다.

```json
{
  "passed": false,
  "summary": "Fix TS1484 import type usage",
  "failedChecks": [
    { "name": "typescript", "message": "TS1484" }
  ],
  "signature": "ts1484"
}
```

### Repair loop config
repair 대상 step에는 `repair_loop` 설정을 둘 수 있습니다.

```yaml
config:
  repair_loop:
    enabled: true
    validation_step: validate
    max_no_progress_iterations: 2
    repeated_critical_issue_ceiling: 2
```

### on_fail back-edge
validator step에서 실패 시 repair step으로 되돌리려면 `on_fail.goto`를 사용합니다.

```yaml
on_fail:
  goto: build_or_repair
  max_iterations: 3
```

## 예제 워크플로우

```yaml
name: validation-repair-loop
version: "1.0"
steps:
  - name: build_or_repair
    agent: builder
    config:
      repair_loop:
        enabled: true
        validation_step: validate
        max_no_progress_iterations: 2
        repeated_critical_issue_ceiling: 2
    input:
      task: Build or repair the app.

  - name: validate
    agent: validator
    depends_on: [build_or_repair]
    config:
      validation:
        enabled: true
        emit_structured_result: true
    on_fail:
      goto: build_or_repair
      max_iterations: 3
    input:
      task: Validate the app and return structured JSON.
```

## Repair context에 자동 주입되는 값
repair step에는 다음 정보가 자동 주입됩니다.

- `mode`
- `attempt`
- `validationStep`
- `latestValidation`
- `previousValidationResults`
- `repeatedSignatureCount`
- `maxNoProgressIterations`
- `repeatedCriticalIssueCeiling`

즉 repair agent는 단순히 "다시 고쳐"가 아니라,
- 무엇이 실패했는지
- 몇 번째 시도인지
- 같은 실패가 몇 번 반복됐는지
를 알고 수정할 수 있습니다.

## 종료 의미론
현재 runtime은 다음 종료 축을 구분합니다.

- 일반 validation failure → back-edge retry
- no-progress ceiling 초과 → 종료
- repeated critical issue ceiling 초과 → 종료
- on_fail.max_iterations 초과 → exhausted 종료

repair loop summary에는 다음 메타데이터가 남습니다.

- `lastNoProgressReason`
- `lastExhaustReason`
- `lastStopCategory`
  - `no_progress`
  - `repeated_critical_issue`
  - `exhausted`

## 운영 팁
1. validator는 되도록 stable `signature`를 반환하세요.
2. summary만 바뀌고 signature가 계속 같다면 no-progress로 간주될 수 있습니다.
3. repeated critical issue ceiling은 구조적으로 같은 blocker가 반복될 때 쓰세요.
4. cancel/abort 경로도 persistence에 `aborted` 상태로 남도록 지원됩니다.

## 현재 범위
이미 지원되는 것:
- structured validation result parsing
- repair context injection
- no-progress detection
- repeated critical issue ceiling
- stop category persistence
- aborted run persistence

후속 작업 후보:
- bounded-stop reason code 확장
- example workflow 승격
- migration guide 보강
