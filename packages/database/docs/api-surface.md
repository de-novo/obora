# @obora/database API Surface (TASK-049)

## Summary

`@obora/database` now exposes a single, explicit public API surface based on the DuckDB client implementation.

- Removed legacy/stub API: `src/duckdb.ts` (`Database` class)
- Added explicit public surface module: `src/public-api.ts`
- `src/index.ts` now exports only `public-api.ts`
- Test-only singleton helpers moved to `src/testing.ts`

## Public API

Exported from package root (`@obora/database`):

### Class
- `OboraDatabase`

### Types
- `Project`
- `WorkflowRun`
- `StepExecution`
- `Metric`

### Functions
- Project CRUD:
  - `insertProject`
  - `getProject`
  - `getProjectByPath`
  - `listProjects`
  - `updateProject`
  - `deleteProject`
- WorkflowRun CRUD:
  - `insertWorkflowRun`
  - `getWorkflowRun`
  - `listWorkflowRuns`
  - `updateWorkflowRunStatus`
  - `deleteWorkflowRun`
- StepExecution CRUD:
  - `insertStepExecution`
  - `getStepExecution`
  - `listStepExecutions`
  - `updateStepExecutionStatus`
  - `incrementStepRetry`
  - `deleteStepExecutions`
- Metrics CRUD:
  - `insertMetric`
  - `getMetricsForRun`
  - `getMetricsForStep`
  - `aggregateMetric`
  - `deleteMetrics`

## Internal / Test-only API

These are intentionally excluded from package root exports:

- `getDatabase`
- `resetDatabase`

They are available from:

- `@obora/database/testing` (via `src/testing.ts`)

> These helpers are intended for tests and should not be used by production consumers.

## Deprecated / Removed

### Removed
- `Database` class from `src/duckdb.ts` (stub implementation)

Rationale:
- Not used by production callers
- Duplicated/conflicted API surface with the actual implementation (`OboraDatabase`)

## Migration Plan

### For consumers importing from package root
No action required if already using:
- `OboraDatabase`
- CRUD functions listed in public API

### For consumers importing stub `Database`
Migrate to `OboraDatabase` and CRUD helpers.

### For test code using singleton helpers
Change imports:

```ts
// before
import { getDatabase, resetDatabase } from "@obora/database";

// after
import { getDatabase, resetDatabase } from "@obora/database/testing";
```
