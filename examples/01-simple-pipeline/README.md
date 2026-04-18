# 01 — Simple Pipeline

## What this example demonstrates

- A minimal 3-step sequential workflow (`generate -> review -> format`)
- Basic policy controls (time limits, tool restrictions, sandbox)
- Retry/escalation recovery on failure

## Prerequisites

- Obora CLI installed
- Agent mappings configured in your Obora config (`writer`, `reviewer`, `formatter`)

## Run

```bash
obora run examples/01-simple-pipeline/workflow.yaml --policy examples/01-simple-pipeline/policy.yaml
```

## Expected result

- `generate`, `review`, `format` run in order
- `shell_exec` calls are denied by policy
- Persisted run / step / audit records can be inspected through the current operator surface (`obora status`, `obora runs`, `obora inspect`, `obora audit`)
