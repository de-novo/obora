# Release Readiness

This document is the release-facing checklist for the current 0.x line. It is scoped to package publication readiness, not live-LLM e2e validation.

## Default Gate

Run the default gate in this order before any release candidate:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

For a destructive clean-checkout simulation, run:

```bash
pnpm verify:clean
```

`pnpm test:e2e` is not part of the default release gate. Run it only as a manual live-LLM check when provider credentials such as `ZAI_API_KEY` are available.

## Publishable Packages

The release scripts and publish workflow treat the publishable package order as:

1. `@obora/runtime`
2. `@obora/adapters`
3. `@obora/sdk`
4. `@obora/cli`

`@obora/dashboard` remains package-only/private and is not published by the release workflow.

## Release Verification

Use the repo-local release gate before publishing:

```bash
pnpm verify:release
pnpm verify:compat
pnpm verify:test-type-debt
```

`pnpm verify:release` builds publishable packages, checks changelog release notes, runs npm-auth selftests, rejects source JSDoc tags that advertise scoped `@obora` module subpaths outside package exports, validates package `npm pack --dry-run` output, validates `pnpm pack` package metadata, runs published-package import/require smoke checks, and selftests CLI package installation.

Package payload validation fails if publishable tarballs include `dist/**/__tests__/**`,
`*.test.*`, or `*-e2e.test.*` artifacts.

Package payload validation also enforces packed-size budgets so dependency bundling changes do not silently inflate publish artifacts. The current byte budgets are
`5,500,000` for `@obora/runtime`, `9,000,000` for `@obora/adapters`, `1,000,000` for `@obora/sdk`, and `250,000` for `@obora/cli`.

`pnpm verify:compat` ensures active source compatibility/deprecation mentions are covered by `scripts/release/compat-allowlist.txt` and that active runtime/CLI/SDK source does not reintroduce `_legacy` references.

`pnpm verify:test-type-debt` keeps runtime source/test type debt at zero and prevents SDK/CLI `as any` or ts-ignore debt from growing outside `scripts/release/test-type-debt-allowlist.txt`.

## Package Payload Checks

For package payload inspection, use the existing release verification script first. If a manual check is needed, run package pack dry-runs from the repo root after build:

```bash
pnpm build
bash scripts/release/verify-publish-packages.sh
```

The payload must include built `dist` output, package README/LICENSE entries where declared, the declared `exports`, package `types`, and the CLI `bin/obora.js` entry for `@obora/cli`. The release gate also rejects `workspace:` dependency specifiers in the `pnpm pack` package metadata and smoke-tests public imports such as `@obora/sdk/testing`, `@obora/runtime/storage`, and `@obora/adapters/testing` after installing the local tarballs.

## Manual Publish

Manual package publish should use:

```bash
bash scripts/release/publish-packages.sh
```

The script requires `NPM_TOKEN`, uses an isolated temporary npm userconfig, rebuilds publishable packages, runs release verification, and publishes in dependency order.
