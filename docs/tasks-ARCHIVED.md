# docs/tasks — Archived

> **Status**: Archived (2026-04-27)
>
> This directory previously contained P1 task documents from the M2/M3 development phase.
> The package structure referenced in these tasks (`packages/actor`, `packages/agents`,
> `packages/board`, `packages/blackboard`, etc.) was reorganized into the current
> monorepo layout (`packages/runtime`, `packages/adapters`, `packages/sdk`,
> `packages/cli`, `packages/dashboard`) during the M4+ transition.
>
> The archived documents remain available at `archive/docs-tasks/` for historical
> reference but should not be used as implementation guides without verifying against
> the current codebase.

## Current Package Structure

| Package | Description |
|---------|-------------|
| `packages/runtime` | AI Control Runtime — orchestration, patterns, consensus, actors |
| `packages/adapters` | LLM, tool, and auth integration adapters |
| `packages/sdk` | Programmatic API for workflow execution |
| `packages/cli` | Command-line interface (`obora`) |
| `packages/dashboard` | Web monitoring and control server |

## Where to Find Current Tasks

- Active planning: `docs/plans/`
- Implementation status: Check `git log` and package-level READMEs
