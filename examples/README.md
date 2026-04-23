# Obora Examples

현재 `examples/`는 “처음 성공 경로”, “현재 지원되는 대표 패턴”, “고급/통합형 예제”를 구분해서 보는 편이 가장 안전합니다.

이 분류 기준은 아래 문서와 맞춥니다.

- support boundary: `docs/support-scope.md`
- current capabilities: `docs/current-capabilities.md`
- operator flow: `docs/operator-guide.md`

---

## 1. Onboarding / first-success examples

처음 Obora를 만질 때는 아래부터 보는 것이 맞습니다.

| Example                                                          | 언제 보나                                        | 비고                                      |
| ---------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------- |
| [`hello-obora.yaml`](./hello-obora.yaml)                         | 가장 작은 단일 파일 예제가 필요할 때             | hello-world 수준의 가장 작은 surface      |
| [`01-simple-pipeline`](./01-simple-pipeline)                     | 가장 기본적인 multi-step workflow를 보고 싶을 때 | 선형 `generate -> review -> format`       |
| [`07-contract-first-evaluation`](./07-contract-first-evaluation) | 현재 추천 authoring 스타일을 보고 싶을 때        | contract-first / bindings / output schema |

추천 순서:

```bash
obora quickstart my-project
cd my-project
obora doctor
obora validate judge.yaml
obora expand --json -- judge.yaml   # optional, after editing judge.yaml
obora --json expand judge.yaml
obora judge --dry-run
obora judge

# 그 다음 examples
obora run examples/hello-obora.yaml --dry-run
obora run examples/hello-obora.yaml
obora run examples/07-contract-first-evaluation/workflow.yaml --dry-run
obora run examples/07-contract-first-evaluation/workflow.yaml
```

---

## 2. Supported runtime pattern examples

현재 runtime-centric CLI family에서 대표적으로 참고할 수 있는 예제입니다.

| Example                                                    | Demonstrates                             | Notes                           |
| ---------------------------------------------------------- | ---------------------------------------- | ------------------------------- |
| [`02-multi-agent-consensus`](./02-multi-agent-consensus)   | discussion / voting / majority consensus | multi-agent decision flow       |
| [`03-policy-gate`](./03-policy-gate)                       | human approval gate + policy enforcement | waiting / approval / escalation |
| [`06-validation-repair-loop`](./06-validation-repair-loop) | runtime-native validation/repair loop    | custom validator tool 포함      |

대표 실행 예시:

```bash
obora run examples/02-multi-agent-consensus/workflow.yaml --policy examples/02-multi-agent-consensus/policy.yaml
obora run examples/03-policy-gate/workflow.yaml --policy examples/03-policy-gate/policy.yaml
node examples/06-validation-repair-loop/run.mjs
```

---

## 3. Advanced / integration-oriented examples

아래는 현재 product 기본 onboarding path는 아니지만, 특정 capability나 더 큰 end-to-end 흐름을 보여주는 예제입니다.

| Example                                                | 왜 advanced인가                                             | Notes                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| [`04-plugin-custom`](./04-plugin-custom)               | runtime integration으로 custom pattern/plugin 등록이 필요함 | 기본 CLI 단독 경로보다 integration 성격이 강함                        |
| [`05-dashboard-monitoring`](./05-dashboard-monitoring) | monitoring/dashboard 맥락의 audit flow를 보여줌             | `@obora/dashboard` package는 있으나 `obora dashboard`는 live CLI 아님 |
| [`todo-app`](./todo-app)                               | 기획→설계→구현까지 이어지는 compact end-to-end example      | larger workflow example                                               |
| [`todo-app-glm47`](./todo-app-glm47)                   | 다단계 workflow suite와 산출물 materialization까지 포함     | step-by-step / complex workflow set                                   |

주의:

- `04-plugin-custom`은 plugin registration이 먼저 되어 있어야 합니다.
- `05-dashboard-monitoring`은 dashboard package를 함께 볼 수는 있지만, 현재 기본 operator 경로는 여전히 `obora status`, `obora runs`, `obora inspect`, `obora audit`입니다.
- `todo-app*` 예제들은 first-success path보다 “큰 흐름 참고” 용도에 가깝습니다.

---

## 4. Historical / reference-only

현재 root `examples/` 인덱스에서 별도로 historical bucket으로 내리는 예제는 없습니다.

다만 아래 조건이면 default 추천 경로에서 제외하는 것이 맞습니다.

- live CLI가 아닌 deferred/legacy surface에 의존함
- 현재 support boundary보다 과거 feature-centric UX를 전제로 함
- 현재 operator path보다 historical architecture를 설명하는 목적이 더 큼

이런 예제가 생기면 onboarding/supported/advanced와 섞지 말고 별도 historical/reference-only bucket으로 분리하는 편이 안전합니다.

---

## 5. 빠른 선택 가이드

### 가장 먼저 돌릴 것

```bash
obora run examples/hello-obora.yaml
obora run examples/07-contract-first-evaluation/workflow.yaml
```

### runtime pattern을 보고 싶을 때

```bash
obora run examples/02-multi-agent-consensus/workflow.yaml --policy examples/02-multi-agent-consensus/policy.yaml
obora run examples/03-policy-gate/workflow.yaml --policy examples/03-policy-gate/policy.yaml
node examples/06-validation-repair-loop/run.mjs
```

### 큰 end-to-end 흐름을 보고 싶을 때

```bash
cd examples/todo-app
obora run workflow.yaml --dry-run
obora run workflow.yaml
```

또는

```bash
cd examples/todo-app-glm47
obora run workflows/01-planning.yaml --dry-run
obora run workflows/01-planning.yaml
```

---

## 6. 실무 해석 규칙

헷갈리면 아래처럼 보면 됩니다.

1. 처음 성공 경로는 `quickstart -> doctor -> validate -> optional expand -> judge --dry-run -> judge`
2. examples는 그 다음에 capability를 넓혀 보는 참고 surface
3. contract-first / validation-repair / consensus 예제는 현재 live product capability와 가장 가깝다
4. plugin/dashboard/todo-app 계열은 advanced example로 보고, 기본 onboarding success 기준으로 삼지 않는다
