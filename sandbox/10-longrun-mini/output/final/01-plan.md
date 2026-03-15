# Execution Plan: 10-longrun-mini

## 1. Goal

Create Obora's tenth canonical sandbox demonstrating a minimal long-running workflow with proper runner configuration.

Objectives:
- Show minimal form of long-running workflow
- Runner uses idle watchdog and large safety ceiling
- Preserve plan, refined plan, and archive note artifacts

## 2. Plan

Phase 1: Setup
- Create directory structure under sandbox/10-longrun-mini
- Initialize input/ and output/final/ directories

Phase 2: Configuration
- Define runner configuration with:
  - Idle watchdog (detect inactive periods)
  - Large safety ceiling (allow extended execution time)

Phase 3: Execution
- Run minimal workflow steps
- Generate artifacts in sequence:
  1. Plan (this document)
  2. Refined plan
  3. Archive note

Phase 4: Verification
- Confirm all required artifacts exist
- Validate runner configuration applied correctly

## 3. Risks

Risk 1: Runner timeout
- Mitigation: Ensure safety ceiling is sufficiently large

Risk 2: Missing artifacts
- Mitigation: Verify each phase produces expected output before proceeding

Risk 3: Incorrect watchdog behavior
- Mitigation: Test idle detection with controlled delays
