# DuckDB verification for CLI run

`obora run` now writes workflow/step execution records to feature-local DuckDB:

- DB path: `.obora/features/<feature>/.obora/obora.db`
- Tables: `projects`, `workflow_runs`, `step_executions`, `metrics`

## Quick checks

```bash
# Latest workflow runs
duckdb .obora/features/<feature>/.obora/obora.db "SELECT id, project_id, feature, workflow, mode, status, started_at, completed_at FROM workflow_runs ORDER BY id DESC LIMIT 10;"

# Step executions for latest run
duckdb .obora/features/<feature>/.obora/obora.db "SELECT id, run_id, step_name, step_index, agent, status, retry_count, started_at, completed_at FROM step_executions ORDER BY id DESC LIMIT 20;"
```
