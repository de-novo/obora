# Legacy CLI Surface Audit

Date: 2026-04-15

## Scope

Audited legacy-boundary command surfaces that still exist under `packages/cli/src/commands/` via thin re-export wrappers but are not currently registered in `packages/cli/src/cli.ts`.

Targets reviewed:

- `status`
- `new`
- `done`
- `auth`
- `skills`
- `agents`
- `dashboard`

## Current state

### Wrapper pattern

The following files are only re-export shims:

- `packages/cli/src/commands/status.ts` -> `./_legacy/status.js`
- `packages/cli/src/commands/new.ts` -> `./_legacy/new.js`
- `packages/cli/src/commands/done.ts` -> `./_legacy/done.js`
- `packages/cli/src/commands/auth.ts` -> `./_legacy/auth.js`
- `packages/cli/src/commands/skills.ts` -> `./_legacy/skills.js`
- `packages/cli/src/commands/agents.ts` -> `./_legacy/agents.js`
- `packages/cli/src/commands/dashboard.ts` -> `./_legacy/dashboard.js`

### Registration

None of the targets above are currently added in `createCLI()`.

This means they are not part of the live top-level CLI contract even though command files and tests still exist.

### Why `status` is not a trivial promotion

`_legacy/status.ts` still carries old assumptions that do not match the modern CLI contract:

- raw `console.log` / `console.error`
- raw legacy `CLIError(..., 1/3)` numeric exits instead of `ExitCode.*`
- no `handleCommandAction`
- no `getGlobalOpts`
- no root `--json` propagation
- `--format json` only, no local `--json`
- placeholder/mock workflow/step run fetches instead of current persisted run surfaces
- feature-centric `.obora/features/...` UX instead of current live `runs` / `dlq` / `inspect` surfaces
- `@obora/runtime` diagnosis/template behavior not aligned with the modern operational CLI family

## Recommendation

Do not promote these wrappers one-by-one by simply adding them to `createCLI()`.

Recommended order:

1. Treat the wrapper set as an explicit legacy bucket.
2. Decide which surfaces still deserve a modern replacement.
3. For any surface that survives, redesign it against current persisted/runtime contracts first.
4. Only then register it in `createCLI()`.

## Suggested prioritization

### Candidate for redesign first

- `status`
  - if revived, it should likely become a thin operator view over persisted runs/DLQ state, not the current feature-status mock path.

### Candidate for later decision

- `auth`
- `skills`

### Likely keep legacy-only unless a concrete product need reappears

- `new`
- `done`
- `agents`
- `dashboard`

## Immediate action taken

- No legacy surface was promoted automatically.
- Audit conclusion recorded here so future promotion work starts from an explicit baseline rather than accidentally wiring legacy commands into the live CLI.
