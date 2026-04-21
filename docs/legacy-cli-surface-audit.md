# Legacy CLI Surface Audit

Date: 2026-04-21

Related live/deferred baseline docs:

- `docs/current-capabilities.md`
- `docs/support-scope.md`
- `docs/operator-guide.md`
- `docs/deferred-surface-revival-criteria.md`

## Scope

Audited legacy-boundary command surfaces that historically lived under `packages/cli/src/commands/` but are not currently registered in `packages/cli/src/cli.ts`.

Targets reviewed:

- `status` (initially legacy-boundary, later redesigned as a live surface)
- `new`
- `done`
- `auth` (initially legacy-boundary, later redesigned as a live surface)
- `skills`
- `agents`
- `dashboard`

## Current state

### Wrapper pattern

The following retained files are only re-export shims:

- `packages/cli/src/commands/new.ts` -> `./_legacy/new.js`
- `packages/cli/src/commands/done.ts` -> `./_legacy/done.js`

`packages/cli/src/commands/skills.ts` and `packages/cli/src/commands/dashboard.ts` plus their `_legacy/*` implementations were removed from the active CLI source tree once the deferred/live boundary was documented and guarded elsewhere.

`packages/cli/src/commands/status.ts` has since been redesigned as a live top-level command over persisted runs/DLQ state and is no longer just a shim.

`packages/cli/src/commands/auth.ts` has since been redesigned as a live top-level command over the current provider-auth store and is no longer just a shim.

`packages/cli/src/commands/agents.ts` has since been redesigned as a live agent surface over adapters/sdk resolution snapshots plus safe config-layer override helpers and is no longer just a shim.

### Registration

`status`, `auth`, and `agents` are now registered in `createCLI()` as live commands.

The remaining legacy-boundary targets above are still not added in `createCLI()`.

This means those remaining surfaces are not part of the live top-level CLI contract even though some historical docs and a small retained compatibility bucket still exist.

### Why `status` required redesign instead of direct promotion

`_legacy/status.ts` carried old assumptions that did not match the modern CLI contract:

- raw `console.log` / `console.error`
- raw legacy `CLIError(..., 1/3)` numeric exits instead of `ExitCode.*`
- no `handleCommandAction`
- no `getGlobalOpts`
- no root `--json` propagation
- `--format json` only, no local `--json`
- placeholder/mock workflow/step run fetches instead of current persisted run surfaces
- feature-centric `.obora/features/...` UX instead of current live `runs` / `dlq` / `inspect` surfaces
- `@obora/runtime` diagnosis/template behavior not aligned with the modern operational CLI family

That audit conclusion led to a redesign: the live `obora status` surface now summarizes persisted runs plus DLQ state instead of promoting the legacy feature-status implementation directly.

## Recommendation

Do not promote these wrappers one-by-one by simply adding them to `createCLI()`.

Recommended order:

1. Treat the wrapper set as an explicit legacy bucket.
2. Decide which surfaces still deserve a modern replacement.
3. For any surface that survives, redesign it against current persisted/runtime contracts first.
4. Only then register it in `createCLI()`.

## Suggested prioritization

### Redesigned from audit conclusion

- `status`
  - now revived as a thin operator view over persisted runs/DLQ state rather than the legacy feature-status mock path.
- `auth`
  - now revived as a live provider-auth management surface over `~/.obora/auth.json` rather than promoting the raw legacy wrapper.
- `agents`
  - now revived as a live operator surface with `list/show/set/reset`, resolution snapshots, and safe config-layer override previews rather than promoting the raw legacy wrapper.

### Likely keep legacy-only unless a concrete product need reappears

- `skills`
  - `docs/m3-sdk-cli-design.md` already classifies `new/plan/done/skills` as pre-pivot workflow UX rather than the modern runtime-centric CLI family.
- `new`
  - still writes `.obora/features/<name>/...` proposal/design/tasks/status scaffolds and points operators at `obora plan`, which is not part of the live runtime-centric CLI.
- `done`
  - still depends on `.obora/features/...` status files, placeholder DuckDB/git paths, and archive semantics from the pre-pivot feature workflow.

### Defer until a fresh product/UX decision exists

- `dashboard`
  - `docs/m3-sdk-cli-design.md` marks dashboard UI as out of scope for M3 and keeps `@obora/dashboard` as an M4 concern.
  - the old thin launcher wrapper has been removed from active CLI source instead of being kept around as a dormant command.
  - M4 revive roadmap is documented in `docs/plans/2026-04-15-dashboard-cli-m4-roadmap.md`.

## Immediate action taken

- `status` was redesigned and registered as a live top-level surface.
- `auth` was redesigned and registered as a live top-level surface.
- `agents` was redesigned and registered as a live top-level surface with introspection and safe override subcommands.
- `new` / `done` are now explicitly classified as legacy-only unless the feature-centric workflow returns.
- `skills` / `dashboard` legacy wrappers were removed from active CLI source instead of being kept as dormant shims.
- `dashboard` remains explicitly deferred until a fresh product UX decision exists.
- Revival criteria for remaining deferred surfaces are tracked in `docs/deferred-surface-revival-criteria.md`.
- The remaining legacy surfaces were not promoted automatically.
- `packages/cli/src/commands/__tests__/cli-commands.test.ts` now asserts that `new` / `done` / `skills` / `dashboard` stay out of `createCLI()` until a deliberate redesign happens.
- `packages/cli/src/commands/__tests__/legacy-shim-boundary.test.ts` now asserts that the retained legacy bucket (`new` / `done`) remains thin `_legacy/*` re-export shims until a deliberate redesign replaces them.
- Audit conclusion recorded here so future promotion work starts from an explicit baseline rather than accidentally wiring legacy commands into the live CLI.
