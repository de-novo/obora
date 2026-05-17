# Obora Workflow CLI Design

## Goal
모든 workflow 기능을 CLI로 표현 가능하도록 설계

## Supported Workflow Features

### 1. Basic Step
```bash
obora workflow add-step <file> <name> \
  --agent <agent> \
  --description "..." \
  --depends-on "step1,step2" \
  --input "task: do something"
```

### 2. Pattern Steps
```bash
# Consensus
obora workflow add-step <file> <name> \
  --pattern consensus \
  --participants "reviewer-1,reviewer-2,reviewer-3" \
  --config.consensus.rule majority \
  --config.consensus.min-votes 3

# Peer Review
obora workflow add-step <file> <name> \
  --pattern peer-review \
  --participants "r1,r2" \
  --config.peer-review.min-score 70 \
  --config.peer-review.max-p0 0 \
  --config.peer-review.parallel true

# Judge
obora workflow add-step <file> <name> \
  --pattern judge \
  --config.judge.enabled true \
  --config.judge.input-json "input.json" \
  --config.judge.output-path "output.json"

# Discussion
obora workflow add-step <file> <name> \
  --pattern discussion \
  --participants "p1,p2,p3"
```

### 3. On-Fail (Feedback Loop)
```bash
obora workflow add-step <file> <name> \
  --agent <agent> \
  --on-fail-goto "previous-step" \
  --on-fail-max-iterations 3 \
  --on-fail-escalate human \
  --on-fail-cooldown-ms 1000 \
  --on-fail-reset-state \
  --on-fail-max-cost 0.5

# Conditional routing
obora workflow add-step <file> <name> \
  --on-fail-route "suggestedTargets.includes('step1'):step1" \
  --on-fail-route "failedChecks.some(c => c.name.includes('syntax')):syntax-fix" \
  --on-fail-route "default:human-review"
```

### 4. Gate
```bash
# Simple gate
obora workflow add-step <file> <name> \
  --gate "approval-gate"

# Typed gate
obora workflow add-step <file> <name> \
  --gate.type "manual" \
  --gate.approvers "user1,user2"
```

### 5. Parallel Branches
```bash
obora workflow add-step <file> <name> \
  --parallel "agent1:prompt1.txt" \
  --parallel "agent2:prompt2.txt" \
  --merge consensus
```

### 6. Output
```bash
obora workflow add-step <file> <name> \
  --output-path "result.json" \
  --output-schema "schema.json"
```

### 7. Validation & Repair Loop
```bash
obora workflow add-step <file> <name> \
  --validation-enabled \
  --repair-loop-enabled \
  --repair-loop-validation-step "validate-step" \
  --repair-loop-max-no-progress 3 \
  --repair-loop-max-total-attempts 10
```

### 8. Hooks
```bash
obora workflow add-step <file> <name> \
  --hook-pre-step "scripts/pre.sh" \
  --hook-post-step "scripts/post.sh"
```

### 9. Tool
```bash
obora workflow add-step <file> <name> \
  --tool "custom-tool"
```

## Config Object Design

All `--config.*` options are collected into the step's `config` object:
- `--config.<key>.<subkey> <value>` → `config: { key: { subkey: value } }`
- Values are auto-typed: number, boolean, string

## Implementation Plan

1. Update `workflow-manager.ts` - Add comprehensive step creation options
2. Update CLI command - Parse all new options
3. Build and test
