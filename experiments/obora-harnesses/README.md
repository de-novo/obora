# obora-harnesses

A dedicated open-source repository for Obora-based harnesses, benchmarks, evaluation flows, and generated application artifacts.

## Purpose
This repository exists to keep the main Obora repository focused on the core runtime, SDK, CLI, and official product documentation, while allowing harnesses and generated artifacts to evolve independently.

It is intended to host:
- benchmark harnesses
- validation/repair workflows
- long-running application harnesses
- PR review and issue-triage workflows
- generated web, CLI, server, and full-stack artifacts
- comparison results and evaluation reports

## Philosophy
Obora should be used as an **agent OS**, not as a scripted solver.

That means:
- agents perform discovery, implementation, and repair
- harnesses provide orchestration, validation, reporting, and runtime controls
- problem-specific answer injection should be avoided
- result interpretation must distinguish quality failures from runtime failures

## Repository Areas
- `docs/` — philosophy, operating defaults, methodology, governance
- `harnesses/` — benchmark and automation harnesses
- `generated/` — generated applications and validated artifacts
- `shared/` — reusable validators, reporters, schemas, and scripts
- `comparisons/` — benchmark comparisons and result summaries

## Initial Focus
The first migration target should be the SWE-bench harness and its validated operating defaults.

After that, the repository can expand toward:
- PR review automation
- issue triage automation
- long-running app generation
- generated artifact showcases

## Evaluation Rules
All benchmark reporting should separate:
- `PASS`
- `RUNTIME_FAIL`
- `QUALITY_FAIL`
- `INFRA_FAIL`

This distinction is required for honest evaluation of Obora as an agent OS.

## Status
This document is an initial bootstrap draft for the repository structure and operating philosophy.
