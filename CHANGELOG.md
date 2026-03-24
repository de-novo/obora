# Changelog

All notable changes to Obora will be documented in this file.

## [Unreleased]

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
