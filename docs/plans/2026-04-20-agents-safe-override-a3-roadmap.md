# Obora Agents Safe Override A3 Roadmap

> **For Hermes:** 이 문서는 원래 `obora agents` mutation surface를 열기 전 A3 구현 계획으로 작성되었습니다. 현재 `set/reset`은 이 문서를 기준으로 live 구현되었고, 문서는 구현 기록과 후속 확장 기준으로 유지합니다. read-only A2 contract를 깨지 말고, `@obora/adapters`에 mutation ownership을 두고 `@obora/cli`는 thin operator surface로만 유지하세요.

**Goal:** `obora agents set/reset`를 raw YAML wrapper가 아니라 preview 가능한 safe override surface로 도입한다.

**Architecture:** 현재 live `obora agents`는 `packages/cli/src/commands/agents.ts`가 adapters/sdk helper를 소비하는 read-only thin consumer입니다. A3에서도 같은 원칙을 유지해야 하므로, config file mutation ownership은 CLI가 아니라 `@obora/adapters`에 둡니다. CLI는 scope 선택, preview 출력, confirmation-free deterministic execution, exit code contract만 담당하고 YAML parse/write/merge는 package helper가 맡아야 합니다.

**Tech Stack:** `packages/adapters`, `packages/cli`, `yaml`, `packages/adapters/src/agents/config-resolver.ts`, `packages/cli/src/commands/agents.ts`, `packages/cli/src/utils/error-handler.ts`, Vitest, repo review gate

---

## Implementation status

현재 구현 사실:

- A1: adapters/sdk split 기반 resolution snapshot helper 구현 완료
- A2: live `obora agents list/show` 구현 완료
- A3: live `obora agents set/reset` 구현 완료
- adapters는 preview helper + atomic apply helper를 소유함
- CLI는 thin formatter + exit code contract만 담당함
- 현재 runtime truth는 config뿐 아니라 `agentsPath`, workflow-local `agents`, runtime registration도 함께 보며, mutation은 config-layer only로 제한됨

즉 A3에서 해결해야 했던 핵심은 “쓰기 기능 추가” 자체가 아니라 아래였고, 현재 구현도 그 원칙을 따릅니다.

1. 무엇을 수정하는지 operator에게 정직하게 설명할 것
2. config-layer override만 바꾸고 execution-only source와 혼동하지 않을 것
3. preview / validation / failure contract 없이 raw write를 다시 열지 않을 것

---

## North star UX

허용 가능한 목표 UX는 아래 정도입니다.

```bash
obora agents set reviewer --provider openai --model gpt-5.4
obora agents set reviewer --provider openai --model gpt-5.4 --scope global --json
obora agents set reviewer --provider anthropic --model claude-sonnet-4 --dry-run
obora agents reset reviewer
obora agents reset reviewer --scope global --json
obora --json agents reset reviewer --scope global
```

성공 시 원칙:

- text 모드: target scope, target file, mutation preview, next verification command 출력
- json 모드: machine-readable preview/result payload 반환
- `set`은 config-layer override만 수정함
- `reset`은 해당 scope의 agent override만 제거함
- execution-only source(`--agents`, `--workflow`, runtime registration)는 mutation 대상으로 취급하지 않음

명시적 비목표:

- workflow-local `agents` 수정
- `agents.yaml` 수정
- runtime registration 수정
- interactive prompt
- partial arbitrary YAML patch surface
- provider auth 저장/갱신

---

## Current code anchors

Mutation 설계 시 기준 파일:

- legacy reference only
  - `packages/cli/src/commands/_legacy/agents.ts`
- current live read-only command
  - `packages/cli/src/commands/agents.ts`
- current generic CLI contracts
  - `packages/cli/src/utils/error-handler.ts`
  - `packages/cli/src/utils/cli-error.ts`
  - `packages/cli/src/utils/exit-codes.ts`
- current config provenance owner
  - `packages/adapters/src/agents/config-resolver.ts`
  - `packages/adapters/src/config/types.ts`
- current config loading semantics
  - `packages/sdk/src/config-loader.ts`
- current model catalog surface
  - `packages/cli/src/commands/models.ts`
  - `packages/adapters/src/llm/pi-ai-adapter.ts`

중요 관찰:

- `packages/sdk/src/config-loader.ts`에는 merge/read semantics가 있지만 safe write helper는 없음
- legacy `_legacy/agents.ts`는 `YAML.stringify(config)`로 whole-file rewrite를 수행함
- 현재 live `agents` command는 execution-only visibility까지 보여주지만 mutation은 config-layer만 건드려야 함

---

## Required A3 contract

### 1. Scope honesty

`set/reset`은 아래 둘만 허용합니다.

- `project` → `<cwd>/.obora/config.yaml`
- `global` → `~/.obora/config.yaml`

반드시 payload/text에 아래를 포함합니다.

- chosen scope
- target config path
- affected agent name
- config-layer only mutation이라는 설명

### 2. Preview-first behavior

A3는 interactive confirmation 대신 deterministic preview를 기본으로 둡니다.

최소 요구:

- `--dry-run` 지원
- text preview: before/after override summary
- json preview: machine-readable patch summary
- next verification command 예시
  - `obora agents show <name>`
  - 필요 시 `obora doctor`

### 3. Validation before write

쓰기 전에 최소 아래를 검증합니다.

- scope 유효성 (`project|global`)
- agent name 비어 있지 않음
- `set`은 `--provider`, `--model` 둘 다 필요
- provider가 현재 catalog/provider set 안에서 유효한지
- model이 해당 provider 기준으로 유효한지
- unsupported provider/model이면 `ExitCode.VALIDATION_ERROR`

### 4. Atomic file write

직접 whole-file overwrite를 하더라도 최소 아래는 필요합니다.

- parent dir ensure
- parse existing YAML once
- unrelated top-level keys 보존
- temp file write 후 rename 같은 atomic-ish flow
- write 실패 시 partial/truncated config 방지

### 5. Reset semantics

`reset`은 “agent 전체 삭제”가 아니라 아래로 고정합니다.

- target scope config의 `agents.<name>` entry 제거
- 제거 후 빈 `agents:` map이 되면 cleanup 여부를 helper contract로 명시
- 다른 scope/global/project override에는 영향 없음
- execution-only source에는 영향 없음

### 6. Error and hint contract

A3 error는 generic onboarding hint를 띄우면 안 됩니다.

추가될 가능성이 높은 error family:

- invalid agents scope
- provider/model pair required
- unsupported provider override target
- unsupported model override target
- failed to preview agent override
- failed to write agent override
- failed to reset agent override

`packages/cli/src/utils/error-handler.ts`의 suppression list까지 같이 갱신해야 합니다.

---

## Recommended implementation order

### Task 1: Freeze the mutation contract in docs first

**Objective:** 구현 전에 A3 contract를 문서로 고정해 legacy raw-write 회귀를 막습니다.

**Files:**

- Create: `docs/plans/2026-04-20-agents-safe-override-a3-roadmap.md`
- Modify: `docs/deferred-surface-revival-criteria.md`
- Modify: `docs/plans/2026-04-18-agents-cli-revival-preconditions.md`

**Step 1: Add the roadmap doc**

아래 내용을 포함합니다.

- scope honesty
- preview-first behavior
- config-layer only mutation
- atomic write requirement
- non-goals
- exact task order

**Step 2: Link the roadmap from criteria docs**

추가 링크:

- `docs/deferred-surface-revival-criteria.md`
- `docs/plans/2026-04-18-agents-cli-revival-preconditions.md`

**Step 3: Verify docs diff**

Run: `git diff -- docs/plans/2026-04-20-agents-safe-override-a3-roadmap.md docs/deferred-surface-revival-criteria.md docs/plans/2026-04-18-agents-cli-revival-preconditions.md`
Expected: only A3 roadmap + link alignment changes

### Task 2: Add adapters-side mutation types and preview contract

**Objective:** CLI가 YAML mutation 세부 구현을 몰라도 되도록 adapters에 write-plan contract를 추가합니다.

**Files:**

- Modify: `packages/adapters/src/config/types.ts`
- Create: `packages/adapters/src/agents/config-mutation.ts`
- Modify: `packages/adapters/src/index.ts`
- Test: `packages/adapters/src/__tests__/agents/config-mutation.test.ts`

**Step 1: Write failing tests for preview-only behavior**

테스트 시나리오 최소 4개:

1. project scope set preview
2. global scope reset preview
3. unsupported provider/model validation failure
4. unrelated top-level YAML keys preserved in planned output

예시 assertion shape:

```ts
expect(preview).toMatchObject({
  action: "set",
  scope: "project",
  agentName: "reviewer",
  targetPath: expect.stringContaining(".obora/config.yaml"),
  before: { provider: "openai", model: "gpt-4.1" },
  after: { provider: "openai", model: "gpt-5.4" },
});
```

**Step 2: Add contract types**

예시 타입:

```ts
export type AgentMutationScope = "project" | "global";

export interface AgentOverridePreview {
  action: "set" | "reset";
  scope: AgentMutationScope;
  agentName: string;
  targetPath: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  warnings: string[];
}
```

**Step 3: Implement preview builder only**

초기 단계에서는 write보다 preview를 먼저 구현합니다.

핵심 규칙:

- existing YAML parse
- unrelated top-level keys 보존
- `agents.<name>` patch 결과 계산
- provider/model validation 수행

**Step 4: Run targeted tests**

Run: `pnpm --filter @obora/adapters exec vitest run src/__tests__/agents/config-mutation.test.ts`
Expected: PASS

### Task 3: Add adapters-side atomic write helper

**Objective:** preview contract 위에 실제 write/reset 실행 helper를 올립니다.

**Files:**

- Modify: `packages/adapters/src/agents/config-mutation.ts`
- Test: `packages/adapters/src/__tests__/agents/config-mutation.test.ts`

**Step 1: Extend tests for real writes**

추가 시나리오:

- set writes new agent override into missing config file
- reset removes only target agent entry
- write keeps `defaults/providers/persistence/...` intact
- write failure does not leave truncated file

**Step 2: Implement atomic write flow**

권장 shape:

```ts
const tempPath = `${targetPath}.tmp`;
await writeFile(tempPath, nextYaml, "utf-8");
await rename(tempPath, targetPath);
```

실제 구현에서는 temp cleanup failure도 고려합니다.

**Step 3: Export helper from adapters public surface**

주의:

- public export 추가 후 downstream CLI 검증 전에 adapters build artifact부터 갱신

**Step 4: Verify**

Run:

```bash
pnpm --filter @obora/adapters exec vitest run src/__tests__/agents/config-mutation.test.ts
pnpm --filter @obora/adapters exec tsc --noEmit
pnpm --filter @obora/adapters build
```

Expected: PASS

### Task 4: Add CLI contract tests before implementing `set/reset`

**Objective:** live CLI surface가 modern contract를 지키도록 tests로 먼저 고정합니다.

**Files:**

- Modify: `packages/cli/src/commands/__tests__/agents-contract.test.ts`
- Modify: `packages/cli/src/commands/__tests__/cli-commands.test.ts`
- Modify: `packages/cli/src/utils/__tests__/error-handler.test.ts`

**Step 1: Add failing tests for success payloads**

최소 시나리오:

- `agents set reviewer --provider openai --model gpt-5.4 --dry-run --json`
- `agents reset reviewer --json`
- root `obora --json agents set ...`

예시 payload shape:

```json
{
  "command": "agents set",
  "mode": "preview",
  "scope": "project",
  "agentName": "reviewer",
  "targetPath": "/repo/.obora/config.yaml",
  "before": { "provider": "openai", "model": "gpt-4.1" },
  "after": { "provider": "openai", "model": "gpt-5.4" },
  "warnings": []
}
```

**Step 2: Add failing tests for validation/failure paths**

최소 시나리오:

- missing provider/model pair
- invalid scope
- unsupported provider
- unsupported model
- write failure → execution failed

**Step 3: Add suppression tests**

`error-handler.test.ts`에 mutation-specific errors가 generic onboarding hint를 띄우지 않는지 고정합니다.

**Step 4: Run tests and confirm failure**

Run: `pnpm --filter @obora/cli exec vitest run src/commands/__tests__/agents-contract.test.ts src/utils/__tests__/error-handler.test.ts`
Expected: FAIL before implementation

### Task 5: Implement live `agents set/reset` as thin CLI consumers

**Objective:** CLI는 adapters mutation helper를 호출하고 formatting만 담당합니다.

**Files:**

- Modify: `packages/cli/src/commands/agents.ts`
- Modify: `packages/cli/src/utils/error-handler.ts`

**Step 1: Add local command options**

예시:

```ts
.command("set <name>")
.option("--provider <provider>")
.option("--model <model>")
.option("--scope <scope>", "project|global", "project")
.option("--dry-run")
.option("--json")
```

```ts
.command("reset <name>")
.option("--scope <scope>", "project|global", "project")
.option("--dry-run")
.option("--json")
```

**Step 2: Keep CLI validation/operator UX thin**

CLI responsibility만 허용:

- local/root `--json`
- text/json formatting
- `handleCommandAction(...)`
- `CLIError` / `ExitCode`
- next verification command 안내

금지:

- YAML parse/write
- mutation merge logic
- provider/model catalog source-of-truth 직접 소유

**Step 3: Text output minimum shape**

예시:

```text
Agent override preview
- action: set
- scope: project
- target: /repo/.obora/config.yaml
- agent: reviewer
- before: provider=openai, model=gpt-4.1
- after: provider=openai, model=gpt-5.4
- next: obora agents show reviewer
```

**Step 4: Run targeted CLI verification**

Run:

```bash
pnpm --filter @obora/cli exec vitest run src/commands/__tests__/agents-contract.test.ts src/commands/__tests__/cli-commands.test.ts src/utils/__tests__/error-handler.test.ts
pnpm --filter @obora/cli exec tsc --noEmit
pnpm --filter @obora/cli build
```

Expected: PASS

### Task 6: Add isolated smoke tests and doc alignment

**Objective:** operator-facing behavior와 문서를 같이 마감합니다.

**Files:**

- Modify: `README.md`
- Modify: `packages/cli/README.md`
- Modify: `docs/cli.md`
- Modify: `docs/current-capabilities.md`
- Modify: `docs/support-scope.md`
- Modify: `docs/deferred-surface-revival-criteria.md`

**Step 1: Run isolated smoke checks**

패턴:

- isolated `HOME`
- isolated project dir
- `.obora/config.yaml` fixture 생성
- `node packages/cli/bin/obora.js agents set ... --dry-run`
- `node packages/cli/bin/obora.js agents reset ... --dry-run --json`

**Step 2: If real write mode is enabled, verify file contents**

체크 포인트:

- unrelated YAML keys preserved
- project/global scope path respected
- `agents show <name>` output matches written override

**Step 3: Run formatting + diff checks**

Run:

```bash
pnpm exec prettier --check README.md packages/cli/README.md docs/cli.md docs/current-capabilities.md docs/support-scope.md docs/deferred-surface-revival-criteria.md packages/cli/src/commands/agents.ts packages/cli/src/commands/__tests__/agents-contract.test.ts packages/cli/src/utils/error-handler.ts packages/cli/src/utils/__tests__/error-handler.test.ts packages/adapters/src/config/types.ts packages/adapters/src/agents/config-mutation.ts packages/adapters/src/__tests__/agents/config-mutation.test.ts
git diff --check
```

Expected: PASS

### Task 7: Full gate verification before push

**Objective:** pre-push review gate와 실제 regression 범위를 끝까지 확인합니다.

**Files:**

- none beyond prior tasks

**Step 1: Run package-level commands in safe order**

```bash
pnpm --filter @obora/adapters exec vitest run src/__tests__/agents/config-mutation.test.ts
pnpm --filter @obora/adapters exec tsc --noEmit
pnpm --filter @obora/adapters build
pnpm --filter @obora/cli exec vitest run src/commands/__tests__/agents-contract.test.ts src/commands/__tests__/cli-commands.test.ts src/utils/__tests__/error-handler.test.ts
pnpm --filter @obora/cli exec tsc --noEmit
pnpm --filter @obora/cli build
```

**Step 2: Run review gate**

Run: `bash scripts/review-gate.sh`
Expected: deprecated scan / ban pattern / typecheck / tests / sandbox smoke / build all pass

**Step 3: Only then commit/push**

예시:

```bash
git add docs/ packages/adapters/ packages/cli/
git commit -m "feat(cli): add safe agents override commands"
```

push는 승인 후만 진행합니다.

---

## Pitfalls to avoid

- `_legacy/agents.ts`의 YAML rewrite helper를 그대로 복사하지 말 것
- CLI가 `.obora/config.yaml` 구조를 직접 소유하지 말 것
- `agentsPath` / workflow-local `agents`까지 mutation 범위에 넣지 말 것
- `set` 하나로 provider만 바꾸고 model을 암묵 추론하는 UX를 기본 계약으로 두지 말 것
- write 성공 후 verification path를 빼먹지 말 것
- adapters public export 추가 뒤 adapters build 전에 downstream CLI 타입검사를 돌리지 말 것

---

## Recommendation right now

현재는 이 roadmap을 구현 기록 + 확장 기준으로 유지하는 것이 맞습니다.

즉 다음 후속 질문이 남습니다.

- `agents set/reset` text/json payload를 더 다듬어야 하는가?
- provider-only/model-only override 같은 추가 contract가 필요한가?
- docs/onboarding에서 mutation surface를 더 전면에 노출할 가치가 있는가?

이 질문에 따라 후속 A3.x 슬라이스를 이어가면 됩니다.
