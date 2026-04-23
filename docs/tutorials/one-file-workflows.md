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

one-file DSL도 점점 **contract-first authoring** 방향으로 이동하고 있습니다.
특히 JSON in / JSON out 평가 계열에서는 `input.schema`, `output.path`, `output.schema` 같은 contract surface가 중요합니다.

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

### 4. judge

JSON input을 받아 단일 평가 step을 실행하고 JSON output artifact를 저장하는 가장 짧은 경로입니다.

처음 onboarding 경로로 보려면 아래 문서를 먼저 읽는 편이 좋습니다.

- [Judge Quickstart](./02-judge-quickstart.md)
- [Quick Troubleshooting](./03-quick-troubleshooting.md)

```yaml
name: one-file-judge
mode: judge

provider: mock
model: mock-evaluator
prompt: |
  Evaluate the submission and return JSON only.

input:
  json: artifacts/submission.json
  schema: artifacts/submission.schema.json

output:
  path: artifacts/result.json
  schema: artifacts/result.schema.json
```

이 mode는 아래 use case에 적합합니다.

- 단일 submission 평가
- rubric 기반 점수화
- JSON in / JSON out contract 테스트
- larger workflow 없이 짧은 structured path 확인

일반 step 기반의 runnable contract-first example이 필요하면 아래를 참고하세요.

- `examples/07-contract-first-evaluation/`

## 디버깅 / 확인

가장 먼저 확인할 명령은 `validate`입니다.

```bash
obora validate my-workflow.yaml
obora validate my-workflow.yaml --json
obora --json validate my-workflow.yaml
```

이 경로는 다음을 빠르게 확인할 때 적합합니다.

- one-file top-level / nested key 유효성
- required field 누락
- 일반 workflow와 one-file workflow 모두에 대한 계약 검증

구조를 더 자세히 보고 싶으면 `expand`를 사용합니다.

```bash
obora expand my-workflow.yaml --json
obora --json expand my-workflow.yaml
```

이 명령은 다음을 보여줍니다.

- expanded internal workflow
- derived stop semantics
- mode metadata

기존 `run --dry-run` 경로도 계속 사용할 수 있습니다.
고급 preview flag와 JSON 출력을 함께 볼 때는 root-global JSON form을 권장합니다.

```bash
obora run my-workflow.yaml --dry-run --dump-expanded-workflow --show-stop-semantics
obora --json run my-workflow.yaml --dry-run --dump-expanded-workflow --show-stop-semantics
```

이 경로는 실행 직전 validation과 함께 내부 확장 결과를 확인할 때 유용합니다.

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

### judge 허용 top-level 키

- `name`
- `version`
- `mode`
- `provider`
- `model`
- `prompt`
- `input`
- `output`

#### judge nested keys

- `input`: `json`, `schema`
- `output`: `path`, `schema`

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
- judge mode JSON in → single-step evaluation → JSON out path
- one-file judge input/output schema intent exposure

## 제한사항

- archive behavior는 아직 intent 중심이며 full runtime wiring은 미완료
- research-loop / proof-loop는 현재 최소 vertical slice 수준
- formal proof verification이나 full remediation generation은 아직 포함되지 않음
- judge mode의 schema 지원은 현재 contract-first 최소 경로 중심이며 full JSON Schema coverage는 아님

## 관련 파일

- `packages/sdk/examples/validation-repair-loop.yaml`
- `docs/tutorials/validation-repair-loop.md`
- `docs/tutorials/04-contract-first-quickstart.md`
- `docs/tutorials/05-contract-first-authoring-guide.md`
- `output/archive/38-one-file-workflow-dsl-spec.md`
- `output/archive/39-one-file-dsl-followups.md`
