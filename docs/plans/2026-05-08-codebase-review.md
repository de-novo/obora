# Codebase Review - 2026-05-08

## Scope

- Repository: `/Users/novo/Desktop/denovo/obora`
- Review date: 2026-05-08 Asia/Seoul
- Review target: whole monorepo, release gates, coverage, dependency policy, deprecated usage, functional/planning drift, and functional-programming migration readiness.
- Review rule: detections below are based on commands run against the current checkout. Speculative items are marked as plans, not verified facts.

## Verification Summary

| Gate | Result | Notes |
| --- | --- | --- |
| `pnpm typecheck` | PASS | 5 package typecheck tasks completed. |
| `pnpm lint` | PASS | Existing lint gate passed before the review-gate fixes. |
| `pnpm test` | PASS | 5 workspace packages passed: adapters 181, runtime 1223, sdk 805, dashboard 211, cli 630 tests. Required local port binding because dashboard server tests bind `127.0.0.1`. |
| `pnpm verify:coverage` | PASS | Every package is now above 90% for statements, branches, functions, and lines. Required local port binding because dashboard tests bind `127.0.0.1`. |
| `pnpm build` | PASS | All 5 build tasks passed. |
| `pnpm verify:smoke` | PASS | Passed with local port binding allowed; the pure sandbox blocks dashboard bootstrap listen with `EPERM`. |
| `pnpm verify:release` | PASS | Passed after the doc-snippet verifier stopped generating deprecated TS 6 `baseUrl`. |
| `pnpm verify:compat` | PASS | Compat/deprecation inventory is tracked by allowlist. |
| `pnpm verify:test-type-debt` | PASS | SDK/CLI/runtime test type debt allowlist is empty. |
| `pnpm verify:deps` | PASS | Package manifests reject deprecated pi packages and drift in managed dependency ranges. |
| `pnpm verify:functional` | PASS | File-level ratchet is locked at `mutableBinding=314/314`, `loopStatement=501/501`, 187 baseline entries. |
| `pnpm verify:sdk-public-api` | PASS | SDK no-console and public API snapshot passed. |
| `pnpm audit --audit-level moderate` | PASS | No known vulnerabilities found. |
| `bash scripts/review-gate-selftest.sh` | PASS | Selftest now covers coverage-output exclusion and canonical sandbox artifact smoke. |
| `bash scripts/review-gate.sh` | PASS | Passed with local port binding allowed; the pure sandbox blocks dashboard tests on `127.0.0.1` listen with `EPERM`. |

## Coverage Evidence

`pnpm verify:coverage` now reports every package above 90% for statements, branches, functions, and lines. `scripts/coverage/thresholds.json` enforces 90% branch floors for runtime, CLI, and dashboard, so the previous branch-coverage debt is now blocked by the gate.

| Package | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| `@obora/sdk` | 97.09% | 91.07% | 97.04% | 97.57% |
| `@obora/runtime` | 95.04% | 90.00% | 95.15% | 95.23% |
| `@obora/adapters` | 96.25% | 92.76% | 98.06% | 96.87% |
| `@obora/cli` | 95.74% | 90.01% | 98.12% | 96.40% |
| `@obora/dashboard` | 94.14% | 90.15% | 93.49% | 94.26% |

The enforced branch floors are now at least 90 for every package in `scripts/coverage/thresholds.json`.

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

### RG-005 - `let` and `for (` usage is widespread

- Severity: P2 partially fixed
- Evidence:
  - `pnpm verify:functional`: PASS.
  - Current non-test source baseline: `mutableBinding=314/314`, `loopStatement=501/501`, 187 file entries.
- Top `let` hotspots:
  - `packages/sdk/src/step-executor.ts`: 12
  - `packages/cli/src/commands/run.ts`: 11
  - `packages/runtime/src/state/StateBinder.ts`: 10
  - `packages/runtime/src/judgment/JudgmentEngine.ts`: 8
  - `packages/sdk/src/execution/execution-controller.ts`: 7
- Top `for (` hotspots:
  - `packages/runtime/src/orchestrator/workflow/parser/workflow-parser.ts`: 20
  - `packages/runtime/src/orchestrator/workflow/graph/index.ts`: 18
  - `packages/runtime/src/orchestrator/RuntimeOrchestrator.ts`: 16
  - `packages/runtime/src/blackboard/events/event-bus.ts`: 13
  - `packages/runtime/src/orchestrator/workflow/resolver/dependency-resolver.ts`: 11
  - `packages/sdk/src/step-executor.ts`: 11
- Fix applied:
  - Added `scripts/release/verify-functional-policy.mjs`.
  - Added `scripts/release/functional-policy-baseline.json`.
  - Added `pnpm verify:functional`.
  - Release verification now runs the functional policy gate.
  - The gate now compares per-file counts, so new source files have a zero budget and existing files may only decrease their counts unless the baseline is intentionally rebaselined.
  - `packages/dashboard/src/client/pages/PlaybackView.tsx` was refactored from cancellation `let` variables and an indexed `for` loop to a const cancellation cell plus `reduce`, lowering the baseline from `318/502` to `314/501`.
- Remaining plan:
  1. Reduce the baseline in small patches, starting with runtime parser/graph/orchestrator and SDK step execution.
  2. Allow focused exceptions only for performance-sensitive or unavoidable interop code with a short inline reason.
  3. Convert loop-heavy pure transforms to `ReadonlyArray` combinators, `Object.entries().map/filter/reduce`, `Map` builders wrapped in pure helpers, and `Effect.forEach` where async sequencing matters.
  4. Convert mutable workflow state with `Effect.Ref`, `Effect.acquireRelease`, or explicit immutable state transitions.

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

### Phase 1 - No-new-debt ratchet

- Reduce the `verify:functional` baseline in small patches.
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

- `pnpm verify:coverage`: PASS with package branch coverage at SDK 91.07%, runtime 90.00%, adapters 92.76%, CLI 90.01%, dashboard 90.15%.
- `pnpm verify:functional`: PASS with `mutableBinding=314/314`, `loopStatement=501/501`, 187 file baseline entries.
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
