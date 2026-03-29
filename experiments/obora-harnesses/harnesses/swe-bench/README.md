# SWE-bench Harness

## Goal
Evaluate Obora as an agent OS on benchmark-style software repair tasks using structured discovery, validation, and repair loops.

## Harness Shape
Recommended workflow structure:
1. discover target
2. generate edit
3. validate edit
4. repair on failure

## Evaluation Principle
The benchmark should not be turned into a scripted solver.
That means:
- avoid task-specific answer injection
- let the agent discover and repair
- use external helpers for validation and orchestration, not for pre-solving the issue

## Failure Buckets
SWE-bench results should distinguish between:
- `PASS`
- `RUNTIME_FAIL`
- `QUALITY_FAIL`
- `INFRA_FAIL`

## Operating Defaults
- `OBORA_RUN_TIMEOUT_MS=240000`
- `discover_target.config.maxToolRounds=256`
- retry `SDK_8002`
- retry `429` with backoff

## Suggested Baselines
To make results interpretable, benchmark comparisons should include:
1. single-agent baseline
2. validation-only baseline
3. Obora OS workflow
4. enhanced long-running workflow

## Output Expectations
Each run should preserve enough artifacts to support analysis:
- `problem.txt`
- `target_file.txt`
- `edit.json`
- `validation-report.json` when available
- final status bucket

## Current Status
This README is a bootstrap draft for the dedicated harness repository and should later be moved into the standalone harness repository structure.
