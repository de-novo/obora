# Tutorial: First Workflow

**Estimated time:** 10 minutes  
**Audience:** Developers who are new to Obora

## What you'll learn

In this tutorial, we'll build and run your first Obora workflow from scratch.

By the end, you'll know how to:

- Install the CLI
- Initialize a project
- Write a workflow YAML file
- Run the workflow
- Confirm the result

## Prerequisites

- Node.js 20+
- npm or pnpm
- one provider API key in your shell
- a terminal

Example:

```bash
export OPENAI_API_KEY=***
```

---

## Step 1) Install Obora CLI

Let's install the CLI globally:

```bash
npm install -g @obora/cli
```

Check that it works:

```bash
obora --help
```

---

## Step 2) Initialize a project

Now we'll create a fresh project folder and initialize Obora:

```bash
mkdir my-obora-first-workflow
cd my-obora-first-workflow
obora init --yes
```

This creates a basic project structure, including:

- `workflow.yaml`
- `policy.yaml`
- `agents.yaml`
- `obora.config.yaml`

---

## Step 3) Write your first workflow YAML

Let's update the generated `workflow.yaml` to a simple 3-step workflow.

```bash
cat > workflow.yaml << 'EOF'
name: first-workflow
version: "1.0.0"
policy: "./policy.yaml"

steps:
  - name: generate
    agent: writer
    description: "Generate a short draft"
    tools: [file_write]
    timeout: "5m"

  - name: review
    agent: reviewer
    depends_on: [generate]
    description: "Review the generated draft"
    tools: [file_read]
    timeout: "5m"

  - name: finalize
    agent: formatter
    depends_on: [review]
    description: "Format final output"
    tools: [file_read, file_write]
    timeout: "3m"

recovery:
  review:
    on_fail: retry
    max_retries: 1
    backoff: linear
    backoff_base: "1s"
EOF
```

> If your environment uses different agent names, replace `writer`, `reviewer`, and `formatter` with your mapped agents.

---

## Step 4) Check readiness and run the workflow

Before executing a custom workflow, confirm provider/model/auth resolution first:

```bash
obora doctor
obora run workflow.yaml --dry-run
obora run workflow.yaml
```

---

## Step 5) Verify the result

You should see each step run in order:

- `generate`
- `review`
- `finalize`

And you should be able to inspect the persisted result with the current operator surface:

```bash
obora status
obora runs list
```

If the workflow completed and the operator commands can see the run, your first workflow is complete 🎉

---

## If you get blocked

Use this order before changing the workflow YAML again:

- `obora doctor`
- `obora run workflow.yaml --dry-run`
- [Quick Troubleshooting](./03-quick-troubleshooting.md)
- [LLM Config / Auth Quickstart](./06-llm-config-auth-quickstart.md)

## Next step

Great job. Now let's add stronger runtime control with policy and consensus:

➡️ [Tutorial: Policy and Consensus](./policy-and-consensus.md)
