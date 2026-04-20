# Agents Read-only CLI Contract

> For Hermes: 이 문서는 `obora agents` A2 read-only revival에 사용된 최소 계약 기록입니다. 현재 live `list/show` 구현은 이 문서를 baseline으로 삼고, 이후 변경도 이 계약을 기준으로 맞춥니다.

Goal: `obora agents`는 raw YAML mutation wrapper가 아니라 현재 A1 snapshot helper를 소비하는 read-only operator surface로 유지한다.

Architecture: CLI는 `@obora/adapters` / `@obora/sdk` helper를 소비하는 thin formatter여야 한다. config provenance는 adapters snapshot, execution-only source는 sdk snapshot이 소유한다. CLI는 YAML을 직접 파싱하거나 config file을 직접 수정하지 않는다.

Tech Stack: `packages/cli`, `handleCommandAction(...)`, `getGlobalOpts(this)`, `@obora/adapters` agent snapshot helper, `@obora/sdk` execution snapshot helper, current shared exit-code / error-hint contract

---

## 1. Why this contract exists

A1로 아래 foundation은 이미 생겼습니다.

- `AgentConfigResolver.snapshot(name)`
- `buildAgentResolutionSnapshot(...)`
- `buildExecutionAgentSnapshot(...)`
- `agentsPath` / workflow-local `agents` / runtime registration visibility

즉 이제 부족한 것은 “계산”이 아니라 “어떻게 보여줄 것인가”입니다.

A2에서 막아야 하는 것:

- legacy `set/reset` 재진입
- raw `.obora/config.yaml` / `~/.obora/config.yaml` 뷰를 runtime truth처럼 보여주는 것
- root `--json` / exit code / hint suppression 없는 half-modern command

---

## 2. Minimal ship scope

A2 최소 범위는 read-only 두 명령만 가정합니다.

```bash
obora agents list
obora agents list --json
obora agents show reviewer
obora agents show reviewer --json
obora --json agents show reviewer
```

Non-goals:

- `set`
- `reset`
- config file write preview
- merge/patch semantics
- provider/model catalog mutation
- workflow authoring UX 변경

한 줄 원칙:

- A2는 "설명"만 하고 "수정"하지 않습니다.

---

## 3. Command-level contract

### 3.1 `obora agents list`

Objective:

- 현재 작업 디렉터리 기준으로 operator가 볼 수 있는 agent name inventory를 compact summary로 보여준다.

Expected source coverage:

- adapters config-side names
  - global/project config agents
  - default fallback agent if relevant
- sdk execution-side names
  - `agentsPath`
  - workflow-local `agents` when an explicit workflow target is provided (for example `--workflow <path>`)
  - runtime registration only if the invocation context can truthfully provide it

Important:

- 기본 ship에서는 “지금 이 디렉터리에서 확인 가능한 source만” 보여준다.
- `--agents` / `--workflow`를 주면 그 explicit context까지 visibility 범위에 포함할 수 있다.
- runtime registration이 현재 invocation에 없으면 fake/placeholder 값을 만들지 않는다.

Text mode minimum fields:

- agent name
- resolved / unresolved status
- effective provider/model if resolved
- source badges
  - `config`
  - `agentsPath`
  - `workflow`
  - `runtime`
- warning count if non-zero

Example text shape:

```text
Agent inventory
- reviewer  resolved   openai/gpt-5         [config workflow]
- planner   resolved   anthropic/sonnet     [config]
- critic    unresolved                        [agentsPath] warnings=1
```

JSON minimum payload:

```json
{
  "command": "agents list",
  "mode": "summary",
  "agents": [
    {
      "name": "reviewer",
      "status": "resolved",
      "provider": "openai",
      "model": "gpt-5",
      "sources": {
        "config": true,
        "agentsPath": false,
        "workflow": true,
        "runtime": false
      },
      "warnings": []
    }
  ]
}
```

Notes:

- list payload는 compact summary여야 합니다.
- full provenance layer dump는 `show`에만 둡니다.

### 3.2 `obora agents show <agentName>`

Objective:

- 한 agent의 config provenance와 execution-only source를 함께 보여준다.

Text mode minimum sections:

1. overview

- agent name
- resolved / unresolved
- effective provider/model

2. config provenance

- built-in / auth-aware / global / project / provider / agent override layer 순서
- 각 layer가 실제로 적용한 key 요약

3. execution sources

- `agentsPath` presence
- workflow-local `agents` presence
- runtime registration presence

4. warnings / failure

- warning list
- unresolved failure code/message if present

Example text shape:

```text
Agent: reviewer
Status: resolved
Effective model: openai / gpt-5

Config provenance
- builtin-defaults: provider=pi-mono, model=pi-mono-1
- auth-aware-defaults: provider=openai, model=gpt-5
- project-agent: timeout=90

Execution sources
- agentsPath: absent
- workflow-agents: present
- runtime-registration: absent

Warnings
- none
```

JSON minimum payload:

```json
{
  "command": "agents show",
  "agentName": "reviewer",
  "status": "resolved",
  "base": {
    "resolved": {
      "provider": "openai",
      "model": "gpt-5",
      "timeout": 90
    },
    "layers": [
      {
        "kind": "project-agent",
        "label": "Project agent (reviewer)",
        "applied": {
          "timeout": 90
        }
      }
    ],
    "warnings": []
  },
  "executionSources": [
    {
      "kind": "workflow-agents",
      "label": "Workflow-local agents",
      "agentNames": ["reviewer"]
    }
  ],
  "effectiveExecutionView": {
    "agentName": "reviewer",
    "hasAgentsPathEntry": false,
    "hasWorkflowAgentEntry": true,
    "hasRuntimeRegistration": false
  }
}
```

Notes:

- JSON payload는 A1 helper shape와 최대한 가깝게 유지해 thin consumer 원칙을 지킨다.
- 다만 top-level `command`, `agentName`, `status` 같은 CLI-friendly envelope는 허용한다.

---

## 4. Operator semantics

### 4.1 Source-of-truth rule

`show` / `list`는 raw file view가 아니라 현재 runtime-relevant resolution view를 보여줘야 합니다.

즉:

- `.obora/config.yaml`만 읽은 결과를 final truth처럼 보여주면 안 됨
- `agentsPath` / workflow-local `agents` / runtime registration presence를 구분해야 함
- config provenance와 execution source provenance를 한 enum으로 합치지 않음

### 4.2 Text vs JSON rule

Text mode:

- 사람 기준 compact summary / layered explanation
- operator가 바로 읽을 수 있어야 함
- raw object dump 금지

JSON mode:

- machine-readable
- local `--json`과 root `obora --json ...` 모두 동일 contract
- text-only decoration 금지

### 4.3 Scope honesty rule

명령이 볼 수 없는 source는 추측하지 않습니다.

예:

- 현재 invocation에 workflow target이 없으면 workflow-local agent presence를 invented value로 채우지 않음
- runtime registration context가 없으면 `runtime=false` 또는 source omitted로 정직하게 표현

---

## 5. Error and exit-code contract

A2는 현재 shared CLI contract를 그대로 따라야 합니다.

Required wiring:

- `handleCommandAction(...)`
- `getGlobalOpts(this)`
- `CLIError`
- `ExitCode`

Exit codes:

- `0` success
- `2` validation error
- `3` execution failure

Validation error examples:

- unknown subcommand/argument shape
- `show` target missing
- unsupported option combination
- requested agent not found in any visible source

Execution failure examples:

- failed to load config
- failed to build adapters snapshot
- failed to load `agentsPath`
- failed to build sdk execution snapshot

Error-message rule:

- generic onboarding hint (`obora doctor`, `obora init --quickstart`, `obora run <workflow.yaml> --dry-run`)가 잘못 붙으면 안 됨
- `agents` command family는 `error-handler.ts`의 irrelevant hint suppression 대상에 포함돼야 함
- 필요하면 targeted hint는 허용
  - 예: `Run: obora agents list`

---

## 6. Implementation boundary rules

CLI must not:

- parse YAML directly inside the command implementation
- duplicate config layering logic
- duplicate `agentsPath` parsing logic
- write config files
- call legacy `_legacy/agents.ts`

CLI should:

- consume adapters/sdk helper output
- format text/json
- map errors to exit codes
- add only minimal envelope fields for CLI UX

Likely files if A2 is implemented later:

- create: `packages/cli/src/commands/agents.ts`
- modify: `packages/cli/src/cli.ts`
- test: `packages/cli/src/commands/__tests__/agents-contract.test.ts`
- test: `packages/cli/src/utils/__tests__/error-handler.test.ts`
- docs: `docs/cli.md`

---

## 7. Test contract that must exist before shipping

Minimum regression coverage:

1. `show --json` works
2. root `--json agents show ...` works
3. `list --json` works
4. text mode preserves compact human-readable output
5. missing agent -> exit code `2`
6. snapshot build/load failure -> exit code `3`
7. `process.exit(...)` not called directly
8. irrelevant generic onboarding hints are suppressed
9. command registration is deliberate and covered in CLI command tests

Recommended focused assertions:

- `show` JSON exposes base provenance and execution source separately
- `list` JSON is compact summary, not full layer dump
- root/local `--json` payload equality
- unresolved agent shows failure code/message without stack in non-verbose mode

---

## 8. Go / No-Go recommendation

Go only if:

1. repeated operator pain is specifically about agent visibility
2. A1 helper output already covers the needed sources without boundary breakage
3. the CLI can stay read-only and thin

No-Go if:

- the real request is mutation convenience
- runtime truth still depends on sources the command cannot honestly see
- onboarding/operator surface becomes noisier than current `doctor` / `models` / `auth`

Recommended release posture:

- A2 should ship only as read-only `list/show`
- A3 mutation discussion remains blocked until separate evidence appears
