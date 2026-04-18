# 05 — Dashboard Monitoring

## What this example demonstrates

- Workflow connected to monitoring-oriented audit output
- Alert step with external gate and escalation
- Policy-level notification gating for safer outbound actions

## Prerequisites

- Obora CLI installed
- Agent mappings configured: `collector`, `analyst`, `notifier`
- Dashboard package available if you want to inspect audit events

## Run

```bash
obora run examples/05-dashboard-monitoring/workflow.yaml --policy examples/05-dashboard-monitoring/policy.yaml
```

## Optional: open dashboard (example)

```bash
pnpm --filter @obora/dashboard dev
```

## Expected result

- Pipeline runs `ingest -> analyze -> alert`
- Persisted run / step / audit records can be inspected through the current operator surface (`obora status`, `obora runs`, `obora inspect`, `obora audit`)
- External gate controls alert dispatch and escalation behavior
