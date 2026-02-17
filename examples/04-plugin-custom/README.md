# 04 — Custom Plugin Pattern

## What this example demonstrates
- A workflow step using a custom pattern (`custom-summary`)
- A minimal plugin implementation (`my-plugin.ts`)
- Fallback behavior when custom pattern execution fails

## Prerequisites
- Obora CLI installed
- Agent mappings configured: `collector`, `processor`, `writer`
- Runtime integration that registers `custom-summary` from `my-plugin.ts`

## Run
```bash
obora run examples/04-plugin-custom/workflow.yaml
```

## Expected result
- `summarize-with-plugin` runs via the registered custom pattern
- If custom pattern fails, fallback step `summarize-fallback` executes
- Final output is produced by `finalize`
