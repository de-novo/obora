# SWE-bench Harness Operating Defaults

## Purpose
이 문서는 현재 SWE-bench harness의 **운영 기본값**과 **실패 버킷 해석 기준**을 고정합니다.
핵심 원칙은 다음과 같습니다.

- Obora가 탐색/수정/repair를 주도한다.
- 외부 harness는 실행 안정화, 엄격한 검증, 결과 집계만 담당한다.
- 문제별 정답 주입은 하지 않는다.

## Current Recommended Defaults
### Workflow
- Primary workflow: `experiments/swe-bench-harness/obora-os-workflow.yaml`
- Discovery step runs inside Obora.
- Edit generation and repair run inside Obora.
- External helper is validation-oriented, not solution-oriented.

### Runtime defaults
- `OBORA_RUN_TIMEOUT_MS=240000`
- `discover_target.config.maxToolRounds=256`
- Retry `SDK_8002` with short retry loop in `run_repair_experiment.sh`
- Retry `429 Rate limit reached for requests` with backoff
- Sleep briefly between samples to reduce burst pressure

## Source of Truth Rules
Final validation must use workflow artifacts as the source of truth.

1. `artifacts/target_file.txt`
2. fallback: `artifacts/edit.json.target_file`

Do **not** trust the shell's initial `TARGET_FILE` as final truth when the workflow performs discovery.

## Failure Buckets
### PASS
- Final helper validation passed
- Patch synthesized successfully
- Target file / old_string / syntax checks all passed

### RUNTIME_FAIL
Execution lifecycle failure, not primarily a solution-quality failure.
Examples:
- `FAIL_RUNTIME`
- `SDK_8002`
- abort/cancel during step transition
- tool-call iteration limit exhaustion (operationally grouped under runtime unless separately split)

### QUALITY_FAIL
The agent produced a candidate, but quality/grounding/validation failed.
Examples:
- `FAIL_PATCH`
- `FAIL_WRONG_TARGET`
- `FAIL_NO_TARGET`

### INFRA_FAIL
Environment or setup failure.
Examples:
- `FAIL_CLONE`
- `FAIL_FETCH`
- `FAIL_CHECKOUT`
- `FAIL_UNKNOWN`

## Reporting Rule
Every experiment summary should report at least:
- total
- pass
- fail
- runtime_fail
- quality_fail
- infra_fail
- pass_rate

## Interpretation Rule
When evaluating Obora as an agent OS:
- `PASS` measures successful end-to-end resolution.
- `QUALITY_FAIL` measures reasoning/edit/grounding failures.
- `RUNTIME_FAIL` measures operational instability and must not be mixed with quality failure.

This separation is required for fair product evaluation.
