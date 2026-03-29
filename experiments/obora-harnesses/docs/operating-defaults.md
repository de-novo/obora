# Operating Defaults

## Purpose
This document records validated runtime defaults for Obora-based harnesses in this repository.

## Current Recommended Defaults
### Workflow
- Primary benchmark workflow: `obora-os-workflow.yaml`
- Discovery should happen inside the workflow when possible
- Validation and repair should remain explicit and structured

### Runtime
- `OBORA_RUN_TIMEOUT_MS=240000`
- `discover_target.config.maxToolRounds=256`
- retry `SDK_8002` with a short retry loop
- retry `429` with backoff
- keep a short pause between samples in large benchmark runs

### Source of Truth
Final validation should use workflow artifacts as the source of truth.

Order of precedence:
1. `artifacts/target_file.txt`
2. fallback: `artifacts/edit.json.target_file`

Shell-discovered target hints are not final truth if the workflow performs discovery.

## Failure Buckets
Recommended reporting buckets:
- `PASS`
- `RUNTIME_FAIL`
- `QUALITY_FAIL`
- `INFRA_FAIL`

## Reporting Minimums
Every experiment summary should include at least:
- total
- pass
- fail
- runtime_fail
- quality_fail
- infra_fail
- pass_rate

## Notes
These defaults are not intended to be universal forever. They are current validated defaults based on benchmark and long-running harness experiments and should evolve through explicit measurement.
