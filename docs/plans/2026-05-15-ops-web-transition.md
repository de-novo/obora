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
  - manual edge connection between graph steps
  - workflow-level system prompt editing
  - step-level system prompt editing
  - execution history and step inspection
  - compiled workflow preview
- Added package tests for the pure model and React interaction surface.
- Added `@obora/ops` to the coverage gate with 90% minimum thresholds.
- Marked `@obora/dashboard` as deprecated legacy web surface in package docs and root agent guidance.

## Additional Stabilization

- The full monorepo `pnpm test` run exposed a transient SDK resume-orchestrator timeout in `resumes execution with rerun steps` under parallel package execution.
- The test passed in isolation in about 1 second, but the file-local timeout was only 10 seconds. Increased that local timeout to 20 seconds and re-ran the targeted SDK test plus the full test and review gates successfully.

## Next Implementation Lanes

1. Add an EffectTS validation boundary for ops graph drafts before any persistence or execution mutation.
2. Define the backend API contract for workflow draft save/load, prompt versioning, and run-history reads.
3. Decide whether dashboard Fastify bootstrap becomes the shared web server for ops or remains dashboard-only compatibility until removal.
4. Move live execution history from seeded client state to runtime history APIs.
5. Add graph validation feedback for unreachable nodes, blocked terminal handoffs, and missing policy/model fields.
6. Keep every prompt entered in the ops workflow builder serialized as `systemPrompt`; user task prompts are not part of this authoring surface yet.
7. Implement global/project workflow lookup and web entry points from `docs/design/workflow-scope-and-web-entry.md` before adding `workflow build`, `workflow view`, or chat-session workflow switching.

## Verification Log

- `pnpm --filter @obora/ops typecheck`: PASS
- `pnpm --filter @obora/ops lint`: PASS
- `pnpm --filter @obora/ops test`: PASS, 2 files / 25 tests
- `pnpm --filter @obora/ops build`: PASS
- `pnpm typecheck`: PASS, 6 package typecheck tasks
- `pnpm lint`: PASS, 6 package lint tasks
- `pnpm test`: PASS, adapters 181, ops 25, runtime 1228, dashboard 211, sdk 805, cli 630 tests
- `pnpm verify:functional`: PASS, `mutableBinding=0/0`, `loopStatement=0/0`, `files=0`
- `pnpm verify:deps`: PASS, 7 package manifests
- `pnpm verify:coverage`: PASS
- `pnpm verify:release`: PASS
- `pnpm verify:smoke`: PASS, built CLI onboarding smoke and dashboard bootstrap smoke
- `pnpm verify:compat`: PASS
- `pnpm verify:test-type-debt`: PASS
- `git diff --check`: PASS
- `bash scripts/review-gate.sh`: PASS
- Browser check on `http://127.0.0.1:5174/`: PASS, added a node, manually connected `route-policy -> agent-step-5`, edited the step system prompt, and verified compiled YAML contains the manual edge plus `systemPrompt`.

| Package            | Statements | Branches | Functions |  Lines |
| ------------------ | ---------: | -------: | --------: | -----: |
| `@obora/sdk`       |     97.03% |   91.34% |    97.46% | 97.52% |
| `@obora/runtime`   |     94.90% |   90.19% |    95.22% | 95.13% |
| `@obora/adapters`  |     96.25% |   92.28% |    98.24% | 96.88% |
| `@obora/cli`       |     95.78% |   90.05% |    97.42% | 96.47% |
| `@obora/dashboard` |     94.07% |   90.14% |    93.67% | 94.21% |
| `@obora/ops`       |     99.00% |   90.00% |    98.03% | 98.78% |
