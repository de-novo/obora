# 05 — Dashboard Monitoring (Advanced Example)

이 예제는 monitoring/dashboard 맥락의 audit flow를 보여주는 advanced example입니다.

현재 분류상 이 예제는 first-success 예제가 아니라 advanced / integration-oriented example입니다.

이유:

- monitoring / alert / audit 흐름을 전제로 함
- `@obora/dashboard` package와 함께 보면 더 의미가 크지만, `obora dashboard` 자체는 현재 live CLI가 아님
- 기본 onboarding보다 운영/관찰 관점 예제에 가깝습니다

관련 분류 문서:

- `../README.md`

---

## What this example demonstrates

- monitoring-oriented workflow
- alert step with external gate and escalation
- policy-level notification gating
- persisted run / audit surface를 dashboard-like 관점에서 읽는 방법

파일 구성:

- `workflow.yaml` — monitoring workflow definition
- `policy.yaml` — alert/notification 관련 policy 예시

---

## Prerequisites

- Obora CLI installed
- provider auth configured
- `obora doctor`가 runnable 상태를 보여줌
- agent mappings configured: `collector`, `analyst`, `notifier`

처음 성공 경로가 아직이면 아래가 먼저입니다.

- `../hello-obora.yaml`
- `../01-simple-pipeline`
- `../07-contract-first-evaluation`

---

## Run

```bash
obora run examples/05-dashboard-monitoring/workflow.yaml --policy examples/05-dashboard-monitoring/policy.yaml --dry-run
obora run examples/05-dashboard-monitoring/workflow.yaml --policy examples/05-dashboard-monitoring/policy.yaml
```

실행 전 preview를 먼저 보는 이유:

```bash
obora run examples/05-dashboard-monitoring/workflow.yaml --policy examples/05-dashboard-monitoring/policy.yaml --dry-run
```

---

## How to verify results

현재 기준 기본 operator path는 dashboard launcher가 아니라 아래 CLI surface입니다.

```bash
obora status
obora runs list
obora inspect <runId>
obora audit query <runId>
```

즉 이 예제의 핵심은 아래입니다.

- pipeline이 `ingest -> analyze -> alert`로 실행되는지
- alert dispatch / escalation이 policy/gate 기준으로 제어되는지
- persisted run / step / audit records가 남는지

---

## Optional: inspect with dashboard package

dashboard package를 개발용으로 함께 보고 싶다면 example 차원에서 아래처럼 볼 수 있습니다.

```bash
pnpm --filter @obora/dashboard dev
```

중요:

- 이것은 package/dev-tool 수준의 optional path입니다.
- 현재 `obora dashboard`는 live top-level CLI surface가 아닙니다.
- 따라서 이 예제를 dashboard CLI revival의 근거로 읽으면 안 됩니다.

관련 기준 문서:

- `../../docs/support-scope.md`
- `../../docs/deferred-surface-revival-criteria.md`

---

## When to use this example

이 예제는 아래 상황에 적합합니다.

- monitoring / alert workflow를 보고 싶을 때
- audit/event 흐름을 운영 관점에서 보고 싶을 때
- dashboard package와 operator CLI surface의 관계를 함께 이해하고 싶을 때

아래 상황에는 비추천입니다.

- 처음 설치 후 첫 실행만 확인하려는 경우
- dashboard가 이미 live CLI라고 기대하는 경우

그 경우 먼저 `examples/README.md`의 onboarding bucket과 `docs/support-scope.md`를 보세요.
