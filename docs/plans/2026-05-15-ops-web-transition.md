# Ops Web Transition - 2026-05-15

## Scope

- Repository: `/Users/novo/Desktop/denovo/obora`
- Product direction: keep the existing dashboard as a deprecated legacy surface and start the new operator web surface as `@obora/ops`.
- First ops target: graph workflow authoring, system prompt authoring, and execution history inspection.

## Verified Facts

- `pnpm-workspace.yaml` includes `packages/*`, so `packages/ops` is discovered as a workspace package.
- `@obora/dashboard` still participates in build/test/smoke gates through the existing Fastify bootstrap helper.
- `scripts/coverage/report.mjs` previously enumerated package coverage explicitly, so adding `@obora/ops` required extending that package list and `scripts/coverage/thresholds.json`.
- `scripts/release/verify-functional-policy.mjs` scans package source and keeps the current `let` / loop baseline at zero.

## Implemented First Slice

- Added `@obora/ops` as a Vite + React package.
- Added a typed pure state model for workflow nodes, graph edges, system prompt updates, run history selection, graph compilation, and ops summary metrics.
- Added an operator workbench UI with:
  - graph node selection and editing
  - graph step creation
  - system prompt editing
  - execution history and step inspection
  - compiled workflow preview
- Added package tests for the pure model and React interaction surface.
- Added `@obora/ops` to the coverage gate with 90% minimum thresholds.
- Marked `@obora/dashboard` as deprecated legacy web surface in package docs and root agent guidance.

## Next Implementation Lanes

1. Add an EffectTS validation boundary for ops graph drafts before any persistence or execution mutation.
2. Define the backend API contract for workflow draft save/load, prompt versioning, and run-history reads.
3. Decide whether dashboard Fastify bootstrap becomes the shared web server for ops or remains dashboard-only compatibility until removal.
4. Move live execution history from seeded client state to runtime history APIs.
5. Add graph validation feedback for unreachable nodes, blocked terminal handoffs, and missing policy/model fields.

## Verification Log

- `pnpm --filter @obora/ops typecheck`: PASS
- `pnpm --filter @obora/ops lint`: PASS
- `pnpm --filter @obora/ops test`: PASS, 2 files / 18 tests
- `pnpm --filter @obora/ops build`: PASS
- `pnpm typecheck`: PASS, 6 package typecheck tasks
- `pnpm lint`: PASS, 6 package lint tasks
- `pnpm test`: PASS, adapters 181, ops 18, runtime 1228, dashboard 211, sdk 805, cli 630 tests
- `pnpm verify:functional`: PASS, `mutableBinding=0/0`, `loopStatement=0/0`, `files=0`
- `pnpm verify:deps`: PASS, 7 package manifests
- `pnpm verify:coverage`: PASS
- `pnpm verify:release`: PASS
- `pnpm verify:smoke`: PASS, built CLI onboarding smoke and dashboard bootstrap smoke
- `pnpm verify:compat`: PASS
- `pnpm verify:test-type-debt`: PASS
- `git diff --check`: PASS
- `bash scripts/review-gate.sh`: PASS

| Package            | Statements | Branches | Functions |  Lines |
| ------------------ | ---------: | -------: | --------: | -----: |
| `@obora/sdk`       |     97.03% |   91.34% |    97.46% | 97.52% |
| `@obora/runtime`   |     94.90% |   90.19% |    95.22% | 95.13% |
| `@obora/adapters`  |     96.25% |   92.28% |    98.24% | 96.88% |
| `@obora/cli`       |     95.78% |   90.05% |    97.42% | 96.47% |
| `@obora/dashboard` |     94.07% |   90.14% |    93.67% | 94.21% |
| `@obora/ops`       |     92.80% |   97.72% |    90.14% | 93.85% |
