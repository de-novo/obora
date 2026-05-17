# @obora/ops

Obora Ops is the new operator-facing web surface for graph workflow authoring,
system prompt management, and execution history inspection.

## Status

- `@obora/ops` is the active web direction for new operator UI work.
- `@obora/dashboard` remains available only as the legacy monitoring/bootstrap
  surface while release and smoke gates still depend on it.
- New workflow authoring UI should start here, not in `@obora/dashboard`.

## Development

```bash
pnpm --filter @obora/ops dev
pnpm --filter @obora/ops typecheck
pnpm --filter @obora/ops test
pnpm --filter @obora/ops build
```
