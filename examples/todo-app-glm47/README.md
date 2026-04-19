# todo-app-glm47 — Advanced Step-by-Step Workflow Suite

이 예제는 GLM-4.7 단일 모델 기준으로 planning부터 final summary까지를 여러 개별 workflow로 나눠 실행하는 advanced example입니다.

현재 분류상 이 예제는 first-success 예제가 아니라 advanced / integration-oriented example입니다.

이유:

- workflow가 하나가 아니라 여러 단계/여러 묶음으로 나뉘어 있음
- planning 세분화, complex workflow 세트, materialization 스크립트까지 포함함
- 단순 실행 예제가 아니라 larger workflow suite reference에 가까움

관련 분류 문서:

- `../README.md`

---

## What this example demonstrates

- step-by-step workflow orchestration
- planning pipeline 분해
- complex workflow set 운영
- output materialization
- larger end-to-end project flow reference

핵심 흐름:

- `workflows/01-planning.yaml`
- `workflows/02-architecture.yaml`
- `workflows/03-design-review.yaml`
- `workflows/04-ui-design.yaml`
- `workflows/05-implementation.yaml`
- `workflows/06-code-review.yaml`
- `workflows/07-final-summary.yaml`

---

## Prerequisites

- Obora CLI installed
- GLM-4.7 또는 동등 provider/model을 사용할 수 있는 auth/config 준비
- `obora doctor`가 runnable 상태를 보여줌
- 이 예제용 `agents.yaml`, `obora.config.yaml`, `policy.yaml`를 함께 이해하고 실행할 준비가 되어 있음

처음 성공 경로가 아직이면 이 예제보다 아래가 먼저입니다.

- `../hello-obora.yaml`
- `../01-simple-pipeline`
- `../07-contract-first-evaluation`

---

## Recommended starting point

이 예제를 처음 볼 때는 아래 순서가 가장 안전합니다.

1. planning 단일 단계
2. planning pipeline
3. step-by-step main flow
4. complex workflow set

---

## 1. Basic step-by-step flow

```bash
cd examples/todo-app-glm47
obora run workflows/01-planning.yaml
obora run workflows/02-architecture.yaml
obora run workflows/03-design-review.yaml
```

주의:

- 각 단계 출력을 다음 단계 입력(`input.*`)으로 넘겨가며 순차 진행해야 합니다.
- 이 예제는 “한 번에 끝나는 onboarding example”이 아니라 multi-run workflow suite입니다.

---

## 2. Planning pipeline

세분화된 planning 단계:

- `workflows/planning/01-requirements-collection.yaml`
- `workflows/planning/02-requirements-analysis.yaml`
- `workflows/planning/03-solution-discussion.yaml`
- `workflows/planning/04-planning-review.yaml`
- `workflows/planning/05-planning-validation.yaml`

또는 한 번에 planning pipeline 실행:

- `workflows/01-planning-pipeline.yaml`

실행 예시:

```bash
cd examples/todo-app-glm47
obora run workflows/01-planning-pipeline.yaml --config obora.config.yaml --agents agents.yaml --output-dir ./output --json
python3 materialize-planning-output.py
```

materialize 이후 고정 출력 경로 예시:

- `docs/01-requirements.md`
- `docs/02-analysis.md`
- `docs/03-discussion.md`
- `docs/04-review.md`
- `docs/05-validation.md`

---

## 3. Complex workflow set

- `workflows/complex/02-architecture-complex.yaml`
- `workflows/complex/03-design-complex.yaml`
- `workflows/complex/03b-uiux-pencilskill-design-system.yaml`
- `workflows/complex/04-development-complex.yaml`
- `workflows/complex/05-validation-complex.yaml`
- `workflows/00-master-complex.yaml`

실행 예시:

```bash
cd examples/todo-app-glm47
obora run workflows/complex/02-architecture-complex.yaml
obora run workflows/complex/03-design-complex.yaml
obora run workflows/complex/04-development-complex.yaml
obora run workflows/complex/05-validation-complex.yaml
```

UI/UX 디자인 시스템 전용:

```bash
cd examples/todo-app-glm47
obora run workflows/complex/03b-uiux-pencilskill-design-system.yaml
```

---

## 4. Judgment / remediation loop aspects

`workflows/complex/04-development-complex.yaml`에는 아래 관점이 들어 있습니다.

- `quality-judgment`
- `judgment-consensus-gate`
- `remediation-plan` → `remediation-implementation`
- `regression-review`
- `release-readiness-gate`

즉 이 예제는 단순 생성보다 “판단 → 수정 → 회귀 검증 → 릴리즈 준비”까지 포함한 larger flow reference로 보는 편이 맞습니다.

---

## 5. How to verify runs

이 예제도 현재 operator surface로 확인하는 것이 기준입니다.

```bash
obora status
obora runs list
obora inspect <runId>
obora audit query <runId>
obora artifact list <runId>
```

즉 개별 output 파일만 보는 것보다 persisted run / audit / artifact 기준으로 확인하는 편이 맞습니다.

---

## When to use this example

이 예제는 아래 상황에 적합합니다.

- larger workflow suite 설계를 보고 싶을 때
- 하나의 프로젝트를 여러 workflow로 쪼개는 방식을 보고 싶을 때
- planning materialization, remediation, release gate까지 포함한 흐름을 보고 싶을 때

아래 상황에는 비추천입니다.

- 처음 Obora를 설치하고 첫 실행만 확인하려는 경우
- provider/model/auth/config가 아직 안정적이지 않은 경우
- 하나의 작은 canonical workflow만 보고 싶은 경우

그 경우 먼저 `examples/README.md`의 onboarding / supported runtime pattern 예제를 보세요.
