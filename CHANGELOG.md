# Changelog

All notable changes to Obora will be documented in this file.

## [Unreleased]

### Added — Release Readiness

- Added release readiness documentation for default gates, publish order, package payload checks, and manual publish flow.
- Added `verify:release`, `verify:compat`, and `verify:test-type-debt` root scripts.
- Added compatibility/deprecation and SDK/CLI test type-debt allowlists so release-readiness debt cannot grow silently.
- Aligned the GitHub publish workflow with the release scripts by publishing `@obora/adapters` between `@obora/runtime` and `@obora/sdk`.
- Switched package payload verification to `npm pack --dry-run` so release checks remain runnable before version bumps.
- Hardened publish payload checks so test artifacts cannot be included in release tarballs.
- Standardized active CLI/runtime compatibility wording so historical/deferred surfaces are not described as live legacy paths.

### Added — Contract-First Workflow DX

- Added explicit `input.bindings` support for path-based structured inputs with `{{binding}}` substitution.
- Added startup `Binding Preview` logging for resolved/missing input artifacts.
- Added step-level `output.schema` support for structured JSON output contracts.
- Added step-level `output.path` persistence for structured result artifacts.
- Added startup `Output Preview` logging for declared output path/schema.
- Added minimal schema diagnostics for common contract failures:
  - `SCHEMA_1001` invalid JSON output
  - `SCHEMA_1002` missing schema file
  - `SCHEMA_1003` contract mismatch (top-level object, required field, field type)
- Added runnable canonical example: `examples/07-contract-first-evaluation`.
- Added smoke coverage to keep the canonical contract-first example from drifting.

### Added — Documentation

- Added `docs/tutorials/04-contract-first-quickstart.md`.
- Added `docs/tutorials/05-contract-first-authoring-guide.md`.
- Updated `docs/getting-started.md` to highlight contract-first authoring.
- Updated `docs/tutorials/one-file-workflows.md` with `judge` mode and contract-first JSON in/out guidance.
- Updated `docs/api/sdk.md` to document the current `WorkflowStep` input/output contract surface.

### Fixed — CLI Packaging and Release Verification (2026-03-30)
- **CLI version mismatch fixed for next release**: `@obora/cli` patch release is bumped to `0.1.3` so corrected version wiring can be published as a fresh artifact instead of attempting to overwrite an existing version.
- **CLI version mismatch root cause identified**: published `@obora/cli` package can report an older version when stale `dist` artifacts are shipped alongside newer package metadata.
- **Release gate strengthened**: CLI publish flow now verifies changelog presence before publish.
- **Release verification strengthened**: release verification now checks that `CHANGELOG.md` has an `[Unreleased]` section with release-facing notes before package verification.
- **Sequential harness drivers normalized**: `run_30_sequential.sh` and `run_50_sequential.sh` now resolve repo/harness paths relative to script location instead of relying on machine-specific absolute paths.

### Added — Enterprise Reliability (2026-03-24)

#### P0: Foundation for Unattended Operation
- **Auto-Rollback**: TKG rollback on execution failure (not budget exceeded) (`6116919`)
- **Dead Letter Queue**: `FileDLQStore`, `createDLQEntry`, `resolveDLQEntry` for isolating unrecoverable failures (`6116919`)
- **Execution Lock**: `FileExecutionLock` with PID-based stale lock detection (`6116919`)
- **Auto-Recovery**: Checkpoint-based automatic resume with configurable retries (`6116919`)

#### P1: Reliability Hardening
- **Circuit Breaker**: LLM failure isolation with closed/open/half-open state machine (`6116919`)
- **Health Checker**: Stuck execution detection with pluggable check registration (`6116919`)
- **Alert Manager**: Webhook and console alert channels with severity filtering (`6116919`)

#### P2: Observability
- **Metrics Export**: `MetricsCollector` with Prometheus text format and JSON export (`edf3668`)
- **Dashboard DLQ Routes**: REST API for list, get, resolve, summary (`edf3668`)
- **Dashboard Metrics Routes**: `/api/metrics` (Prometheus) + `/api/metrics/json` (`edf3668`)

### Changed — Workflow Efficiency (2026-03-23~24)
- **No-progress escalation**: Human checkpoint after 5 repair attempts with no progress (`4aa77e8`)
- **Same-root-cause escalation**: Auto-escalation after 3 identical failure signatures (`4aa77e8`)
- **Cost limit reduction**: Max repair attempts lowered from 12 to 7 (`4aa77e8`)
- **Validator classification consistency**: Require explicit reason when changing failure classification (`4aa77e8`)
- **Cycle pin**: Prevent refine_idea from changing goals on re-run after timeout (`3f02097`)
- **Baseline authority**: Workspace current state takes priority over past cycle-logs (`3f02097`)

### Added — TKG Confidence Policy (2026-03-23)
- **Configurable conflict modes**: `signal_only`, `review`, `blocking` (`f752a2a`)
- **Review queue alignment**: Blocking conflicts sorted first in review queue (`d36cf17`)
- **Applied to experiments**: sandbox (blocking), overnight-builder (review) (`92aba75`)

### Enterprise Validation Results (2026-03-24)
- overnight-builder: 7/7 steps completed, 744/744 tests passed, 0 repair attempts, 40 minutes
- Previous run: 33 failures → 7 repairs → failed in 75 minutes
- DLQ: empty (no failures), Lock: properly released, Auto-rollback: not triggered (no failure)
