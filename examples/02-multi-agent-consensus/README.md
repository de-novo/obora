# 02 — Multi-Agent Consensus

## What this example demonstrates
- A 3-agent decision flow: `brainstorm -> discussion -> voting`
- Structured discussion rounds with deadlock handling
- Majority-based consensus with timeout and best-effort participant

## Prerequisites
- Obora CLI installed
- Agent mappings configured: `facilitator`, `opus`, `codex`, `glm`

## Run
```bash
obora run examples/02-multi-agent-consensus/workflow.yaml --policy examples/02-multi-agent-consensus/policy.yaml
```

## Expected result
- `discussion` runs with up to 3 rounds
- `voting` completes when majority is reached (2/3)
- Deadlock or timeout escalates per recovery/policy rules
