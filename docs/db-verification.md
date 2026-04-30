# SQLite verification for persisted runs

`obora run` / `obora runs` / `obora inspect` / `obora audit` 등 현재 운영 surface는 기본적으로 SQLite persistence를 기준으로 동작합니다.

기본 경로:

- DB path: `./data/obora.db`
- override: `.obora/config.yaml`의 `persistence.sqlite.path`

현재 기본 테이블:

- `runs`
- `steps`
- `artifacts`
- `checkpoints`
- `costs`
- `audit_events`

## Quick checks

```bash
# Latest persisted runs
sqlite3 ./data/obora.db "SELECT id, workflow_name, status, started_at, completed_at FROM runs ORDER BY started_at DESC LIMIT 10;"

# Step records for latest runs
sqlite3 ./data/obora.db "SELECT id, run_id, step_name, status, started_at, completed_at FROM steps ORDER BY started_at DESC LIMIT 20;"

# Audit events for latest runs
sqlite3 ./data/obora.db "SELECT id, run_id, step_name, event_type, created_at FROM audit_events ORDER BY created_at DESC LIMIT 20;"
```

## Notes

- `docs/legacy-cli-surface-audit.md`에 정리된 historical pre-pivot feature workflow / DuckDB 기반 설명은 현재 live CLI 기준이 아닙니다.
- 현재 live operator surface는 feature-local `.obora/features/<feature>/...` 경로보다 persisted runs + artifacts + DLQ 기준으로 보는 편이 맞습니다.
