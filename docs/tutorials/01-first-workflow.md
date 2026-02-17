# Tutorial 01: Your First Workflow

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

- Node.js 18+
- npm or pnpm
- A terminal

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

- `workflows/example.yaml`
- `policies/default.yaml`
- `obora.config.yaml`

---

## Step 3) Write your first workflow YAML

Let's create a simple 3-step workflow.

Create `workflows/first-workflow.yaml`:

```bash
cat > workflows/first-workflow.yaml << 'EOF'
name: first-workflow
version: "1.0.0"
policy: "./../policies/default.yaml"

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

audit:
  store: duckdb
  path: "./.obora/audit/first-workflow.duckdb"
  retention: "30d"
EOF
```

> If your environment uses different agent names, replace `writer`, `reviewer`, and `formatter` with your mapped agents.

---

## Step 4) Run the workflow

Now let's execute it:

```bash
obora run workflows/first-workflow.yaml
```

You can also run in validation mode first:

```bash
obora run workflows/first-workflow.yaml --dry-run
```

---

## Step 5) Verify the result

You should see each step run in order:

- `generate`
- `review`
- `finalize`

And you should have an audit DB file:

```bash
ls -la .obora/audit/first-workflow.duckdb
```

If the file exists and the command succeeded, your first workflow is complete 🎉

---

## Next step

Great job. Now let's add stronger runtime control with policy and consensus:

➡️ [Tutorial 02: Adding Policies and Consensus](./02-policy-and-consensus.md)
