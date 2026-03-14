# Validation-Repair Loop Migration Guide

이 문서는 기존 단방향 workflow를 validation-repair loop 패턴으로 옮길 때의 기준을 설명합니다.

## 어떤 경우에 마이그레이션할까
다음 조건이면 migration 대상입니다.
- 생성 step 뒤에 수동 검증을 반복하고 있다
- validator 결과를 사람이 해석해서 다시 prompt에 붙이고 있다
- 같은 실패가 반복되는지 추적하고 싶다
- 실패 사유를 structured metadata로 남기고 싶다

## Before
전형적인 기존 구조:

```yaml
steps:
  - name: build
    agent: builder
    input:
      task: Build the artifact.

  - name: validate
    agent: validator
    depends_on: [build]
    input:
      task: Check whether the artifact is correct.
```

이 구조의 한계:
- 실패 시 자동 back-edge 없음
- validator 결과가 구조화되지 않음
- repair step이 최신 실패 맥락을 모름
- no-progress / repeated critical issue를 추적하지 못함

## After
권장 구조:

```yaml
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
      task: Build or repair the artifact.

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
      task: Validate and emit structured JSON.
```

## Migration 체크리스트
- [ ] validator가 structured `ValidationResult`를 반환하는가
- [ ] repair 대상 step에 `repair_loop.enabled`를 켰는가
- [ ] `validation_step` 이름이 실제 validator step과 일치하는가
- [ ] `on_fail.goto`가 repair step을 정확히 가리키는가
- [ ] `signature`가 stable 하게 생성되는가
- [ ] `max_no_progress_iterations` 값이 너무 낮거나 높지 않은가
- [ ] `repeated_critical_issue_ceiling` 값이 blocker 패턴에 맞는가

## 권장 마이그레이션 순서
1. validator를 먼저 structured output으로 바꾼다
2. `repair_loop.enabled`와 `validation_step`을 추가한다
3. `on_fail.goto`를 연결한다
4. `signature` 안정성을 점검한다
5. no-progress / repeated critical issue ceiling을 조정한다
6. audit / runs inspect 출력으로 종료 이유를 확인한다

## 주의사항
- summary만 바꾸고 signature가 계속 같으면 no-progress로 간주될 수 있습니다
- repeated critical issue ceiling은 구조적으로 같은 blocker 반복을 막기 위한 장치입니다
- review FAIL / STOP 의미론은 별도 higher-level workflow contract에서 관리해야 합니다
