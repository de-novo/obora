# Codebase Review - 2026-05-08

## Scope

- Repository: `/Users/novo/Desktop/denovo/obora`
- Review date: 2026-05-08 Asia/Seoul
- Review target: whole monorepo, release gates, coverage, dependency policy, deprecated usage, functional/planning drift, and functional-programming migration readiness.
- Review rule: detections below are based on commands run against the current checkout. Speculative items are marked as plans, not verified facts.

## Verification Summary

| Gate                                   | Result | Notes                                                                                                                                                                        |
| -------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                       | PASS   | 5 package typecheck tasks completed.                                                                                                                                         |
| `pnpm lint`                            | PASS   | Existing lint gate passed before the review-gate fixes.                                                                                                                      |
| `pnpm test`                            | PASS   | 5 workspace packages passed: adapters 181, runtime 1224, sdk 805, dashboard 211, cli 630 tests. Required local port binding because dashboard server tests bind `127.0.0.1`. |
| `pnpm verify:coverage`                 | PASS   | Every package is now above 90% for statements, branches, functions, and lines. Required local port binding because dashboard tests bind `127.0.0.1`.                         |
| `pnpm build`                           | PASS   | All 5 build tasks passed.                                                                                                                                                    |
| `pnpm verify:smoke`                    | PASS   | Passed with local port binding allowed; the pure sandbox blocks dashboard bootstrap listen with `EPERM`.                                                                     |
| `pnpm verify:release`                  | PASS   | Passed after the doc-snippet verifier stopped generating deprecated TS 6 `baseUrl`.                                                                                          |
| `pnpm verify:compat`                   | PASS   | Compat/deprecation inventory is tracked by allowlist.                                                                                                                        |
| `pnpm verify:test-type-debt`           | PASS   | SDK/CLI/runtime test type debt allowlist is empty.                                                                                                                           |
| `pnpm verify:deps`                     | PASS   | Package manifests reject deprecated pi packages and drift in managed dependency ranges.                                                                                      |
| `pnpm verify:functional`               | PASS   | File-level ratchet is locked at `mutableBinding=0/0`, `loopStatement=0/0`, 0 baseline entries.                                                                               |
| `pnpm verify:sdk-public-api`           | PASS   | SDK no-console and public API snapshot passed.                                                                                                                               |
| `pnpm audit --audit-level moderate`    | PASS   | No known vulnerabilities found.                                                                                                                                              |
| `bash scripts/review-gate-selftest.sh` | PASS   | Selftest now covers coverage-output exclusion and canonical sandbox artifact smoke.                                                                                          |
| `bash scripts/review-gate.sh`          | PASS   | Passed with local port binding allowed; the pure sandbox blocks dashboard tests on `127.0.0.1` listen with `EPERM`.                                                          |

## Coverage Evidence

`pnpm verify:coverage` now reports every package above 90% for statements, branches, functions, and lines. `scripts/coverage/thresholds.json` enforces 90% branch floors for runtime, CLI, and dashboard, so the previous branch-coverage debt is now blocked by the gate.

| Package            | Statements | Branches | Functions |  Lines |
| ------------------ | ---------: | -------: | --------: | -----: |
| `@obora/sdk`       |     97.03% |   91.34% |    97.46% | 97.52% |
| `@obora/runtime`   |     94.92% |   90.17% |    95.29% | 95.15% |
| `@obora/adapters`  |     96.25% |   92.28% |    98.24% | 96.88% |
| `@obora/cli`       |     95.78% |   90.05% |    97.42% | 96.47% |
| `@obora/dashboard` |     94.07% |   90.14% |    93.67% | 94.21% |

The enforced branch floors are now at least 90 for every package in `scripts/coverage/thresholds.json`.

### 2026-05-15 Ops Coverage Update

`pnpm verify:coverage` now includes `@obora/ops` in `scripts/coverage/report.mjs` and `scripts/coverage/thresholds.json`.

| Package            | Statements | Branches | Functions |  Lines |
| ------------------ | ---------: | -------: | --------: | -----: |
| `@obora/sdk`       |     97.03% |   91.34% |    97.46% | 97.52% |
| `@obora/runtime`   |     94.90% |   90.19% |    95.22% | 95.13% |
| `@obora/adapters`  |     96.25% |   92.28% |    98.24% | 96.88% |
| `@obora/cli`       |     95.78% |   90.05% |    97.42% | 96.47% |
| `@obora/dashboard` |     94.07% |   90.14% |    93.67% | 94.21% |
| `@obora/ops`       |     99.00% |   90.00% |    98.03% | 98.78% |

## Findings

### RG-001 - Review gate scanned generated coverage HTML

- Severity: P1 fixed
- Evidence: after coverage was generated, `bash scripts/review-gate.sh` failed on `packages/sdk/coverage/execution/tkg-promotion-engine.ts.html` because generated HTML contained the text `as any`.
- Root cause: `scripts/review-gate.sh` excluded `.git`, `node_modules`, and `dist`, but not `coverage` or `.coverage`.
- Fix applied:
  - `scripts/review-gate.sh` now excludes `coverage` and `.coverage` directories from deprecated and ban scans.
  - `scripts/review-gate-selftest.sh` now creates a generated coverage artifact containing `as any` and verifies the review gate ignores it.
- Verification:
  - `bash scripts/review-gate-selftest.sh`: PASS
  - `bash scripts/review-gate.sh`: PASS

### RG-002 - Sandbox smoke depended on ignored log files

- Severity: P1 fixed
- Evidence: `bash scripts/review-gate.sh` reached sandbox smoke and failed with `verify.sh: missing file: .../sandbox/07-project-loop/output/iterations/logs/run.log`.
- Root cause: `.review-gate.local.sh` ran sandbox `verify.sh` scripts that require `output/iterations/logs/*.log`, but `.gitignore` ignores `*.log`. A clean checkout can have tracked result JSON and final artifacts without the log files, so the pre-push gate was not reproducible.
- Fix applied:
  - Added `scripts/release/verify-canonical-sandbox-smoke.mjs`.
  - Updated `.review-gate.local.sh` to run `node scripts/release/verify-canonical-sandbox-smoke.mjs`.
  - The new smoke verifies 21 canonical sandbox directories, required root files, workflow YAML presence, final artifacts, result JSON validity, exactly one completed workflow result per sandbox, and completed step result consistency.
  - `scripts/review-gate-selftest.sh` now verifies this smoke passes from tracked artifacts.
- Verification:
  - `node scripts/release/verify-canonical-sandbox-smoke.mjs`: PASS
  - `bash scripts/review-gate-selftest.sh`: PASS
  - `bash scripts/review-gate.sh`: PASS with local port binding allowed.

### RG-003 - Deprecated external packages were first-class dependencies

- Severity: P1 fixed
- Evidence:
  - `pnpm outdated -r --format json` marks `@mariozechner/pi-agent-core` and `@mariozechner/pi-ai` as deprecated.
  - Registry replacement text says to use `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai`.
  - Original package manifests:
    - `packages/adapters/package.json`: `@mariozechner/pi-agent-core` and `@mariozechner/pi-ai` at `^0.65.0`
    - `packages/runtime/package.json`: `@mariozechner/pi-agent-core` and `@mariozechner/pi-ai` at `^0.65.0`
  - `npm view @earendil-works/pi-ai version dist-tags --json` and `npm view @earendil-works/pi-agent-core version dist-tags --json` report latest `0.74.0`.
- Usage surface:
  - Runtime agent bridge: `packages/runtime/src/cell/agents/roles/base-agent.ts`
  - Adapter LLM bridge: `packages/adapters/src/llm/pi-ai-adapter.ts`, `packages/adapters/src/llm/factory.ts`
  - Built-in skill/tool typing: `packages/adapters/src/skills/**`, `packages/adapters/src/tools/types.ts`
  - Bundling: `packages/runtime/tsup.config.ts`, `packages/adapters/tsup.config.ts`
  - Documentation: `docs/cli.md` referenced the old runtime catalog name.
- Fix applied:
  - Runtime/adapters manifests, source imports, tests, mocks, and tsup `noExternal` entries now use `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` at `^0.74.0`.
  - `docs/cli.md` now names `@earendil-works/pi-ai`.
  - The current `@earendil-works/pi-ai` `KnownProvider` no longer includes the old `google-gemini-cli` and `google-antigravity` provider ids, so those Obora provider aliases now map to the current `google` catalog while preserving the public adapter id.
  - `scripts/release/verify-dependency-policy.mjs` now blocks reintroducing `@mariozechner/pi-agent-core` or `@mariozechner/pi-ai` in package manifests.
- Verification:
  - `pnpm --filter @obora/adapters typecheck`: PASS
  - `pnpm --filter @obora/adapters test`: PASS
  - `pnpm --filter @obora/runtime typecheck`: PASS
  - `pnpm outdated -r --format json`: `{}` with registry access

### RG-004 - EffectTS was not part of the implementation baseline

- Severity: P2 partially fixed
- Evidence:
  - Initial `rg -n '"effect"|"@effect/' package.json packages/*/package.json` returned no package manifest hits.
  - Effect-like source matches are domain policy fields such as `effect: allow/deny`, not EffectTS usage.
- Fix applied:
  - `packages/runtime` now depends on `effect@^3.21.2`.
  - Workflow parse/validate has an Effect boundary via `parseAndValidateEffect`.
  - The existing synchronous `parseAndValidate` API remains backward-compatible by running the Effect boundary synchronously.
  - `AGENTS.md` now requires new workflow validation, policy evaluation, config parsing, and step-execution boundaries to consider additive EffectTS APIs first.
- Remaining plan:
  1. Expand Effect usage into workflow validation internals, policy evaluation, config parsing, and step execution.
  2. Keep new Effect APIs additive until public API migration is explicitly planned.
  3. Convert high-value mutable internals only after behavior-preserving tests are in place.

### RG-005 - `let` and loop-statement policy debt is removed

- Severity: P2 fixed
- Evidence:
  - Original review baseline was `mutableBinding=314/314`, `loopStatement=501/501`, 187 file entries.
  - Before the final cleanup pass, the ratchet was `mutableBinding=301/301`, `loopStatement=422/422`, 180 file entries.
  - `pnpm verify:functional:update`: `[PASS] functional policy baseline updated: mutableBinding=301->0, loopStatement=422->0, files=180->0.`
  - `pnpm verify:functional`: `[PASS] functional policy file baselines respected: mutableBinding=0/0, loopStatement=0/0, files=0.`
- Fix applied:
  - Added `scripts/release/verify-functional-policy.mjs`.
  - Added `scripts/release/functional-policy-baseline.json`.
  - Added `pnpm verify:functional`.
  - Release verification now runs the functional policy gate.
  - The gate compares per-file counts, so new source files have a zero budget and existing files may only decrease their counts unless the baseline is intentionally rebaselined.
  - The remaining production/test/script functional-policy entries across SDK, runtime, adapters, CLI, dashboard, and release scripts were refactored to `const`, recursive helpers, array/object combinators, and small pure helpers.
  - `scripts/release/functional-policy-baseline.json` was reduced to zero entries with `pnpm verify:functional:update`.
  - `AGENTS.md` now records the zero-baseline rule so future source TypeScript and JavaScript do not reintroduce `let` or loop statements.
- Current state:
  - `pnpm verify:functional`: PASS with `mutableBinding=0/0`, `loopStatement=0/0`, 0 file baseline entries.
  - Reintroducing `let` or loop statements in scanned source now fails the release gate through `pnpm verify:functional`.

### RG-006 - Test type debt allowlist existed

- Severity: P2 fixed
- Evidence:
  - `scripts/release/test-type-debt-allowlist.txt` previously allowed SDK/CLI test `as any` debt.
  - `pnpm verify:test-type-debt`: PASS.
- Fix applied:
  - Removed all SDK/CLI allowlist entries.
  - Replaced broad test casts with typed fixtures, `vi.mocked`, concrete test doubles, and narrow `unknown as ConcreteType` boundaries where external interfaces require them.
  - `scripts/release/test-type-debt-allowlist.txt` is now only the header row.
- Current state:
  - SDK/CLI/runtime remain clean under `pnpm verify:test-type-debt`.
  - Future `as any`, `@ts-ignore`, or `@ts-expect-error` debt in those surfaces fails the gate unless an explicit allowlist entry is added.

### RG-007 - Public/internal deprecated surfaces remain intentionally retained

- Severity: P2 planned
- Evidence:
  - `scripts/release/compat-allowlist.txt` marks several surfaces as `deprecate`.
  - Source examples include:
    - `packages/adapters/src/skills/types.ts`: `OboraSkill.tools` replacement
    - `packages/adapters/src/tools/registry.ts`: `toToolDefinitions` replacement
    - `packages/adapters/src/tools/types.ts`: `ToolCall` replacement
    - `packages/runtime/src/blackboard/core/accessors/state-accessor.ts`: `getBusyAgentCount` replacement
    - `packages/runtime/src/blackboard/core/accessors/decisions-accessor.ts`: `getAgentOpinion` replacement
    - `packages/runtime/src/blackboard/core/accessors/knowledge-accessor.ts`: counter getter replacements
    - `packages/runtime/src/blackboard/types/knowledge.ts`: `source` replacement
- Current state:
  - `pnpm verify:compat` passes, so these are tracked compatibility decisions, not hidden drift.
- Plan:
  1. Create a breaking-cleanup milestone and remove or isolate `deprecate` entries in one release lane.
  2. Add migration notes for every public replacement.
  3. Keep `keep` entries separate from `deprecate` entries so compatibility behavior is not mistaken for old API debt.

### RG-008 - Dependency major upgrade lane completed

- Severity: P2 fixed / monitor
- Evidence:
  - Before the upgrade, `pnpm outdated -r --format json` reported patch/minor updates and major updates for `@eslint/js`, `@fastify/cors`, `@types/node`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `@vitest/coverage-v8`, `eslint`, `globals`, `react`, `react-dom`, `typescript`, `vite`, and `vitest`.
  - After the upgrade, `pnpm outdated -r --format json` returned `{}` with registry access.
  - `pnpm audit --audit-level moderate`: PASS.
- Fix applied:
  - Patch/minor lane updated `@typescript-eslint/*`, `prettier`, `yaml`, `zod`, `@playwright/test`, `better-sqlite3`, `turbo`, and `ws`.
  - Deprecated package lane migrated `@mariozechner/*` to `@earendil-works/*`.
  - Major lane updated TypeScript 6, Vitest 4, Vite 8, React 19, ESLint 10, Fastify CORS 11, Node types 25, and matching peer/tooling ranges.
  - Removed TS `baseUrl` usage from repo tsconfigs and the doc-snippet verifier so TS 6 release checks pass.
- Current state:
  - Dependency policy, typecheck, test, build, smoke, review-gate, and release verification all pass.
  - `pnpm outdated -r --format json`: `{}` with registry access on 2026-05-08.
  - Monitor future package payload-size impact after runtime/adapters dependency changes.

### RG-009 - Dependency version management is manual

- Severity: P3 fixed
- Evidence:
  - Duplicate package specs are mostly consistent today; the intentionally different TypeScript specs are root/runtime dev dependency `^6.0.3` versus runtime peer dependency `>=5.0.0`.
  - The workspace does not use a centralized pnpm catalog for shared version ranges.
- Fix applied:
  - Attempted pnpm catalog first, but `packageManager: pnpm@9.0.0` does not support `catalog:` specs in this checkout.
  - Added `scripts/release/verify-dependency-policy.mjs` instead.
  - Added `pnpm verify:deps`.
  - Release verification now runs the dependency policy gate.
  - The gate enforces managed ranges for shared tooling/runtime packages and rejects deprecated `@mariozechner/pi-*` package manifests.

### RG-010 - Functional/planning drift is mostly controlled, but sandbox gate semantics needed correction

- Severity: P2 fixed/planned
- Evidence:
  - `docs/current-capabilities.md` and `docs/support-scope.md` correctly distinguish live CLI support from deferred dashboard CLI support.
  - Canonical sandbox docs and tests describe runtime-native loops.
  - The broken sandbox smoke meant the plan existed and artifacts existed, but the pre-push verification path did not actually work from tracked files.
- Fix applied:
  - RG-002 replaced ignored-log-dependent verification with tracked artifact smoke in `review-gate`.
- Remaining plan:
  1. Keep live runtime verification (`verify.sh --fresh`) as an explicit manual or scheduled gate when log-level runtime re-entry proof is required.
  2. Keep review-gate artifact smoke fast and clean-checkout reproducible.
  3. Document whether a sandbox check is artifact integrity, workflow contract, or real runtime execution.

### RG-011 - Local sandbox restrictions affect server-based tests

- Severity: P3 operational
- Evidence:
  - `pnpm verify:coverage`, `pnpm verify:smoke`, and `bash scripts/review-gate.sh` can fail inside the filesystem/network sandbox when dashboard tests attempt to listen on `127.0.0.1`.
  - The same commands passed when run with local port binding allowed.
- Plan:
  1. Keep documenting server-binding gates as local-runtime gates, not pure sandbox gates.
  2. If CI needs a stricter split, separate dashboard no-listen unit tests from server/bootstrap tests.
  3. Do not mark these as product failures unless they fail outside the sandbox.
  4. `AGENTS.md` now requires recording both the sandbox `EPERM` and the successful local-runtime result.

## Improvement Roadmap

### Phase 0 - Completed in this review

- Exclude generated coverage artifacts from review-gate scans.
- Replace ignored-log-dependent sandbox smoke with tracked artifact smoke.
- Update review-gate selftest coverage for both fixes.
- Refresh `docs/release-readiness.md` with the current verified SDK branch coverage.
- Migrate deprecated `@mariozechner/pi-ai` and `@mariozechner/pi-agent-core` to `@earendil-works/*`.
- Add dependency and functional policy gates to release verification.
- Add the first runtime Effect boundary.
- Remove SDK/CLI test type debt allowlist entries.
- Raise runtime, CLI, and dashboard branch coverage to 90% or higher and enforce 90% branch floors.
- Restore existing dashboard policy editing by wiring the existing-policy save button to `updatePolicy`.
- Add root `AGENTS.md` guardrails for coverage, type debt, functional TypeScript, EffectTS boundaries, dependency freshness, compat inventory, and sandbox/local-runtime proof.

### Phase 1 - Zero-baseline enforcement

- Keep the `verify:functional` baseline at zero.
- Keep `verify:test-type-debt` allowlist empty.
- Keep dependency policy ranges current after every package update.

### Phase 2 - Provider migration hardening

- Add provider-level smoke for the `google-gemini-cli` and `google-antigravity` aliases that now map to the current `google` pi-ai catalog.
- Keep `@mariozechner/pi-*` blocked by `verify:deps`.
- Monitor `@earendil-works/pi-*` package payload and provider catalog changes during release verification.
- Keep publish source maps excluded unless a release explicitly needs them; `verify-publish-packages` now fails if `.map` files enter publish payloads.

### Phase 3 - EffectTS expansion

- Expand the runtime Effect boundary from parse/validate into workflow validation internals.
- Recommended next targets: policy evaluation, config parsing, or SDK step execution.
- Define conversion patterns before touching broad runtime orchestration.

### Phase 4 - Type/test debt cleanup

- Keep test type debt at zero.
- Add typed builders before broadening execution-controller, orchestrator, or TKG service tests.
- Keep `verify:test-type-debt` hard.

### Phase 5 - Completed major dependency upgrade lane

- Major tooling has been upgraded and release-gate proof is recorded in this review.
- Keep future major dependency updates in isolated lanes with `pnpm outdated -r --format json`, `pnpm verify:deps`, and `pnpm verify:release` evidence.

## Commands Used As Evidence

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm verify:coverage
pnpm build
pnpm verify:smoke
pnpm verify:release
pnpm verify:compat
pnpm verify:deps
pnpm verify:functional
pnpm verify:test-type-debt
pnpm verify:sdk-public-api
pnpm audit --audit-level moderate
pnpm outdated -r --format json
npm view @earendil-works/pi-ai version dist-tags --json
npm view @earendil-works/pi-agent-core version dist-tags --json
bash scripts/review-gate-selftest.sh
node scripts/release/verify-canonical-sandbox-smoke.mjs
bash scripts/review-gate.sh
rg --count-matches '\blet\b' packages scripts --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/coverage/**' --glob '!**/.coverage/**'
rg --count-matches '\bfor\s*(await\s*)?\(' packages scripts --glob '!**/node_modules/**' --glob '!**/dist/**' --glob '!**/coverage/**' --glob '!**/.coverage/**'
rg -n '"effect"|"@effect/' package.json packages/*/package.json
rg -n '@deprecated' packages/runtime/src packages/adapters/src packages/sdk/src packages/cli/src --glob '!**/__tests__/**'
```

## Final Follow-up Evidence

These commands were rerun after the debt cleanup in this follow-up:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm verify:coverage
pnpm build
pnpm verify:release
pnpm verify:smoke
pnpm audit --audit-level moderate
pnpm outdated -r --format json
pnpm verify:deps
pnpm verify:compat
pnpm verify:functional
pnpm verify:test-type-debt
bash scripts/review-gate.sh
```

Current final results:

- `pnpm verify:coverage`: PASS with package branch coverage at SDK 91.34%, runtime 90.17%, adapters 92.28%, CLI 90.05%, dashboard 90.14%.
- `pnpm verify:functional`: PASS with `mutableBinding=0/0`, `loopStatement=0/0`, 0 file baseline entries.
- `pnpm verify:test-type-debt`: PASS with an empty allowlist.
- `pnpm outdated -r --format json`: `{}` with registry access.
- `pnpm verify:smoke` and `bash scripts/review-gate.sh`: PASS with local port binding allowed.

## Full Functional/Compat Overhaul Follow-up

Branch: `codex/full-functional-effect-overhaul`

Verified changes in this lane:

- `packages/runtime/src/orchestrator/workflow/graph/index.ts` was converted away from `let` and `for(...)` statements.
- `packages/runtime/src/orchestrator/workflow/parser/workflow-parser.ts` was converted away from `let` and `for(...)` statements.
- `parseWorkflowEffect` was added as an additive EffectTS boundary while keeping the existing synchronous `parseWorkflow` API.
- `scripts/release/verify-functional-policy.mjs --update` was added and exposed as `pnpm verify:functional:update`. It updates the ratchet only from scanned source and rejects baseline increases unless `--allow-increase` is explicitly supplied.
- Deprecated adapters shims removed in this breaking-cleanup lane:
  - `LegacyToolBackedSkill`
  - `ToolRegistry.toFunctionCallingSchema`
  - `FunctionCallRequest` / `FunctionCallResponse`
- `ToolExecutor` now consumes canonical `ToolCall` inputs through `handleToolCall` / `handleToolCalls`.
- `scripts/release/compat-allowlist.txt` and `scripts/review-gate-deprecated-allowlist.txt` were reduced for the removed shims.

Follow-up command evidence captured during the lane:

```bash
pnpm --filter @obora/runtime test -- workflow/parser/__tests__/workflow-parser-coverage.test.ts workflow/resolver/__tests__/dependency-resolver.test.ts workflow/validator/__tests__/workflow-validator-coverage.test.ts
pnpm --filter @obora/runtime typecheck
pnpm --filter @obora/adapters test -- tools/executor.test.ts tools/conformance.test.ts tools/registry.test.ts
pnpm --filter @obora/adapters typecheck
pnpm typecheck
pnpm lint
pnpm test
pnpm verify:coverage
pnpm build
pnpm verify:release
pnpm verify:smoke
pnpm verify:sdk-public-api
pnpm audit --audit-level moderate
pnpm outdated -r --format json
bash scripts/review-gate.sh
pnpm verify:compat
pnpm verify:functional
pnpm verify:functional:update
pnpm verify:deps
pnpm verify:test-type-debt
```

Current ratchet after this lane:

- `pnpm verify:functional`: PASS with `mutableBinding=309/309`, `loopStatement=462/462`, 184 file baseline entries.
- `pnpm verify:coverage`: PASS with package branch coverage at SDK 91.07%, runtime 90.00%, adapters 92.53%, CLI 90.01%, dashboard 90.15%.
- `pnpm outdated -r --format json`: `{}` with registry access.
- `pnpm verify:release`, `pnpm verify:smoke`, `pnpm verify:sdk-public-api`, and `bash scripts/review-gate.sh`: PASS.

## Functional Cleanup Next Follow-up

Branch: `codex/functional-cleanup-next`

Verified changes in this lane:

- Merged `codex/full-functional-effect-overhaul` into `main` with a fast-forward merge and pushed `main` at `22595e93`.
- `packages/sdk/src/dependency-resolver.ts`, `packages/runtime/src/orchestrator/workflow/resolver/dependency-resolver.ts`, `packages/runtime/src/blackboard/core/immutable.ts`, and `packages/runtime/src/blackboard/events/event-bus.ts` were converted away from `let` and loop statements.
- `scripts/release/functional-policy-baseline.json` was lowered with `pnpm verify:functional:update`; the file-level ratchet now has 180 baseline entries.
- `turbo` was updated from `^2.9.10` to `^2.9.12` after `pnpm outdated -r --format json` reported the newer patch.
- Transitive security overrides were added for `fast-uri@<=3.1.1 -> 3.1.2` and `fast-xml-builder@<=1.1.6 -> 1.2.0` after `pnpm audit --audit-level moderate` reported current registry advisories.
- `scripts/release/verify-dependency-policy.mjs` now enforces the updated `turbo` range and the required transitive security overrides.
- `AGENTS.md` now requires `pnpm audit --audit-level moderate` before claiming dependency health and documents that dependency policy covers required transitive security overrides.

Follow-up command evidence captured during the lane:

```bash
pnpm --filter @obora/sdk test -- dependency-resolver.test.ts
pnpm --filter @obora/runtime test -- workflow/resolver/__tests__/dependency-resolver.test.ts
pnpm --filter @obora/runtime test -- blackboard/core/__tests__/immutable.test.ts
pnpm --filter @obora/runtime test -- blackboard/events/__tests__/event-bus.test.ts
pnpm --filter @obora/sdk typecheck
pnpm --filter @obora/runtime typecheck
pnpm --filter @obora/sdk lint
pnpm --filter @obora/runtime lint
pnpm verify:functional
pnpm verify:functional:update
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm verify:coverage
pnpm build
pnpm verify:release
pnpm verify:smoke
pnpm verify:sdk-public-api
pnpm audit --audit-level moderate
pnpm outdated -r --format json
pnpm verify:deps
pnpm verify:compat
pnpm verify:test-type-debt
bash scripts/review-gate.sh
```

Current ratchet after this lane:

- `pnpm verify:functional`: PASS with `mutableBinding=301/301`, `loopStatement=422/422`, 180 file baseline entries.
- `pnpm verify:coverage`: PASS with package branch coverage at SDK 91.07%, runtime 90.00%, adapters 92.53%, CLI 90.01%, dashboard 90.15%.
- `pnpm audit --audit-level moderate`: PASS, `No known vulnerabilities found`.
- `pnpm outdated -r --format json`: `{}` with registry access.
- `pnpm verify:release`, `pnpm verify:smoke`, `pnpm verify:sdk-public-api`, `pnpm verify:deps`, `pnpm verify:compat`, `pnpm verify:test-type-debt`, and `bash scripts/review-gate.sh`: PASS.

## Final Functional Policy Zero-Baseline Follow-up

Branch: `codex/functional-cleanup-next`

Verified changes in this lane:

- The remaining functional policy entries were removed across SDK, runtime, adapters, CLI, dashboard, and release scripts.
- `scripts/release/functional-policy-baseline.json` was updated through `pnpm verify:functional:update`; output was `[PASS] functional policy baseline updated: mutableBinding=301->0, loopStatement=422->0, files=180->0.`
- `packages/cli/src/utils/global-opts.ts` was fixed after the cleanup exposed a null command-root case in CLI tests.
- `AGENTS.md` now states that the functional-policy baseline is zero and source TypeScript/JavaScript must not reintroduce `let` or loop statements.

Follow-up command evidence captured during this lane:

```bash
pnpm --filter @obora/sdk typecheck
pnpm --filter @obora/runtime typecheck
pnpm --filter @obora/adapters typecheck
pnpm --filter @obora/cli typecheck
pnpm --filter @obora/dashboard typecheck
bash -n scripts/review-gate-task-auto.sh
bash -n scripts/release/verify-typecheck-public-shims.sh
pnpm verify:functional
pnpm verify:functional:update
pnpm typecheck
pnpm lint
pnpm verify:test-type-debt
pnpm verify:compat
pnpm verify:deps
pnpm --filter @obora/cli test
pnpm test
pnpm verify:coverage
pnpm verify:release
pnpm verify:smoke
bash scripts/review-gate.sh
git diff --check
```

Current final results:

- `pnpm verify:functional`: PASS with `mutableBinding=0/0`, `loopStatement=0/0`, 0 file baseline entries.
- `pnpm test`: PASS with adapters 181 tests, runtime 1224 tests, SDK 805 tests, dashboard 211 tests, and CLI 630 tests.
- `pnpm verify:coverage`: PASS with statements/branches/functions/lines at SDK 97.03/91.34/97.46/97.52, runtime 94.92/90.17/95.29/95.15, adapters 96.25/92.28/98.24/96.88, CLI 95.78/90.05/97.42/96.47, dashboard 94.07/90.14/93.67/94.21.
- `pnpm typecheck`, `pnpm lint`, `pnpm verify:test-type-debt`, `pnpm verify:compat`, `pnpm verify:deps`, `pnpm verify:coverage`, `pnpm verify:release`, `pnpm verify:smoke`, and `bash scripts/review-gate.sh`: PASS.
- `pnpm verify:smoke` and `bash scripts/review-gate.sh` both passed in this final run with local `127.0.0.1` port binding available.

## EffectTS Boundary Expansion Follow-up

Branch: `codex/functional-cleanup-next`

Verified changes in this lane:

- `PolicyLoader` now exposes `normalizePolicySetEffect` and `loadPolicyFromYamlEffect`; the existing `loadPolicyFromYaml` Promise API remains backward-compatible and runs through the Effect boundary.
- `DefaultPolicyEngine` now exposes additive `loadEffect`, `loadInlineEffect`, `reloadEffect`, `snapshotEffect`, and `enforceEffect` methods while preserving existing sync/Promise APIs.
- Policy condition validation now has an explicit `validatePolicyConditionsEffect` boundary.
- Runtime step execution now exposes `executeStepEffect`; the existing `executeStep` Promise API remains backward-compatible and runs through that Effect boundary.
- No dependency versions were changed in this lane.

Follow-up command evidence captured during this lane:

```bash
pnpm --filter @obora/runtime test -- policy/__tests__/DefaultPolicyEngine.test.ts policy/__tests__/DynamicPolicy.test.ts policy/__tests__/PolicyRules.test.ts
pnpm --filter @obora/runtime test -- orchestrator/__tests__/step-executor.test.ts policy/__tests__/DefaultPolicyEngine.test.ts
pnpm --filter @obora/runtime test -- policy/__tests__/PolicyLoader.test.ts policy/__tests__/DefaultPolicyEngine.test.ts orchestrator/__tests__/step-executor.test.ts
pnpm --filter @obora/runtime test
pnpm --filter @obora/runtime typecheck
pnpm --filter @obora/runtime lint
pnpm typecheck
pnpm lint
pnpm verify:compat
pnpm verify:functional
pnpm verify:release
pnpm verify:deps
pnpm verify:test-type-debt
git diff --check
pnpm test
pnpm verify:coverage
pnpm verify:smoke
bash scripts/review-gate.sh
```

Current verified state:

- Targeted runtime tests: PASS with 51 tests across `PolicyLoader`, `DefaultPolicyEngine`, and `step-executor`.
- Full runtime tests: PASS with 94 files and 1228 tests.
- `pnpm --filter @obora/runtime typecheck`: PASS.
- `pnpm --filter @obora/runtime lint`: PASS.
- `pnpm typecheck`: PASS across all 5 packages.
- `pnpm lint`: PASS across all 5 packages.
- `pnpm verify:compat`: PASS.
- `pnpm verify:functional`: PASS with `mutableBinding=0/0`, `loopStatement=0/0`, 0 file baseline entries.
- `pnpm verify:release`: PASS.
- `pnpm verify:deps`: PASS; dependency versions were intentionally left unchanged.
- `pnpm verify:test-type-debt`: PASS.
- `git diff --check`: PASS.
- `pnpm test`: PASS with adapters 181, runtime 1228, SDK 805, dashboard 211, and CLI 630 tests.
- `pnpm verify:coverage`: PASS with branch coverage at SDK 91.34%, runtime 90.19%, adapters 92.28%, CLI 90.05%, dashboard 90.14%.
- `pnpm verify:smoke`: PASS.
- `bash scripts/review-gate.sh`: PASS.
