# 03 — Policy Gate (Human Approval)

## What this example demonstrates
- A human approval gate before a sensitive publish step
- Policy-level gate enforcement and escalation on timeout
- Clear separation between generation/review and release approval

## Prerequisites
- Obora CLI installed
- Agent mappings configured: `author`, `reviewer`, `approver`, `publisher`
- Human approver path available in your runtime environment

## Run
```bash
obora run examples/03-policy-gate/workflow.yaml --policy examples/03-policy-gate/policy.yaml
```

## Expected result
- Workflow pauses at `approval-gate` in `waiting` state
- Human approval allows `publish` to continue
- Timeout triggers escalation to `release-manager`
