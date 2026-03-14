# One-File Workflows

Obora는 one-file declarative workflow authoring을 지원합니다.
사용자는 하나의 YAML 파일만 작성하면 되고, runtime은 이를 내부적으로 mode-aware step graph로 확장해 실행합니다.

## 왜 one-file인가
사용자는 보통 아래를 원합니다.
- 파일 하나
- 적은 설정
- 내부 단계는 알아서 생성
- 필요하면 결과를 inspect 가능

Obora의 설계는 이를 다음처럼 풀어냅니다.
- public API: one-file DSL
- internal engine: expanded workflow graph
- debug UX: expanded workflow / stop semantics dump

## 현재 지원 mode

### 1. validation-repair
생성 → 검증 → 수정 반복 패턴.

```yaml
name: fix-app
mode: validation-repair
agents:
  repair: builder
  validator: validator
prompts:
  repair: Repair the artifact.
  validate: Validate and emit structured result.
loop:
  max_iterations: 4
  no_progress_ceiling: 2
  repeated_critical_issue_ceiling: 2
archive:
  enabled: true
output:
  root: ./tmp-output
overrides:
  build_or_repair:
    prompt_suffix: Prefer minimal edits first.
```

### 2. research-loop
문제 framing → research → review 구조.

```yaml
name: investigate-ux
mode: research-loop
problem:
  statement: Evaluate whether one-file workflow UX is viable.
  goal: Produce a bounded research conclusion.
agents:
  researcher: researcher
  reviewer: reviewer
loop:
  max_iterations: 3
archive:
  enabled: true
output:
  root: ./research-output
```

### 3. proof-loop
문제 framing → known results audit → proof attempt → review 구조.

```yaml
name: prove-identity
mode: proof-loop
problem:
  statement: Prove that the sum of cubes identity holds.
  domain: positive integers
  goal: Produce a bounded proof-search conclusion.
agents:
  framer: framer
  prover: prover
  reviewer: reviewer
loop:
  max_iterations: 3
archive:
  enabled: true
output:
  root: ./proof-output
```

## 디버깅 / 확인
YAML이 내부에서 어떻게 확장되는지 보려면:

```bash
obora run my-workflow.yaml --dry-run --json --dump-expanded-workflow --show-stop-semantics
```

이 명령은 다음을 보여줍니다.
- expanded internal workflow
- derived stop semantics
- thresholds and mode metadata

## Validation Contract (현재 지원)

### validation-repair 허용 top-level 키
- `name`
- `version`
- `mode`
- `agents`
- `prompts`
- `loop`
- `archive`
- `output`
- `overrides`

#### validation-repair nested keys
- `agents`: `repair`, `validator`
- `prompts`: `repair`, `validate`
- `loop`: `max_iterations`, `no_progress_ceiling`, `repeated_critical_issue_ceiling`
- `archive`: `enabled`
- `output`: `root`
- `overrides.build_or_repair`: `prompt_suffix`
- `overrides.validate`: `prompt_suffix`

### research-loop 허용 top-level 키
- `name`
- `version`
- `mode`
- `problem`
- `agents`
- `prompts`
- `loop`
- `archive`
- `output`

#### research-loop nested keys
- `problem`: `statement`, `goal`
- `agents`: `researcher`, `reviewer`
- `prompts`: `frame`, `research`, `review`
- `loop`: `max_iterations`
- `archive`: `enabled`
- `output`: `root`

### proof-loop 허용 top-level 키
- `name`
- `version`
- `mode`
- `problem`
- `agents`
- `prompts`
- `loop`
- `archive`
- `output`

#### proof-loop nested keys
- `problem`: `statement`, `domain`, `goal`
- `agents`: `framer`, `prover`, `reviewer`
- `prompts`: `frame`, `audit`, `proof`, `review`
- `loop`: `max_iterations`
- `archive`: `enabled`
- `output`: `root`

### 에러 힌트
현재 validation은 다음을 제공합니다.
- required field 누락 감지
- unknown top-level key 감지
- unknown nested key 감지
- nested type mismatch 감지
- allowed key 목록 포함 에러 메시지

## 현재 지원 수준
현재 one-file mode는 다음을 지원합니다.
- mode-based expansion
- YAML loading
- runtime smoke execution
- stop semantics inspection
- validation-repair overrides (prompt suffix)
- output/archive intent exposure
- schema validation for required fields, unknown keys, and nested type checks

## 제한사항
- archive behavior는 아직 intent 중심이며 full runtime wiring은 미완료
- research-loop / proof-loop는 현재 최소 vertical slice 수준
- formal proof verification이나 full remediation generation은 아직 포함되지 않음

## 관련 파일
- `packages/sdk/examples/validation-repair-loop.yaml`
- `docs/tutorials/validation-repair-loop.md`
- `output/archive/38-one-file-workflow-dsl-spec.md`
- `output/archive/39-one-file-dsl-followups.md`
