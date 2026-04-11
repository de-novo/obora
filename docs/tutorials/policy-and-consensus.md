# Tutorial: Policy and Consensus

**Estimated time:** 15 minutes  
**Audience:** Developers who already built a basic workflow

## What you'll learn

In this tutorial, we'll add control layers to your workflow:

- Tool restrictions with policy
- Time/resource limits
- Consensus rules for critical steps
- A gate that enforces approval logic
- What happens when rules are violated

## Prerequisites

- You completed [Tutorial: First Workflow](./first-workflow.md), or you have a working Obora project
- Obora CLI installed

---

## Step 1) Create a workflow with consensus and a gate

We'll create a workflow that requires multi-agent agreement before completion.

```bash
mkdir -p workflows policies
cat > workflows/policy-consensus-workflow.yaml << 'EOF'
name: policy-consensus-workflow
version: "1.0.0"
policy: "./../policies/policy-consensus.yaml"

steps:
  - name: draft
    agent: facilitator
    description: "Create initial proposal"
    timeout: "5m"

  - name: discussion
    agent: facilitator
    pattern: discussion
    depends_on: [draft]
    participants:
      agent-a: opus
      agent-b: codex
      agent-c: glm
    discussion:
      max_rounds: 3
      convergence: majority
      on_deadlock: escalate
    timeout: "10m"

  - name: approval
    agent: facilitator
    pattern: consensus
    depends_on: [discussion]
    participants:
      agent-a: opus
      agent-b: codex
      agent-c: glm
    consensus:
      rule: majority
      min: 2
      of: 3
      timeout: "5m"
      best_effort: [glm]

recovery:
  discussion:
    on_fail: escalate
    to: "human-moderator"
  approval:
    on_fail: retry
    max_retries: 1
    backoff: linear
    backoff_base: "2s"
EOF
```

---

## Step 2) Create policy YAML (tools + limits + gate)

Now we'll enforce policy constraints:

- `shell_exec` is denied
- `web_search` requires consensus gate
- resource limits are explicit
- `approval` step is a required consensus gate

```bash
cat > policies/policy-consensus.yaml << 'EOF'
version: "1.0"

tools:
  file_read:
    allowed: true
  file_write:
    allowed: true
  web_search:
    allowed: true
    gate:
      type: consensus
      timeout: "2m"
  shell_exec:
    allowed: false

sandbox:
  root: "./output"
  deny_outside_root: true

resources:
  timeout_ms: 900000
  max_tokens: 120000
  max_tool_calls: 60

gates:
  - step: approval
    type: consensus
    required: true
    timeout: "5m"
    fallback: escalate
EOF
```

---

## Step 3) Run with policy and consensus enabled

```bash
obora run workflows/policy-consensus-workflow.yaml --policy policies/policy-consensus.yaml
```

---

## Step 4) Verify expected behavior

When everything is valid, you should see:

- `draft` and `discussion` run normally
- `approval` waits for and evaluates consensus
- workflow succeeds when consensus reaches `2/3`

---

## Step 5) Confirm violation behavior

Now let's intentionally violate policy by denying a tool used in your flow.

```bash
cat > policies/policy-consensus-deny-write.yaml << 'EOF'
version: "1.0"

tools:
  file_read:
    allowed: true
  file_write:
    allowed: false
  shell_exec:
    allowed: false

sandbox:
  root: "./output"
  deny_outside_root: true

resources:
  timeout_ms: 600000
  max_tokens: 80000
  max_tool_calls: 20
EOF
```

Run again:

```bash
obora run workflows/policy-consensus-workflow.yaml --policy policies/policy-consensus-deny-write.yaml
```

Expected result:

- Execution is blocked when denied behavior is reached
- CLI exits with an error code (typically validation/execution related)
- You get explicit policy feedback instead of silent failure

---

## Next step

Nice. You now control execution with explicit policies and gates.

Let's make Obora extensible by building your own plugin:

➡️ [Tutorial: Custom Plugin](./custom-plugin.md)
