# Obora Agent Guide

## Required Gates

- Use `pnpm` from the repository root.
- Before publishing or handing off broad changes, run the relevant package checks plus:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm verify:coverage`
  - `pnpm verify:release`
  - `pnpm verify:smoke`
  - `bash scripts/review-gate.sh`
- `@obora/dashboard` server/bootstrap tests bind `127.0.0.1`. If the local sandbox returns `EPERM`, rerun the same gate with local port binding allowed and document the exact sandbox failure plus the successful local-runtime result.

## Coverage

- All packages must stay at or above 90% for statements, branches, functions, and lines.
- Do not lower `scripts/coverage/thresholds.json` to make a run pass.
- If coverage changes because tooling changed, record the command output and update `docs/plans/2026-05-08-codebase-review.md` with verified numbers only.

## Type Test Debt

- `pnpm verify:test-type-debt` must pass.
- Do not add `as any`, `@ts-ignore`, or `@ts-expect-error` in SDK, CLI, or runtime tests/source.
- Prefer typed fixtures, builders, `vi.mocked`, and narrow `unknown as ConcreteType` casts at external test seams.
- Keep `scripts/release/test-type-debt-allowlist.txt` empty unless a reviewer explicitly accepts a short-lived exception with a removal plan.

## Functional TypeScript

- Source TypeScript and JavaScript must not introduce `let` or loop statements; the current functional-policy baseline is zero.
- Prefer `const`, `ReadonlyArray`, `map`, `filter`, `reduce`, `flatMap`, `Object.entries`, and small pure helpers.
- For async sequencing or resource boundaries, prefer EffectTS APIs such as `Effect.gen`, `Effect.forEach`, `Effect.acquireRelease`, and `Ref`.
- `pnpm verify:functional` is a zero-baseline file-level ratchet. Do not rebaseline `scripts/release/functional-policy-baseline.json` upward without documenting the reason and follow-up cleanup.
- After actually reducing `let` or loop counts, run `pnpm verify:functional:update` instead of hand-editing `scripts/release/functional-policy-baseline.json`. The updater rejects increases unless `--allow-increase` is passed with explicit reviewer approval.

## EffectTS Boundary

- New workflow validation, policy evaluation, config parsing, and step-execution boundaries should consider additive EffectTS APIs first.
- Keep existing public synchronous APIs backward-compatible unless the task is explicitly a breaking-change lane.
- Add tests around the synchronous API and the Effect API when introducing a new Effect boundary.

## Web Surface Transition

- Treat `@obora/dashboard` as a deprecated legacy monitoring/bootstrap surface. Keep its gates green while smoke/release checks still depend on it, but do not add new operator product work there.
- Put new operator-facing web work in `@obora/ops`.
- `@obora/ops` should cover graph workflow authoring, system prompt management, and execution history inspection first.
- Keep ops UI state transitions in typed pure helpers, maintain the zero `let` / loop baseline, and introduce EffectTS boundaries before adding backend workflow validation, policy evaluation, or execution mutation APIs.
- When deprecating or removing dashboard behavior, document whether the old responsibility moved to `@obora/ops`, stayed as server/bootstrap compatibility, or was intentionally removed in a breaking cleanup lane.

## Dependencies

- `pnpm verify:deps` must pass after manifest or lockfile changes.
- `pnpm audit --audit-level moderate` must pass before claiming dependency health.
- `pnpm outdated -r --format json` should return `{}` before claiming dependency freshness. Registry access may require a non-sandboxed run.
- Do not reintroduce deprecated `@mariozechner/pi-agent-core` or `@mariozechner/pi-ai`; use `@earendil-works/*`.
- Keep shared dependency ranges and required transitive security overrides consistent through `scripts/release/verify-dependency-policy.mjs`.

## Deprecated And Compatibility Surfaces

- `pnpm verify:compat` must pass.
- New `deprecated`, `legacy`, `backward compat`, `compatibility`, or `_legacy` source mentions require an entry in `scripts/release/compat-allowlist.txt` with classification and replacement guidance.
- Do not hide deprecated public API debt in docs; list it as compatibility debt or remove it in a breaking-cleanup lane.
- When removing deprecated APIs or compatibility shims, update both `scripts/release/compat-allowlist.txt` and `scripts/review-gate-deprecated-allowlist.txt` in the same patch.

## Documentation

- Review and planning docs must distinguish verified facts from plans.
- Record exact commands and relevant outputs for coverage, dependency freshness, sandbox limitations, and release gates.
- Do not mark a server-binding gate as passed in the pure sandbox when it only passed with local port binding allowed.
