# Tutorial 01: 3-Minute Quickstart

**Estimated time:** 3 minutes  
**Audience:** First-time users who want the shortest path to a successful Obora run

## Goal

By the end of this tutorial, you will:

1. create a minimal Obora project
2. confirm provider/model/auth readiness
3. preview the run before execution
4. produce a JSON result artifact

---

## Prerequisites

- Node.js 20+
- one provider API key in your shell

Example:

```bash
export OPENAI_API_KEY=***
```

If you prefer Anthropic or ZAI, export that provider key instead.

---

## Step 1) Install the CLI

```bash
npm install -g @obora/cli
```

---

## Step 2) Create a quickstart project

```bash
obora init my-project --quickstart
cd my-project
```

This creates:

- `judge.yaml`
- `artifacts/submission.json`
- `artifacts/submission.schema.json`
- `artifacts/result.schema.json`
- `.obora/config.yaml`

---

## Step 3) Check readiness

```bash
obora doctor
```

You want to see:

- which provider was resolved
- which model was resolved
- where auth came from
- what to do next

If `doctor` reports missing auth or stub mode, jump to:

- [LLM Config / Auth Quickstart](./06-llm-config-auth-quickstart.md)
- [Quick Troubleshooting](./03-quick-troubleshooting.md)

---

## Step 4) Preview before execution

```bash
obora run judge.yaml --dry-run
```

This validates the workflow and shows:

- provider / model / auth resolution
- binding preview for `artifacts/submission.json`
- output preview for `artifacts/result.json`

---

## Step 5) Run it

```bash
obora run judge.yaml
```

After a successful run, check:

```bash
cat artifacts/result.json
```

---

## What to do next

Recommended next path:

1. [Judge Quickstart](./02-judge-quickstart.md)
2. [LLM Config / Auth Quickstart](./06-llm-config-auth-quickstart.md)
3. [Contract-First Quickstart](./04-contract-first-quickstart.md)
4. [Quick Troubleshooting](./03-quick-troubleshooting.md)

## Mental model

For first-time setup, use this default split:

- secret → env
- default provider/model → `.obora/config.yaml`
- temporary override → runtime `llm`
