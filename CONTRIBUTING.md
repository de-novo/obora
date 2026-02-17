# Contributing to Obora Kit

Thanks for your interest in contributing to Obora Kit 🎉

We welcome bug reports, feature proposals, documentation improvements, and pull requests.

## How to Contribute

Typical flow:

1. **Open an issue** (bug report or feature request) to discuss the change.
2. **Fork** the repository and create a topic branch.
3. **Implement** your changes with tests/docs as needed.
4. **Open a Pull Request** back to this repository.

Example branch names:

- `feat/add-policy-plugin`
- `fix/runtime-retry-logic`
- `docs/update-getting-started`

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 9+

### Install

```bash
pnpm install
```

### Build

```bash
pnpm build
```

### Test

```bash
pnpm test
```

Optional checks:

```bash
pnpm lint
pnpm typecheck
```

## Code Style

- Language: **TypeScript**
- Type safety: **strict typing preferred** (avoid `any` unless justified)
- Module system: **ESM** (`"type": "module"`)
- Keep changes focused and easy to review
- Add/adjust tests for behavior changes

## Commit Message Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation only
- `refactor:` code refactor without behavior change
- `test:` tests added/updated
- `chore:` maintenance/build/tooling

Examples:

- `feat(runtime): add timeout policy option`
- `fix(cli): handle missing config path`
- `docs: improve onboarding instructions`

## Pull Request & Review Process

Before opening a PR:

- Rebase on latest `main`
- Ensure `pnpm build` and `pnpm test` pass
- Update docs when behavior or public API changes

In your PR:

- Describe **what** changed and **why**
- Link related issues (e.g., `Closes #123`)
- Add migration notes if breaking or operationally relevant

Review expectations:

- At least one maintainer review required
- Address review comments with follow-up commits or rationale
- Maintainers may request scope reduction for large PRs

## Plugin Contribution Guide

If you are contributing plugins/integrations:

- Keep plugin boundaries clear and avoid coupling with unrelated packages
- Document plugin purpose, configuration, and runtime behavior
- Provide minimal reproducible example usage
- Include tests for core plugin flows and failure paths
- Prefer explicit contracts (types/interfaces) over implicit behavior

## Release Approval & Recovery Contract

Public npm publishing follows explicit control gates:

1. Use `.github/workflows/publish.yml` with `environment: npm-publish` (manual approval via environment protection rules).
2. Publish only from release tags (`v*`) after CI is green.
3. If publish fails:
   - If npm policy allows: unpublish immediately.
   - If unpublish is not allowed: deprecate the broken version and republish with a bumped version.
   - Never reuse an already published version.

## Reporting Security Issues

Please do **not** report security vulnerabilities in public issues.
Use a private channel: **security@obora.dev**.

---

By contributing, you agree to follow our [Code of Conduct](./CODE_OF_CONDUCT.md).
