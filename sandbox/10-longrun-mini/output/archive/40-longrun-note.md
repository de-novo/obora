# Archive Note: 10-longrun-mini

## 1. Summary of Run

Sandbox 10-longrun-mini established a canonical reference for minimal long-running workflow configuration in Obora. The run produced:

- **01-plan.md**: Initial execution plan with runner idle watchdog and safety ceiling parameters
- **02-refined-plan.md**: Refined plan with 4-phase implementation covering directory setup, runner configuration (idle detection: 30s interval, 60s warning threshold), safety ceiling (3600s max runtime, 300s grace period), artifact generation sequence, and verification

Configuration demonstrates:
- Idle watchdog integration for monitoring step execution stalls
- Extended execution safety ceiling for sustained operations
- Sequential artifact naming convention for ordering clarity

## 2. Why Preserved

This sandbox serves as the authoritative reference implementation for:

1. **Long-running workflow configuration** - Minimal, copy-pasteable pattern for projects requiring extended execution windows
2. **Idle watchdog setup** - Canonical parameter values (30s/60s) for stall detection
3. **Safety ceiling calibration** - Reference values (3600s/300s) balancing execution time vs. runaway prevention
4. **Artifact organization** - Sequential naming pattern (01-, 02-) for clear deliverable ordering

The preserved artifacts provide a template for future long-running workflow implementations without requiring rediscovery of these configuration patterns.

## 3. Reuse Notes

**When to reuse this pattern:**
- Workflows requiring >300 seconds execution time
- Steps with indeterminate completion times (e.g., external API polling, file watching)
- Projects needing idle detection for debugging stalled executions

**Key parameters to calibrate per use case:**
- `idle_detection_interval`: Reduce for latency-sensitive workflows; increase for reduced overhead
- `idle_threshold_warning`: Set to 2x expected step silence duration
- `max_runtime_ceiling`: Set to 1.5x worst-case execution scenario
- `grace_period`: Set to allow cleanup operations before termination

**Copy template from:**
- Runner configuration: Section 2, Phase 2 of 02-refined-plan.md
- Directory structure: Section 2, Phase 1 of 02-refined-plan.md

**Avoid:**
- Using this pattern for short-running workflows (<60s) - adds unnecessary complexity
- Setting safety ceiling <600s - insufficient for legitimate long operations
- Omitting grace period - risks data loss on termination
