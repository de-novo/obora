# One-File Workflow DSL Spec (Draft)

## 한줄 목표
사용자는 **한 개의 workflow 파일만 작성**하면 되고, runtime은 이를 내부적으로 **다단계 실행 그래프**로 확장해 validation/research/proof loop를 수행한다.

---

## 문제 정의
현재 실험 결과는 다음을 보여준다.
- 사용자 UX 관점에서는 한 파일 선언형 워크플로우가 가장 자연스럽다.
- 하지만 실행 단계까지 한 덩어리로 유지하면 timeout, false progress, 종료 의미론 혼동이 커진다.
- 따라서 **authoring model**과 **execution model**을 분리해야 한다.

즉:
- 사용자에게는 one-file declarative workflow 제공
- runtime 내부에서는 compiled sub-step graph로 실행

---

## 설계 원칙

### Principle 1 — One-file authoring
사용자는 하나의 YAML만 작성한다.

### Principle 2 — Internal expansion
runtime은 mode/template에 따라 내부 step graph로 자동 확장한다.

### Principle 3 — Override escape hatch
고급 사용자는 expansion 결과의 일부를 override할 수 있다.

### Principle 4 — Stop semantics are explicit
STOP/CONTINUE/bounded-stop 의미론은 내부에서 구조적으로 관리한다.

### Principle 5 — Archive is first-class
loop 종료 시 archive packaging도 mode 정의에 포함될 수 있다.

---

## 사용자-facing DSL 예시

```yaml
name: prove-hard-math
version: "1.0"
mode: proof-loop

problem:
  statement: |
    Prove that
    sum_{k=1}^n k^3 = (n(n+1)/2)^2
  domain: positive integers
  goal: bounded-proof-search

model:
  provider: zai
  model: glm-4.7

loop:
  max_iterations: 5
  no_progress_ceiling: 2
  repeated_critical_issue_ceiling: 2

review:
  reviewers: 2
  require_counterexample_check: true

archive:
  enabled: true

output:
  root: ./output
```

사용자는 이 한 파일만 쓰면 된다.

---

## 핵심 top-level 필드

### 1. `mode`
미리 정의된 high-level orchestration mode.

초기 후보:
- `validation-repair`
- `research-loop`
- `proof-loop`
- `review-loop`

### 2. `problem`
도메인별 입력 명세.

#### proof-loop 예시
- `statement`
- `domain`
- `goal`
- `known_facts` (optional)
- `non_goals` (optional)

### 3. `model`
기본 provider/model 설정.

### 4. `loop`
종료/재시도/ceiling 정책.

예:
- `max_iterations`
- `no_progress_ceiling`
- `repeated_critical_issue_ceiling`
- `max_time_ms`
- `bounded_stop_enabled`

### 5. `review`
reviewer 수, review depth, required checks.

예:
- `reviewers`
- `require_counterexample_check`
- `require_gap_register`

### 6. `archive`
archive packaging 정책.

예:
- `enabled`
- `bundle`
- `include_intermediate`

### 7. `output`
artifact/output 경로 정책.

---

## Internal Expansion Model

### A. `mode: validation-repair`
내부 확장 예:
1. build_or_repair
2. validate_structured
3. repair_decision
4. remediation_backedge
5. final_summary
6. archive

### B. `mode: research-loop`
내부 확장 예:
1. problem_frame
2. success_criteria
3. research_notes
4. synthesis
5. review
6. remediation
7. final_conclusion
8. archive

### C. `mode: proof-loop`
내부 확장 예:
1. problem_frame
2. known_results_audit
3. lemma_search
4. proof_attempt
5. counterexample_check
6. proof_gap_register
7. review
8. remediation
9. final_classification
10. archive

중요한 점은 **사용자는 이 step들을 직접 안 써도 된다**는 것이다.

---

## Expansion Pipeline

Runtime 내부 흐름은 아래처럼 된다.

1. Parse one-file DSL
2. Validate DSL schema
3. Resolve mode template
4. Materialize internal workflow graph
5. Apply user overrides
6. Execute graph
7. Persist loop summary and stop metadata
8. Emit archive bundle if configured

---

## Override Model

### 최소 override
사용자는 세부 step prompt를 일부만 override할 수 있다.

예:

```yaml
overrides:
  proof_attempt:
    prompt_suffix: |
      Prefer induction before combinatorial arguments.
```

### 고급 override
step 추가/교체도 가능하되, 기본 mode semantics를 깨면 validation error.

예:
- 금지: `proof-loop`인데 `counterexample_check` 제거
- 허용: `counterexample_check` prompt 보강

---

## Stop Semantics

### Canonical stop outcomes
- `success`
- `continue`
- `bounded_stop`
- `refuted`
- `exhausted`

### Why this matters
현재 실험에서 review FAIL + STOP 충돌 같은 문제가 실제로 발생했다.
따라서 one-file DSL에서는 stop semantics를 문자열이 아니라 **구조화된 outcome model**로 가져가야 한다.

예:

```yaml
final_outcome:
  status: bounded_stop
  reason: repeated_critical_issue
  next_action: archive_and_exit
```

---

## Runtime Metadata Requirements

loop summary에는 최소 아래를 남겨야 한다.
- lastValidationSummary
- repeatedSignatureCount
- lastStopCategory
- repairNoProgress
- backEdgeTriggered
- backEdgeExhausted
- latestReviewDecision
- finalOutcomeStatus

proof-loop에는 추가로 아래가 필요하다.
- proofGapCount
- unresolvedLemmaCount
- counterexampleRiskLevel

---

## Why one-file is still compatible with granular execution
사용자는 한 파일을 원하지만, runtime은 아래 이유로 내부 분해가 필요하다.
- timeout 방지
- false progress 감지
- 반례 점검 분리
- 종료 의미론 일관성
- archive 품질 향상

즉 one-file UX와 multi-step execution은 충돌하지 않는다.
오히려 one-file UX를 제대로 제공하려면 내부 분해가 필수다.

---

## 단계별 제품화 제안

### Phase 1
- `mode: validation-repair`
- 가장 작은 범위부터 제품화

### Phase 2
- `mode: research-loop`
- 현재 실험 자산 재활용 가능

### Phase 3
- `mode: proof-loop`
- proof-gap / counterexample semantics 확장 필요

---

## CTO 권장안
제품 방향은 아래가 맞다.

> 사용자에게는 한 파일 선언형 UX를 제공하고,
> runtime은 그 파일을 mode-aware compiled workflow로 확장해 실행한다.

즉,
- **one-file DSL = public API**
- **expanded execution graph = internal engine**

이 구조가 사용성, 안정성, 확장성을 모두 가장 잘 맞춘다.
