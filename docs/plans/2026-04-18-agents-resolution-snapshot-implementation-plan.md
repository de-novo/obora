# Agents Resolution Snapshot Helper Implementation Plan

> **For Hermes:** Use this plan only after confirming A0 still needs to advance to A1. Implement task-by-task with small commits. Do not add a live `obora agents` command in this plan.

**Goal:** Add a typed read-only agent resolution snapshot foundation so future `agents` visibility work can explain both config provenance and execution-time sources without reviving the legacy YAML mutation wrapper.

**Architecture:** Keep the current package boundary intact. `@obora/adapters` owns base config-resolution provenance. `@obora/sdk` augments that base snapshot with execution-only sources such as `agentsPath`, workflow-local `agents`, and runtime registration. `@obora/cli` does nothing in this plan.

**Tech Stack:** Vitest, TypeScript, `@obora/adapters`, `@obora/sdk`, YAML config resolution, existing `WorkflowRunner` execution path

---

## Task 1: Add failing adapters contract tests for base resolution snapshots

**Objective:** Pin the base snapshot contract before writing implementation.

**Files:**

- Create: `packages/adapters/src/__tests__/agents/resolution-snapshot.test.ts`
- Inspect: `packages/adapters/src/agents/config-resolver.ts`
- Inspect: `packages/adapters/src/config/types.ts`

**Step 1: Write failing test for layer provenance order**

```ts
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { AgentConfigResolver } from "../../agents/config-resolver.js";

async function withIsolatedResolver(
  testFn: (ctx: {
    homeDir: string;
    projectDir: string;
    cwdBefore: string;
    homeBefore: string | undefined;
  }) => Promise<void>
) {
  const homeDir = await mkdtemp(join(tmpdir(), "obora-agents-home-"));
  const projectDir = await mkdtemp(join(tmpdir(), "obora-agents-project-"));
  const cwdBefore = process.cwd();
  const homeBefore = process.env.HOME;

  process.env.HOME = homeDir;
  process.chdir(projectDir);

  try {
    await testFn({ homeDir, projectDir, cwdBefore, homeBefore });
  } finally {
    process.chdir(cwdBefore);
    if (homeBefore === undefined) delete process.env.HOME;
    else process.env.HOME = homeBefore;
  }
}

describe("agent resolution snapshot", () => {
  afterEach(() => {
    delete process.env.TEST_ANTHROPIC_KEY;
  });

  it("captures layered provenance from global/project/provider/agent config", async () => {
    await withIsolatedResolver(async ({ homeDir, projectDir }) => {
      await mkdir(join(homeDir, ".obora"), { recursive: true });
      await writeFile(
        join(homeDir, ".obora", "config.yaml"),
        [
          "defaults:",
          "  provider: anthropic",
          "providers:",
          "  anthropic:",
          "    defaultModel: claude-opus-4-6",
          "agents:",
          "  reviewer:",
          "    temperature: 0.2",
        ].join("\n"),
        "utf-8"
      );

      await mkdir(join(projectDir, ".obora"), { recursive: true });
      await writeFile(
        join(projectDir, ".obora", "config.yaml"),
        ["defaults:", "  model: claude-opus-4-5", "agents:", "  reviewer:", "    timeout: 90"].join(
          "\n"
        ),
        "utf-8"
      );

      process.env.TEST_ANTHROPIC_KEY = "anthropic-key";
      const resolver = await AgentConfigResolver.create(projectDir);
      const snapshot = resolver.snapshot("reviewer");

      expect(snapshot.status).toBe("resolved");
      expect(snapshot.resolved.provider).toBe("anthropic");
      expect(snapshot.resolved.model).toBe("claude-opus-4-5");
      expect(snapshot.layers.map((layer) => layer.kind)).toEqual([
        "builtin-defaults",
        "auth-aware-defaults",
        "global-defaults",
        "project-defaults",
        "global-provider",
        "project-provider",
        "global-agent",
        "project-agent",
      ]);
    });
  });
});
```

**Step 2: Write failing test for unresolved status instead of generic string-comparison error**

```ts
it("returns structured unresolved snapshot when provider/model cannot be determined", async () => {
  await withIsolatedResolver(async ({ projectDir }) => {
    const resolver = await AgentConfigResolver.create(projectDir);
    const snapshot = resolver.snapshot("missing-agent");

    expect(snapshot.status).toBe("unresolved");
    expect(snapshot.failure?.code).toBe("provider-model-required");
    expect(snapshot.warnings.length).toBeGreaterThan(0);
  });
});
```

**Step 3: Run tests to verify failure**

Run:

```bash
pnpm --filter @obora/adapters exec vitest run src/__tests__/agents/resolution-snapshot.test.ts
```

Expected: FAIL — `snapshot` contract/types do not exist yet.

**Step 4: Commit test scaffold after implementation later, not now**

Do not commit until the task passes.

---

## Task 2: Add adapters types for base resolution snapshots

**Objective:** Introduce the typed base snapshot contract in adapters.

**Files:**

- Modify: `packages/adapters/src/config/types.ts`
- Modify: `packages/adapters/src/agents/index.ts`
- Create: `packages/adapters/src/agents/resolution-snapshot.ts`

**Step 1: Add new types to `config/types.ts`**

```ts
export type AgentResolutionSourceKind =
  | "builtin-defaults"
  | "auth-aware-defaults"
  | "global-defaults"
  | "project-defaults"
  | "global-provider"
  | "project-provider"
  | "global-agent"
  | "project-agent";

export interface AgentResolutionLayer {
  kind: AgentResolutionSourceKind;
  label: string;
  applied: Partial<AgentConfig>;
  notes?: string[];
}

export interface AgentResolutionFailure {
  code: "provider-model-required";
  message: string;
}

export interface AgentResolutionSnapshot {
  agentName: string;
  status: "resolved" | "unresolved";
  resolved: Partial<AgentConfig>;
  layers: AgentResolutionLayer[];
  warnings: string[];
  failure?: AgentResolutionFailure;
}
```

**Step 2: Extend the resolver contract**

```ts
export interface AgentConfigResolverContract {
  resolve(agentName: string): AgentConfig;
  resolveForStep(agentName: string, override?: AgentStepOverride): AgentConfig;
  listAgents(): Array<{ name: string; config: AgentConfig }>;
  snapshot(agentName: string): AgentResolutionSnapshot;
}
```

**Step 3: Export the new helper surface**

```ts
// packages/adapters/src/agents/index.ts
export * from "./config-resolver";
export * from "./resolution-snapshot";
```

**Step 4: Run typecheck to verify compile surface**

Run:

```bash
pnpm --filter @obora/adapters typecheck
```

Expected: may still fail until Task 3 wires implementation.

---

## Task 3: Implement adapters base snapshot builder

**Objective:** Build the actual provenance snapshot from existing config resolution logic without breaking current `resolve()` behavior.

**Files:**

- Create: `packages/adapters/src/agents/resolution-snapshot.ts`
- Modify: `packages/adapters/src/agents/config-resolver.ts`
- Test: `packages/adapters/src/__tests__/agents/resolution-snapshot.test.ts`

**Step 1: Add helper to apply and record layers**

```ts
function pushLayer(
  layers: AgentResolutionLayer[],
  kind: AgentResolutionSourceKind,
  label: string,
  patch?: Partial<AgentConfig>
) {
  if (!patch || Object.keys(patch).length === 0) return;
  layers.push({ kind, label, applied: patch });
}
```

**Step 2: Implement a pure builder in `resolution-snapshot.ts`**

```ts
export function buildAgentResolutionSnapshot(input: {
  agentName: string;
  globalConfig: AgentConfigFile;
  projectConfig: AgentConfigFile;
  authAwareDefaults: Partial<AgentConfig>;
  builtinDefaults: AgentConfig;
}): AgentResolutionSnapshot {
  // build layers in the same order as resolve()
  // return unresolved status instead of throwing when provider/model is missing
}
```

Required behavior:

- use the same precedence order as current `resolve()`
- keep `resolved` as the merged result so far
- add warnings/failure instead of generic runtime string errors
- do not add execution-only sources here

**Step 3: Reuse the snapshot in `config-resolver.ts`**

```ts
snapshot(agentName: string): AgentResolutionSnapshot {
  return buildAgentResolutionSnapshot({
    agentName,
    globalConfig: this.globalConfig,
    projectConfig: this.projectConfig,
    authAwareDefaults: this.authAwareDefaults,
    builtinDefaults: BUILTIN_DEFAULTS,
  });
}

resolve(agentName: string): AgentConfig {
  const snapshot = this.snapshot(agentName);
  if (snapshot.status !== "resolved" || !snapshot.resolved.provider || !snapshot.resolved.model) {
    throw new Error(`Unable to resolve agent config for '${agentName}': provider/model is required`);
  }
  return snapshot.resolved as AgentConfig;
}
```

Note: keep the old thrown error text for compatibility in this slice unless a test proves we can safely change it.

**Step 4: Run adapters tests**

Run:

```bash
pnpm --filter @obora/adapters exec vitest run src/__tests__/agents/resolution-snapshot.test.ts
pnpm --filter @obora/adapters test
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/adapters/src/config/types.ts \
  packages/adapters/src/agents/index.ts \
  packages/adapters/src/agents/resolution-snapshot.ts \
  packages/adapters/src/agents/config-resolver.ts \
  packages/adapters/src/__tests__/agents/resolution-snapshot.test.ts
git commit -m "feat(adapters): add agent resolution snapshots"
```

---

## Task 4: Add failing SDK tests for execution source augmentation

**Objective:** Pin the sdk layer that augments the base snapshot with execution-only sources.

**Files:**

- Create: `packages/sdk/src/__tests__/agents/execution-resolution-snapshot.test.ts`
- Inspect: `packages/sdk/src/execution/workflow-runner.ts`
- Inspect: `packages/sdk/src/index.ts`

**Step 1: Write failing test for `agentsPath` + workflow-local agents + runtime registration**

```ts
import { describe, expect, it } from "vitest";

import type { AgentFactory } from "../runtime.js";
import { buildExecutionAgentSnapshot } from "../agents/execution-resolution-snapshot.js";

describe("execution-agent-resolution-snapshot", () => {
  it("adds execution-only sources on top of adapters base snapshot", async () => {
    const runtimeAgents = new Map<string, AgentFactory>([
      ["runtime-reviewer", () => ({ role: "Runtime Reviewer" })],
    ]);

    const snapshot = await buildExecutionAgentSnapshot({
      cwd: process.cwd(),
      agentName: "reviewer",
      agentsPath: undefined,
      workflow: {
        agents: {
          reviewer: {
            role: "Workflow Reviewer",
            provider: "openai",
            model: "gpt-5",
          },
        },
      },
      runtimeAgents,
    });

    expect(snapshot.base.agentName).toBe("reviewer");
    expect(snapshot.executionSources.map((source) => source.kind)).toEqual([
      "workflow-agents",
      "runtime-registration",
    ]);
  });
});
```

**Step 2: Run test to verify failure**

Run:

```bash
pnpm --filter @obora/sdk exec vitest run src/__tests__/agents/execution-resolution-snapshot.test.ts
```

Expected: FAIL — helper/module does not exist yet.

---

## Task 5: Implement SDK execution augmentation helper

**Objective:** Build the sdk layer that augments adapters base snapshots with execution-only sources, without coupling adapters to execution concerns.

**Files:**

- Create: `packages/sdk/src/agents/execution-resolution-snapshot.ts`
- Modify: `packages/sdk/src/index.ts`
- Test: `packages/sdk/src/__tests__/agents/execution-resolution-snapshot.test.ts`

**Step 1: Define sdk-only execution source types**

```ts
export type ExecutionAgentSourceKind = "agents-path" | "workflow-agents" | "runtime-registration";

export interface ExecutionAgentSource {
  kind: ExecutionAgentSourceKind;
  label: string;
  agentNames: string[];
  notes?: string[];
}

export interface ExecutionAgentSnapshot {
  base: AgentResolutionSnapshot;
  executionSources: ExecutionAgentSource[];
  effectiveExecutionView: {
    agentName: string;
    hasAgentsPathEntry: boolean;
    hasWorkflowAgentEntry: boolean;
    hasRuntimeRegistration: boolean;
  };
}
```

**Step 2: Reuse existing YAML parsing behavior instead of duplicating new semantics**

Use `WorkflowRunner.loadAgentsFromYaml()` logic as the source of truth for `agentsPath` parsing. If needed, extract a shared helper first instead of copy-pasting YAML parsing twice.

Recommended minimal extraction:

- Create a small helper used by both `WorkflowRunner` and the new snapshot builder.

**Step 3: Export the helper from sdk public surface**

```ts
export { buildExecutionAgentSnapshot } from "./agents/execution-resolution-snapshot.js";
export type {
  ExecutionAgentSource,
  ExecutionAgentSourceKind,
  ExecutionAgentSnapshot,
} from "./agents/execution-resolution-snapshot.js";
```

**Step 4: Run sdk tests**

Run:

```bash
pnpm --filter @obora/sdk exec vitest run src/__tests__/agents/execution-resolution-snapshot.test.ts
pnpm --filter @obora/sdk test
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/sdk/src/agents/execution-resolution-snapshot.ts \
  packages/sdk/src/index.ts \
  packages/sdk/src/__tests__/agents/execution-resolution-snapshot.test.ts
git commit -m "feat(sdk): add execution agent resolution snapshots"
```

---

## Task 6: Add regression tests that protect package boundaries

**Objective:** Ensure future refactors do not collapse adapters and sdk responsibilities back together.

**Files:**

- Modify: `packages/adapters/src/__tests__/agents/resolution-snapshot.test.ts`
- Modify: `packages/sdk/src/__tests__/agents/execution-resolution-snapshot.test.ts`

**Step 1: Add adapters-only boundary assertion**

```ts
it("does not include execution-only sources in adapters snapshot", async () => {
  const resolver = await AgentConfigResolver.create(projectDir);
  const snapshot = resolver.snapshot("reviewer");
  expect("executionSources" in snapshot).toBe(false);
});
```

**Step 2: Add sdk composite assertion**

```ts
it("keeps base config provenance under base snapshot while execution sources stay separate", async () => {
  expect(snapshot.base.layers.length).toBeGreaterThan(0);
  expect(snapshot.executionSources.length).toBeGreaterThan(0);
});
```

**Step 3: Run targeted tests**

```bash
pnpm --filter @obora/adapters exec vitest run src/__tests__/agents/resolution-snapshot.test.ts
pnpm --filter @obora/sdk exec vitest run src/__tests__/agents/execution-resolution-snapshot.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add packages/adapters/src/__tests__/agents/resolution-snapshot.test.ts \
  packages/sdk/src/__tests__/agents/execution-resolution-snapshot.test.ts
git commit -m "test: guard agents resolution snapshot boundaries"
```

---

## Task 7: Update docs after implementation lands

**Objective:** Keep the design/preconditions docs aligned with the implemented helper surface.

**Files:**

- Modify: `docs/plans/2026-04-18-agents-cli-revival-preconditions.md`
- Modify: `docs/plans/2026-04-18-agents-resolution-snapshot-helper-design.md`
- Optional Modify: `docs/deferred-surface-revival-criteria.md`

**Step 1: Replace future-tense wording where implementation is now real**

Example edits:

```md
- A1 helper placement draft exists

* A1 helper exists in adapters/sdk split form
```

**Step 2: Record exact exported helpers and test paths**

Add:

- adapters exported snapshot helper path
- sdk exported execution snapshot helper path
- test file paths

**Step 3: Verify docs formatting**

```bash
pnpm exec prettier --check \
  docs/plans/2026-04-18-agents-cli-revival-preconditions.md \
  docs/plans/2026-04-18-agents-resolution-snapshot-helper-design.md
```

**Step 4: Commit**

```bash
git add docs/plans/2026-04-18-agents-cli-revival-preconditions.md \
  docs/plans/2026-04-18-agents-resolution-snapshot-helper-design.md
git commit -m "docs: record agents resolution snapshot implementation"
```

---

## Verification checklist

- [ ] adapters exposes a typed base `snapshot()` contract
- [ ] sdk exposes execution augmentation without moving config provenance ownership out of adapters
- [ ] no new live `obora agents` command is added in this plan
- [ ] targeted adapters/sdk tests pass
- [ ] workspace tests pass
- [ ] `git diff --check` passes
- [ ] docs still match package boundary decisions

## Final verification commands

Run in order:

```bash
pnpm --filter @obora/adapters exec vitest run src/__tests__/agents/resolution-snapshot.test.ts
pnpm --filter @obora/sdk exec vitest run src/__tests__/agents/execution-resolution-snapshot.test.ts
pnpm --filter @obora/adapters test
pnpm --filter @obora/sdk test
pnpm exec prettier --check docs/plans/2026-04-18-agents-cli-revival-preconditions.md docs/plans/2026-04-18-agents-resolution-snapshot-helper-design.md
.git/hooks/pre-push  # if safe to simulate locally, otherwise rely on actual push gate
```

If local hook simulation is not appropriate, use:

```bash
git diff --check
```

## Commit sequence recommendation

1. `feat(adapters): add agent resolution snapshots`
2. `feat(sdk): add execution agent resolution snapshots`
3. `test: guard agents resolution snapshot boundaries`
4. `docs: record agents resolution snapshot implementation`

This keeps the eventual implementation history understandable and reviewable.
