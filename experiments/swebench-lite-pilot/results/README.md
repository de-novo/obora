# Results Format

Store pilot outputs as JSONL so each task result is appended as a single immutable row.

- One line equals one completed task attempt.
- Keep unresolved tasks in the file; do not delete failures.
- Use `results/result-record.schema.json` as the field guide.
- Use `sample-results.jsonl` as a concrete example.
