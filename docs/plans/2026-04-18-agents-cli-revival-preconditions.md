# Obora Agents CLI Revival Preconditions

> For Hermes: 이 문서는 `obora agents`를 지금 바로 live CLI로 복구하라는 뜻이 아닙니다. 현재는 defer 유지가 기본값이고, 나중에 revival을 검토할 때 어떤 구현 milestone을 먼저 밟아야 하는지 정리한 preconditions 문서입니다.

Goal: `obora agents`를 단순 raw YAML mutation wrapper가 아니라, 현재 config resolution/runtime contract와 맞는 modern CLI surface로 다시 열 수 있는지 판단하는 단계별 기준을 정의한다.

Architecture anchors:

- legacy wrapper: `packages/cli/src/commands/_legacy/agents.ts`
- current resolution logic: `packages/adapters/src/agents/config-resolver.ts`
- current runtime usage: `packages/sdk/src/execution/workflow-runner.ts`

---

## Why this is not an active milestone yet

현재 기준으로 `agents`는 dashboard와 달리 즉시 product roadmap에 올라온 상태가 아닙니다.

이유:

- 현재 onboarding/operator path는 `doctor`, `models`, `auth`, config editing으로 충분히 설명 가능함
- legacy wrapper는 `.obora/config.yaml` / `~/.obora/config.yaml`를 raw YAML write로 직접 수정함
- current runtime은 `agents.yaml`, runtime `agentsPath`, workflow-local `agents`까지 함께 해석하므로 단순 CLI set/reset으로는 실제 resolution picture를 다 담기 어려움
- 즉 revival 필요성보다 먼저 “무엇을 보여주고 무엇을 수정할 것인가”를 product 계약으로 고정해야 함

따라서 이 문서는 roadmap이라기보다 revival preconditions 문서입니다.

---

## Current implementation facts that matter

### 1. Legacy CLI wrapper is mutation-heavy

`packages/cli/src/commands/_legacy/agents.ts` 기준 현재 wrapper는 아래 특징을 가집니다.

- `list/show/set/reset` 제공
- local/root `--json` 없음
- `handleCommandAction(...)` 없음
- `getGlobalOpts(this)` 없음
- exit code contract 없음
- project/global config file을 직접 읽고 직접 씀
- YAML partial write / merge / preview semantics 없음

즉 현재 구현은 modern live command가 아니라 helper script에 가깝습니다.

### 2. Read-side resolution exists and A1 snapshot foundation now exists

`packages/adapters/src/agents/config-resolver.ts` 기준 현재 존재하는 것은 아래입니다.

- global defaults
- project defaults
- provider-level defaults
- global agents override
- project agents override
- auth-aware provider fallback
- `AgentConfigResolver.snapshot(name)`
- `packages/adapters/src/agents/resolution-snapshot.ts`의 base provenance snapshot builder

즉 “resolved agent config”를 계산하는 핵심과 base snapshot contract는 이미 존재합니다.

추가로 execution-only source는 아래처럼 분리 구현됐습니다.

- `packages/sdk/src/agents/execution-resolution-snapshot.ts`
- `packages/sdk/src/agents/source-loaders.ts`

즉 A1 수준의 package/helper foundation은 구현됐고, 현재 남은 것은 아래입니다.

- read-only CLI introspection payload/formatting contract
- CLI-safe exit code / hint suppression / root `--json` 정합성
- 실제 operator pain이 A2까지 갈 만큼 반복되는지 판단

### 3. Runtime path already combines multiple agent sources

`packages/sdk/src/execution/workflow-runner.ts` 기준 실제 실행 경로는 아래 source를 함께 본다.

- `agentsPath`로 들어오는 YAML
- workflow one-file/graph 내부 `agents`
- runtime-registered agents

즉 향후 `obora agents`가 생기더라도 `.obora/config.yaml`만 보여주거나 수정하면 실제 runtime behavior와 문서가 다시 어긋날 가능성이 큽니다.

---

## Milestone ladder

### A0. Default state: keep deferred

현재 기본 상태는 이것입니다.

- `obora agents`는 live top-level command가 아님
- config 변경은 `.obora/config.yaml` 편집이 기준
- visibility는 `doctor`, `models`, `auth`, docs로 보완

Go/No-Go:

- repeated operator pain이 증명되기 전까지는 여기서 멈추는 것이 기본

### A1. Package-level resolution snapshot foundation

Status:

- 구현 완료

Implemented surface:

- adapters base snapshot
  - `packages/adapters/src/agents/resolution-snapshot.ts`
  - `packages/adapters/src/agents/config-resolver.ts`
  - `packages/adapters/src/config/types.ts`
- sdk execution augmentation
  - `packages/sdk/src/agents/execution-resolution-snapshot.ts`
  - `packages/sdk/src/agents/source-loaders.ts`
  - `packages/sdk/src/execution/workflow-runner.ts`
- tests
  - `packages/adapters/src/__tests__/agents/resolution-snapshot.test.ts`
  - `packages/sdk/src/__tests__/agents/execution-resolution-snapshot.test.ts`

관련 문서:

- `docs/plans/2026-04-18-agents-resolution-snapshot-helper-design.md`
- `docs/plans/2026-04-18-agents-resolution-snapshot-implementation-plan.md`

What A1 now guarantees:

- CLI 없이도 테스트 가능한 typed snapshot contract 존재
- 어떤 값이 어디서 왔는지 operator-readable 하게 설명 가능
- adapters와 sdk 경계를 유지한 채 execution source까지 분리 설명 가능
- resolution failure가 generic string throw와 별도 snapshot failure shape로 정리됨

### A2. Read-only CLI introspection candidate

Objective:

- 실제 pain이 visibility 부족이라면 mutation보다 먼저 read-only surface를 검토

Candidate UX:

```bash
obora agents list
obora agents show reviewer
obora agents show reviewer --json
obora --json agents show reviewer
```

Requirements:

- `handleCommandAction(...)`
- `getGlobalOpts(this)`
- local/root `--json`
- irrelevant hint suppression
- source provenance가 보이는 payload
- `doctor`와 역할 분리 설명 가능

Acceptance criteria:

- 현재 resolved state를 operator가 직접 확인하는 가치가 명확함
- raw file view가 아니라 runtime-relevant resolution view를 보여줌
- docs/cli.md에 올려도 onboarding 혼동이 늘지 않음

### A3. Safe override surface only if repeated operator need exists

Objective:

- set/reset은 read-only introspection 이후에도 실제 운영 pain이 반복될 때만 검토

Candidate UX:

```bash
obora agents set reviewer --provider openai --model gpt-5.4
obora agents reset reviewer
```

Requirements:

- project/global scope contract 명확화
- write preview 또는 dry-run 성격 검토
- merge/conflict semantics 정리
- invalid provider/model validation
- partial write failure 대응
- current runtime resolution model과 충돌하지 않음

Acceptance criteria:

- 단순 YAML write wrapper가 아님
- operator가 실제로 자주 쓰는 반복 작업을 줄임
- docs/tests/gate 유지 비용을 감당할 가치가 있음

---

## Recommended order if revival ever resumes

1. A0 유지 여부 확인
2. A1 helper existing surface 재사용
   - implementation record: `docs/plans/2026-04-18-agents-resolution-snapshot-helper-design.md`
   - task plan / verification trail: `docs/plans/2026-04-18-agents-resolution-snapshot-implementation-plan.md`
3. 필요 시에만 A1 output / error taxonomy 추가 고정
4. A2 read-only CLI 필요성 판단
5. 필요할 때만 A2 구현
6. mutation need가 입증된 뒤에만 A3 검토

즉 `set/reset`부터 다시 여는 접근은 금지에 가깝게 보는 편이 맞습니다.

---

## Explicit non-goals

이 문서가 다루지 않는 것:

- agent execution semantics 자체 재설계
- `agents.yaml` schema overhaul
- workflow-local `agents` authoring UX 전면 변경
- provider/model catalog 정책 변경

이 문서는 오직 `obora agents`를 live CLI surface로 다시 열 수 있는지 판단하기 위한 선행 milestone만 다룹니다.

---

## Go / No-Go rule

아래 둘이 같이 나오기 전에는 구현 시작하지 않습니다.

1. 반복되는 operator pain이 “agent resolution visibility” 또는 “safe override UX”로 명확히 식별됨
2. A1 수준의 package/helper contract가 먼저 생김

그 전까지는 defer 유지가 정답입니다.
