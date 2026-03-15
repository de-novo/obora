# Refined Execution Plan: 10-longrun-mini

## 1. Refined Goal

Establish sandbox/10-longrun-mini as a canonical reference for minimal long-running workflow configuration in Obora, demonstrating proper runner idle watchdog integration and extended execution safety ceiling for workflows requiring sustained operation.

## 2. Refined Plan

**Phase 1: Directory Setup**
- Initialize sandbox/10-longrun-mini with required structure
- Create input/ for source materials
- Create output/final/ for deliverable artifacts

**Phase 2: Runner Configuration**
- Define idle watchdog parameters:
  - Idle detection interval: 30 seconds
  - Idle threshold before warning: 60 seconds
- Set safety ceiling for extended execution:
  - Maximum runtime: 3600 seconds (1 hour)
  - Grace period before termination: 300 seconds

**Phase 3: Artifact Generation**
- Step 1: Generate initial plan (01-plan.md) ✓
- Step 2: Generate refined plan (02-refined-plan.md) ✓
- Step 3: Generate archive note with execution summary

**Phase 4: Verification**
- Validate artifact completeness
- Confirm runner configuration persisted
- Document execution metrics

## 3. Operating Notes

- **Idle Watchdog**: Monitors step execution for stalls; triggers warning at threshold, termination at safety ceiling
- **Safety Ceiling**: Prevents runaway execution; set conservatively for long-running operations
- **Artifact Naming**: Use sequential prefix (01-, 02-) for clear ordering
- **Minimal Scope**: This sandbox demonstrates configuration only; no actual long-running computation
- **Preservation**: All artifacts in output/final/ are canonical deliverables
