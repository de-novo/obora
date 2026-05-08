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
| `pnpm test` | PASS | 5 workspace packages passed: adapters 181, runtime 1214, sdk 805, dashboard 206, cli 624 tests. |
| `pnpm verify:coverage` | PASS | Package coverage floors are all above enforced thresholds. Required escalated local run because dashboard tests bind `127.0.0.1`. |
| `pnpm build` | PASS | All 5 build tasks passed. |
| `pnpm verify:smoke` | BLOCKED IN SANDBOX | Built CLI onboarding smoke passed, then dashboard bootstrap failed on `127.0.0.1:0` listen with sandbox `EPERM`. A prior local-runtime run passed before the final package-smoke changes. |
| `pnpm verify:release` | PASS | Passed in sandbox after release package smoke stopped depending on user-home npm cache/network install and publish payloads excluded source maps. |
| `pnpm verify:compat` | PASS | Compat/deprecation inventory is tracked by allowlist. |
| `pnpm verify:test-type-debt` | PASS | Test type debt remains tracked by allowlist; one `as any` allowance was removed in this follow-up. |
| `pnpm verify:deps` | PASS | Package manifests now reject deprecated pi packages and drift in managed dependency ranges. |
| `pnpm verify:functional` | PASS | New non-test `let` / `for (` debt is blocked by a baseline gate. |
| `pnpm verify:sdk-public-api` | PASS | SDK no-console and public API snapshot passed. |
| `pnpm audit --audit-level moderate` | PASS | No known vulnerabilities found. |
| `bash scripts/review-gate-selftest.sh` | PASS | Selftest now covers coverage-output exclusion and canonical sandbox artifact smoke. |
| `bash scripts/review-gate.sh` | BLOCKED IN SANDBOX | Deprecated/ban scans and typecheck passed, then dashboard tests failed on `127.0.0.1` listen with sandbox `EPERM`. A prior local-runtime run passed after the review-gate fixes. |

## Coverage Evidence

`pnpm verify:coverage` currently reports every package above 90% branch coverage and above the package-specific floors in `scripts/coverage/thresholds.json`.

| Package | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| `@obora/sdk` | 96.05% | 91.16% | 99.35% | 96.05% |
| `@obora/runtime` | 93.13% | 90.04% | 90.24% | 93.13% |
| `@obora/adapters` | 96.70% | 92.56% | 98.40% | 96.70% |
| `@obora/cli` | 96.36% | 91.06% | 97.72% | 96.36% |
| `@obora/dashboard` | 94.74% | 91.14% | 93.31% | 94.74% |

The review updated `docs/release-readiness.md` so the latest SDK branch measurement matches the verified run.

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
  - `bash scripts/review-gate.sh`: blocked in the current sandbox at dashboard server listen; prior local-runtime run passed.

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

### RG-004 - EffectTS was not part of the implementation baseline

- Severity: P2 partially fixed
- Evidence:
  - Initial `rg -n '"effect"|"@effect/' package.json packages/*/package.json` returned no package manifest hits.
  - Effect-like source matches are domain policy fields such as `effect: allow/deny`, not EffectTS usage.
- Fix applied:
  - `packages/runtime` now depends on `effect@^3.21.2`.
  - Workflow parse/validate has an Effect boundary via `parseAndValidateEffect`.
  - The existing synchronous `parseAndValidate` API remains backward-compatible by running the Effect boundary synchronously.
- Remaining plan:
  1. Expand Effect usage into workflow validation internals, policy evaluation, config parsing, and step execution.
  2. Keep new Effect APIs additive until public API migration is explicitly planned.
  3. Convert high-value mutable internals only after behavior-preserving tests are in place.

### RG-005 - `let` and `for (` usage is widespread

- Severity: P2 partially fixed
- Evidence:
  - `rg --count-matches '\blet\b' packages scripts ...`: 567 matches.
  - `rg --count-matches '\bfor\s*(await\s*)?\(' packages scripts ...`: 588 matches.
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
  - Added `pnpm verify:functional`.
  - Release verification now runs the functional policy gate.
  - Current non-test baseline is locked at `mutableBinding=326` and `loopStatement=502`; new debt above that baseline fails the gate.
- Remaining plan:
  1. Reduce the baseline in small patches, starting with runtime parser/graph/orchestrator and SDK step execution.
  2. Allow focused exceptions only for performance-sensitive or unavoidable interop code with a short inline reason.
  3. Convert loop-heavy pure transforms to `ReadonlyArray` combinators, `Object.entries().map/filter/reduce`, `Map` builders wrapped in pure helpers, and `Effect.forEach` where async sequencing matters.
  4. Convert mutable workflow state with `Effect.Ref`, `Effect.acquireRelease`, or explicit immutable state transitions.

### RG-006 - Test type debt is tracked but still present

- Severity: P2 partially fixed
- Evidence:
  - `scripts/release/test-type-debt-allowlist.txt` initially allowed 67 `as any` test occurrences.
  - `pnpm verify:test-type-debt`: PASS, so the debt is bounded but not removed.
- Fix applied:
  - Removed the focused `as any` from `packages/sdk/src/execution/strategies/__tests__/judge-strategy.test.ts`.
  - Removed the corresponding allowlist entry.
- Current state:
  - Remaining allowlist total is 66.
- Largest allowlisted groups:
  - `execution-controller-advanced`: 20
  - `run-orchestrator`: 12
  - `tkg-service`: 10
  - `resume-orchestrator`: 7
- Plan:
  1. Create typed fixture builders for execution controller, orchestrator run context, and TKG service responses.
  2. Remove allowlist entries package by package.
  3. Keep `verify:test-type-debt` as a hard regression gate.

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

### RG-008 - Dependency versions are current enough to pass gates, but not latest

- Severity: P2 partially fixed
- Evidence:
  - `pnpm outdated -r --format json` reports patch/minor updates for `@typescript-eslint/*`, `prettier`, `yaml`, `zod`, `@playwright/test`, `better-sqlite3`, `turbo`, and `ws`.
  - Major updates are available for `@eslint/js`, `@fastify/cors`, `@types/node`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `@vitest/coverage-v8`, `eslint`, `globals`, `react`, `react-dom`, `typescript`, `vite`, and `vitest`.
  - `pnpm audit --audit-level moderate`: PASS.
- Fix applied:
  - Patch/minor lane updated `@typescript-eslint/*`, `prettier`, `yaml`, `zod`, `@playwright/test`, `better-sqlite3`, `turbo`, and `ws`.
  - Deprecated package lane migrated `@mariozechner/*` to `@earendil-works/*`.
- Current state:
  - `pnpm outdated -r --format json` now reports only major-version items from available metadata, but the final run exited non-zero because the sandbox could not resolve `registry.npmjs.org`.
  - Remaining major-version items: `@eslint/js`, `@fastify/cors`, `@types/node`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `@vitest/coverage-v8`, `eslint`, `globals`, `react`, `react-dom`, `typescript`, `vite`, and `vitest`.
  - Install still reports peer warnings for `tsup`/`bundle-require` and `@vitejs/plugin-react`/`vite`; these require a major toolchain lane rather than a patch update.
- Remaining plan:
  1. Major migration lane: TypeScript 6, Vitest 4, Vite 8, React 19, ESLint 10, Fastify CORS 11, Node types 25.
  2. Include Vite/plugin-react peer alignment in that lane.
  3. Record package payload-size impact after every major runtime/adapters change.

### RG-009 - Dependency version management is manual

- Severity: P3 fixed
- Evidence:
  - Duplicate package specs are mostly consistent today; the only intentionally different spec detected is `typescript` dev dependency `^5.9.3` versus peer dependency `>=5.0.0`.
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
  - `pnpm verify:coverage` and `bash scripts/review-gate.sh` failed inside the filesystem/network sandbox when dashboard tests attempted to listen on `127.0.0.1`.
  - The same commands pass when run with local port binding allowed.
- Plan:
  1. Keep documenting server-binding gates as local-runtime gates, not pure sandbox gates.
  2. If CI needs a stricter split, separate dashboard no-listen unit tests from server/bootstrap tests.
  3. Do not mark these as product failures unless they fail outside the sandbox.

## Improvement Roadmap

### Phase 0 - Completed in this review

- Exclude generated coverage artifacts from review-gate scans.
- Replace ignored-log-dependent sandbox smoke with tracked artifact smoke.
- Update review-gate selftest coverage for both fixes.
- Refresh `docs/release-readiness.md` with the current verified SDK branch coverage.
- Migrate deprecated `@mariozechner/pi-ai` and `@mariozechner/pi-agent-core` to `@earendil-works/*`.
- Add dependency and functional policy gates to release verification.
- Add the first runtime Effect boundary.
- Remove one tracked SDK test `as any` debt item.

### Phase 1 - No-new-debt ratchet

- Reduce the `verify:functional` baseline in small patches.
- Continue removing `verify:test-type-debt` allowlist entries.
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

- Replace `as any` test debt with typed builders.
- Remove allowlist entries in small reviewable patches.
- Keep `verify:test-type-debt` hard.

### Phase 5 - Major dependency upgrade lane

- Upgrade major tooling in batches with release gate proof after each batch.
- Do not combine TypeScript 6, Vitest 4, Vite 8, React 19, and ESLint 10 in one patch unless the goal is explicitly a major migration branch.

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
