# Validation-Repair Loop Product Update

## 한줄 요약

Obora는 이제 단순히 워크플로우를 실행하는 수준을 넘어,
**검증 실패를 다시 repair step의 입력으로 연결하고, 수렴 과정을 저장/관찰/탐색할 수 있는 runtime**으로 한 단계 올라왔다.

---

## 이번 업데이트에서 실제로 추가된 것

### 1. Runtime-native validation → repair → re-validation loop

Obora SDK/runtime는 이제 기존 back-edge loop를 활용해 다음 패턴을 공식적으로 지원한다.

```yaml
steps:
  - name: build_or_repair
    agent: builder
    config:
      repair_loop:
        enabled: true
        validation_step: validate
        max_no_progress_iterations: 2

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
      escalate_on_exhaust: fail
```

즉, 실패는 워크플로우 종료가 아니라 **다음 repair iteration의 입력**이 된다.

---

### 2. Structured validation contracts

추가된 핵심 계약:

- `ValidationResult`
- `RepairContext`
- `ValidationStepConfig`
- `RepairLoopConfig`

이 계약을 통해 validator step은 단순히 throw하지 않고,
실패 이유 / failed checks / log path / signature를 구조화해 전달할 수 있다.

---

### 3. Per-tool limits

기존의 blanket tool round limit 대신,
**비싼 tool / 외부 API tool만 제한하는 `toolLimits`**를 지원한다.

예:

```yaml
config:
  toolLimits:
    run_validation: 1
    fetch_url: 10
```

의도:

- `file_read`, `file_write`, `file_list` 같은 로컬 file tool은 생성 단계에서 충분히 자유롭게 사용
- validator / fetch / API call처럼 비용이 있거나 멱등성이 중요한 tool만 제한

---

### 4. Persisted repair-loop summaries

Persistence가 켜져 있으면 Obora는 이제 `run.metadata.repairLoop`에
precomputed summary를 저장한다.

포함되는 내용:

- validation failed / passed counts
- repair started / completed counts
- no-progress / exhausted counts
- last validation summary
- last attempt
- recent validation failures

의도:

- `inspect` / dashboard / external analytics가
  audit timeline 전체 replay 없이도 빠르게 상태를 볼 수 있게 함

---

### 5. CLI observability

#### `obora run`

실행 중 validation-repair progress를 바로 보여준다.

- validation failed
- repair started
- validation passed
- repair loop summary

#### `obora inspect <runId>` / `obora runs inspect <runId>`

실행 후 persisted repair-loop summary를 보여준다.

- 마지막 validation 요약
- repair 횟수
- recent validation failures
- log path / failed checks

#### `obora runs list`

목록 triage를 위한 기능 추가:

- `--repair-loop with|without|stalled|exhausted|critical|no-progress`
- `--sort startedAt|validationFailed|repairStarted`
- `--order asc|desc`
- compact `Loop State` column (`EXHAUSTED`, `STALLED`, `CONVERGED`, `REPAIRED`, `PASSED`)
- compact `DLQ` column (`<status>/<attempts>`) for the latest linked DLQ entry
- compact repair summary (`F/R/P/N/X` counts + latest validation summary)
- JSON list rows include `linkedDlqEntry` when the run has a matching DLQ record

즉 CLI에서도 이제:

- 무엇이 가장 많이 실패했는지
- 무엇이 수렴했는지
- 무엇이 stalled / exhausted 상태인지
- 무엇이 이미 DLQ로 넘어갔는지
  를 목록에서 바로 triage할 수 있다.

---

### 6. Dashboard observability

Dashboard는 이제 repair-loop runs를 실제 운영 관점에서 다룰 수 있다.

#### 목록 화면

- Repair Loop column
- 상태 badge: `CONVERGED`, `STALLED`, `EXHAUSTED`, `REPAIRED`, `PASSED`
- quick filter chips
- chip counts
- validationFailed sort

#### 상세 화면

- Repair Loop summary card
- recent validation failures
- log path / failed checks
- exhausted / stalled / converged 상태 tone

---

## 무엇이 달라졌는가

이전 Obora:

- 워크플로우를 실행하고
- 실패를 기록하고
- retry / back-edge / recovery를 제공

현재 Obora:

- 검증 실패를 구조화하고
- repair step에 자동 주입하고
- 반복 수렴을 runtime이 관리하고
- 그 과정을 CLI / dashboard / persistence에서 관찰 가능

즉, Obora는 이제
**"AI workflow runner"**라기보다
**"validation-driven convergence runtime"**에 더 가까워졌다.

---

## 실제 reference implementations

### 최소 예제

- `examples/06-validation-repair-loop`

### 프로젝트급 검증

- `.sandbox/12-reddit-clone-modern-repair-loop`

이 둘을 통해:

- 최소 이해용 reference
- 실전 수렴 검증 reference

를 각각 제공한다.

---

## 운영적으로 얻은 것

이번 업데이트로 팀/사용자가 얻는 직접적 이점은 다음과 같다.

1. **실패가 덜 치명적**
   - 실패는 종료가 아니라 repair 입력이 된다.

2. **최신 스택 변화에 더 강함**
   - 한 번에 맞추는 생성보다, 검증 후 수리 방식이 더 일반화 가능하다.

3. **운영자 관찰성이 좋아짐**
   - run 중 / run 후 / 목록 / 상세에서 repair-loop 상태가 다 보인다.
   - 특히 CLI `runs list`와 dashboard 목록에서 triage가 빨라졌다.

4. **외부 도구 연동이 쉬워짐**
   - `run.metadata.repairLoop` persisted schema로 dashboard/analytics가 간단해진다.

---

## 알려진 한계

아직 남아 있는 현실적 한계도 있다.

- validator 종류별 richer drilldown UX는 더 다듬을 여지가 있음
- persisted summary는 현재 repair-loop 중심이며, 모든 workflow semantics를 일반화한 것은 아님
- 일부 목록/정렬 로직은 post-processing 기반이라 대규모 데이터셋에서는 추후 최적화 여지 있음

---

## 다음 단계 제안

1. persisted repair-loop metadata를 외부 API / dashboard cards에 더 직접 노출
2. validator artifact/log 클릭 동선 개선
3. larger-scale run history에서 sorting/filtering 최적화
4. changelog / release note에 이번 기능 묶음을 공식 feature milestone로 반영

---

## 결론

이번 업데이트는 단순한 기능 추가가 아니다.

Obora는 이제:

- validation evidence를 읽고
- repair를 반복하며
- 그 수렴 과정을 저장하고
- CLI와 dashboard에서 운영 가능한 형태로 노출하는

**한 단계 더 실무형인 AI Control Runtime**이 됐다.
