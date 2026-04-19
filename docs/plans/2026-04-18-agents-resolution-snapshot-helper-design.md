# Agents Resolution Snapshot Helper Design

> For Hermes: 이 문서는 `obora agents` revival의 A1 단계에서 필요한 resolution snapshot helper를 어느 패키지에 둘지 결정하기 위한 설계 초안입니다. 아직 구현 지시가 아니라 package boundary를 먼저 고정하는 문서입니다.

Goal: agent resolution visibility를 위한 typed snapshot contract를 만들 때, 어떤 책임을 `@obora/adapters`가 맡고 어떤 책임을 `@obora/sdk`가 맡아야 하는지 정리한다.

Architecture: read-side config resolution의 핵심은 이미 `@obora/adapters`에 있고, execution-time source(`agentsPath`, workflow-local `agents`, runtime registration) 결합은 `@obora/sdk`의 `WorkflowRunner`에 있다. 따라서 snapshot helper는 단일 패키지에 몰아넣지 말고, base snapshot은 adapters에, execution augmentation은 sdk에 두는 2-layer 구조가 가장 안전하다.

Tech Stack: `@obora/adapters`, `@obora/sdk`, YAML config loader, runtime workflow loading path, current docs for deferred-surface revival

Implementation plan:

- `docs/plans/2026-04-18-agents-resolution-snapshot-implementation-plan.md`

---

## 1. 문제 정의

A1 목표는 아래입니다.

- CLI 없이도 테스트 가능한 typed snapshot contract
- 어떤 값이 어디서 왔는지 source provenance 포함
- `doctor`보다 더 세밀한 agent resolution visibility 제공 가능
- 이후 read-only `obora agents show`의 기반이 되는 package/helper 제공

현재 문제는 resolution source가 한 패키지에만 있지 않다는 점입니다.

### 현재 source 분포

1. `@obora/adapters`

- global config
- project config
- provider defaults
- auth-aware fallback
- global/project agent overrides

2. `@obora/sdk`

- `agentsPath` YAML
- workflow-local `agents`
- runtime-registered agents

즉 “현재 실제 실행에 가까운 agent picture”는 adapters 하나만으로는 부족하고, sdk 하나만으로는 config provenance를 다시 구현하게 됩니다.

---

## 2. 현재 코드 기준 사실

### 2.1 adapters가 이미 가진 것

핵심 파일:

- `packages/adapters/src/agents/config-resolver.ts`
- `packages/adapters/src/config/types.ts`

현재 `AgentConfigResolver`는 아래 layering을 이미 계산합니다.

1. built-in defaults + auth-aware defaults
2. global defaults
3. project defaults
4. global provider layer
5. project provider layer
6. global agent override
7. project agent override

즉 config-resolution의 SSOT는 현재 adapters 쪽입니다.

### 2.2 sdk가 이미 가진 것

핵심 파일:

- `packages/sdk/src/execution/workflow-runner.ts`
- `packages/sdk/src/runtime-types.ts`

`WorkflowRunner.buildEngine()`는 실행 시 아래 source를 추가로 합칩니다.

- `config.agentsPath`
- workflow-local `agents`
- runtime-registered `agents`

즉 execution-time agent source 결합의 SSOT는 현재 sdk 쪽입니다.

### 2.3 CLI는 아직 read-only contract가 아님

핵심 파일:

- `packages/cli/src/commands/_legacy/agents.ts`

현재 wrapper는 raw YAML mutation helper에 가깝고, A1 helper를 둘 위치로는 부적절합니다.

결론:

- adapters = base resolution owner
- sdk = execution context owner
- cli = consumer여야 함

---

## 3. 패키지 배치 옵션 비교

### Option A. 전부 adapters에 둔다

장점:

- read-side logic를 한곳에 모을 수 있음
- CLI가 adapters만 보고도 일부 정보를 가져올 수 있음

단점:

- `agentsPath`, workflow-local `agents`, runtime registration`은 현재 sdk/execution 영역임
- adapters가 sdk/runtime execution concern을 흡수하게 됨
- package boundary가 흐려짐

판단:

- 비추천

### Option B. 전부 sdk에 둔다

장점:

- execution에 가까운 전체 picture를 한 번에 만들 수 있음
- 향후 runtime preview와 결합하기 쉬움

단점:

- adapters의 existing config-resolution logic를 다시 감싸거나 재노출해야 함
- config provenance SSOT가 sdk로 밀려 경계가 흐려짐
- CLI read-only surface를 위해 sdk 의존이 과도해질 수 있음

판단:

- 단독 배치로는 비추천

### Option C. adapters base snapshot + sdk execution augmentation

장점:

- 현재 코드 경계와 가장 자연스럽게 맞음
- config provenance는 adapters가 소유
- execution-specific source는 sdk가 소유
- 이후 CLI는 최종 composite만 소비하면 됨

단점:

- 타입/계약을 2층으로 설계해야 함
- 문서화가 약하면 구현자가 헷갈릴 수 있음

판단:

- 권장

---

## 4. 권장 구조

### 4.1 adapters가 소유할 것

권장 위치:

- Create: `packages/adapters/src/agents/resolution-snapshot.ts`
- Modify: `packages/adapters/src/agents/index.ts`
- Modify: `packages/adapters/src/config/types.ts`

adapters가 소유해야 하는 이유:

- 현재 config layering의 SSOT가 adapters임
- auth/global/project/provider/agent override provenance를 가장 정확히 설명할 수 있음
- execution concern 없이도 테스트 가능한 read-only contract를 만들 수 있음

권장 계약 초안:

- `AgentResolutionSnapshot`
- `AgentResolutionLayer`
- `AgentResolutionSourceKind`
- `buildAgentResolutionSnapshot(...)`
- `AgentConfigResolver.snapshot(name)` 또는 동등 helper

snapshot에는 최소한 아래가 들어가야 합니다.

- resolved config
- layers[]
  - source kind
  - source label
  - applied fields
- warnings[]
- failure info (provider/model missing 등)

### 4.2 sdk가 소유할 것

권장 위치:

- Create: `packages/sdk/src/agents/execution-resolution-snapshot.ts`
- Modify: `packages/sdk/src/index.ts`
- Optional Modify: `packages/sdk/src/execution/workflow-runner.ts`

sdk가 소유해야 하는 이유:

- `agentsPath`, workflow-local `agents`, runtime registration`은 execution context concern임
- adapters에 두면 execution-specific dependency가 역류함
- 향후 run preview / dry-run / inspect surface와 연결하기 쉬움

권장 계약 초안:

- `ExecutionAgentSnapshot`
- `ExecutionAgentSource`
- `buildExecutionAgentSnapshot(...)`

이 helper는 adapters의 base snapshot을 받아 아래를 덧붙입니다.

- `agentsPath` source
- workflow-local `agents`
- runtime-registered agents
- 최종 execution-facing merged view

### 4.3 CLI는 나중에 소비만 한다

권장 위치:

- future: `packages/cli/src/commands/agents.ts`

CLI는 아래만 해야 합니다.

- global/root `--json`
- text/json formatting
- exit code mapping
- irrelevant hint suppression

즉 A1 단계에서 CLI가 snapshot source를 직접 읽거나 YAML을 파싱하면 안 됩니다.

---

## 5. 권장 타입 분리

### adapters layer

권장 개념:

- `AgentResolutionSourceKind`
  - `builtin-defaults`
  - `auth-aware-defaults`
  - `global-defaults`
  - `project-defaults`
  - `global-provider`
  - `project-provider`
  - `global-agent`
  - `project-agent`

- `AgentResolutionLayer`
  - `kind`
  - `label`
  - `applied`
  - `notes?`

- `AgentResolutionSnapshot`
  - `agentName`
  - `resolved`
  - `layers`
  - `warnings`
  - `status`

### sdk layer

권장 개념:

- `ExecutionAgentSourceKind`
  - `agents-path`
  - `workflow-agents`
  - `runtime-registration`

- `ExecutionAgentSource`
  - `kind`
  - `label`
  - `agentNames`
  - `notes?`

- `ExecutionAgentSnapshot`
  - `base`: adapters snapshot
  - `executionSources`
  - `effectiveExecutionView`

중요:

- config provenance와 execution source provenance를 같은 enum으로 억지 통합하지 않는 편이 낫습니다.
- 둘은 층위가 다르기 때문입니다.

---

## 6. 구현 순서 권장안

### Step 1. adapters에 base snapshot 추가

범위:

- `AgentConfigResolver.resolve()` 로직을 재사용
- provenance layer를 함께 반환하는 read-only helper 추가
- 기존 `resolve()` / `listAgents()`와 중복 최소화

완료 기준:

- 특정 agent에 대해 “어떤 값이 어디서 왔는지”를 adapters 단위 테스트로 증명 가능

### Step 2. adapters failure taxonomy 정리

범위:

- 현재 generic `Error`를 snapshot-friendly failure shape로 정리
- missing provider/model 같은 경우를 structured warning/failure로 표현 가능하게 함

완료 기준:

- future CLI가 string 비교 없이 failure category를 처리 가능

### Step 3. sdk에 execution augmentation helper 추가

범위:

- `agentsPath`, workflow-local `agents`, runtime registration source를 합친 execution snapshot 제공
- `WorkflowRunner` 내부 구현과 중복 최소화

완료 기준:

- future read-only CLI가 실제 execution-relevant visibility를 제공할 수 있음

### Step 4. CLI 도입 여부는 그 다음 판단

범위:

- A1 helper만으로 operator pain이 줄어드는지 확인
- 필요 시 A2 read-only CLI로 진행

완료 기준:

- package/helper contract가 먼저 안정화됨

---

## 7. 추천 파일 배치 요약

### A1 최소 구현 시

adapters:

- Create: `packages/adapters/src/agents/resolution-snapshot.ts`
- Modify: `packages/adapters/src/agents/config-resolver.ts`
- Modify: `packages/adapters/src/agents/index.ts`
- Modify: `packages/adapters/src/config/types.ts`
- Test: `packages/adapters/src/__tests__/agents/resolution-snapshot.test.ts`

sdk:

- Create: `packages/sdk/src/agents/execution-resolution-snapshot.ts`
- Modify: `packages/sdk/src/index.ts`
- Test: `packages/sdk/src/__tests__/agents/execution-resolution-snapshot.test.ts`

문서:

- Modify: `docs/plans/2026-04-18-agents-cli-revival-preconditions.md`
- Optional Modify: `docs/deferred-surface-revival-criteria.md`

---

## 8. 최종 권고

한 줄 권고:

- base config-resolution snapshot은 `@obora/adapters`
- execution-layer augmentation은 `@obora/sdk`
- `@obora/cli`는 나중에 그 결과를 보여주는 thin consumer

즉 A1 helper의 “첫 소유권”은 adapters에 두되, 실제 revival-ready snapshot은 sdk가 execution context를 덧붙이는 2-layer 구조가 가장 맞습니다.

이렇게 해야 아래를 동시에 만족합니다.

- 현재 코드 경계 보존
- provenance 설명력 확보
- future read-only CLI 확장 가능
- yaml mutation helper로 되돌아가지 않음
