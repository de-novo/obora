# Release Readiness

This document is the release-facing checklist for the current 0.x line. It is scoped to package publication readiness, not live-LLM e2e validation.

## Default Gate

Run the default gate in this order before any release candidate:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm verify:coverage
pnpm build
```

`pnpm typecheck` is a Turbo task. It builds upstream package declarations before
running package typechecks so the CLI is checked against publishable public
declarations from its workspace dependencies.

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
pnpm verify:coverage
pnpm verify:release
pnpm verify:compat
pnpm verify:test-type-debt
```

`pnpm verify:coverage` enforces the package-level baseline in
`scripts/coverage/thresholds.json`. The baseline is a regression floor, not a
single repo-wide 90% target. Raise a package threshold only in the same slice
that adds the tests needed to support the higher number. `pnpm coverage:report`
remains available as a report-only command.

Current enforced coverage floors:

| Package | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| `@obora/sdk` | 95 | 90 | 99 | 95 |
| `@obora/runtime` | 90 | 87 | 86 | 90 |
| `@obora/adapters` | 94 | 90 | 92 | 94 |
| `@obora/cli` | 95 | 90 | 97 | 95 |
| `@obora/dashboard` | 92 | 90 | 92 | 92 |

Latest verified `pnpm verify:coverage` package measurements:

| Package | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| `@obora/sdk` | 95.94% | 90.07% | 99.35% | 95.94% |
| `@obora/runtime` | 90.74% | 87.03% | 86.76% | 90.74% |
| `@obora/adapters` | 94.00% | 90.26% | 92.55% | 94.00% |
| `@obora/cli` | 95.92% | 90.01% | 97.46% | 95.92% |
| `@obora/dashboard` | 92.45% | 90.08% | 92.11% | 92.45% |

The current dashboard baseline covers Node-testable dashboard code, TSX
component tests, `src/client/App.tsx`, and page TSX tests. It intentionally
excludes only the browser entrypoint `src/client/main.tsx`.

The current runtime baseline is above 90% for statements and lines, and the
runtime branch floor is now enforced at 87 after focused tests around resume,
gate timeout, artifact capture, blackboard state defaults, step skill loading,
and policy expression parsing.

`pnpm verify:release` builds publishable packages, checks changelog release notes, runs npm-auth selftests, rejects SDK source console writes outside the explicit `ConsoleAlertChannel`, verifies the `@obora/sdk` public API snapshot for the root and `@obora/sdk/testing` exports, rejects source JSDoc tags that advertise scoped `@obora` module subpaths outside package exports, verifies Markdown `@obora` import samples against public package exports, compiles checked TypeScript snippets against built public declarations, validates checked shell snippets with `bash -n`, parses tutorial YAML/JSON snippets and semantically checks workflow/config/policy examples, runs tutorial quickstart and contract-first dry-run flows through the built CLI, verifies that `typecheck-public.d.ts` shims do not declare exports absent from built public declarations, validates package `npm pack --dry-run` output, validates `pnpm pack` package metadata, runs published-package import/require/TypeScript smoke checks, and selftests CLI package installation.

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

The payload must include built `dist` output, package README/LICENSE entries where declared, the declared `exports`, package `types`, and the CLI `bin/obora.js` entry for `@obora/cli`. The release gate also rejects `workspace:` dependency specifiers in the `pnpm pack` package metadata and smoke-tests public imports such as `@obora/sdk/testing`, `@obora/runtime/storage`, and `@obora/adapters/testing` after installing the local tarballs. The TypeScript smoke also compiles the SDK typed helper path (`defineWorkflow`, `defineTool`, `defineSchemaTool`, typed `run`) against the installed tarball declarations.

## Manual Publish

Manual package publish should use:

```bash
bash scripts/release/publish-packages.sh
```

For a publish rehearsal that rebuilds packages and runs the same release verification without writing to npm, use:

```bash
PUBLISH_DRY_RUN=1 bash scripts/release/publish-packages.sh
```

If the current package versions are already present on npm, dry-run mode treats npm's duplicate-version check as a successful rehearsal stop after the package manifest and tarball checks have run.

The live publish path requires `NPM_TOKEN`, uses an isolated temporary npm userconfig, rebuilds publishable packages, runs release verification, and publishes in dependency order. Manual `workflow_dispatch` runs default to dry-run mode; tag pushes publish live packages.

## Documentation Source Of Truth

Release-facing documentation must be readable from a clean checkout. Repo docs
must not rely on symlinks into a local Obsidian vault or another machine-specific
path. Durable specification and architecture notes should live under
`docs/spec/` and `docs/architecture/` as normal tracked Markdown files.
