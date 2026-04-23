# Tutorial 06: LLM Config / Auth Quickstart

**Estimated time:** 5 minutes  
**Audience:** Developers who want the simplest recommended way to configure provider, model, and auth for Obora

## What you'll learn

In this tutorial, you'll use the recommended happy path for Obora LLM setup:

1. put the API key in the environment
2. put the default provider/model in project config
3. run a workflow

This is the easiest path for first-time users.

---

## The recommended rule

Use this default rule unless you have a strong reason not to:

- **auth in env**
- **provider/model in project `.obora/config.yaml`**
- **runtime `llm` override only for advanced or temporary cases**

---

## Step 1) Set your API key in env

Pick the provider you want to use and export its key.

```bash
# OpenAI
export OPENAI_API_KEY=your-key

# or ZAI
export ZAI_API_KEY=your-key

# or Anthropic
export ANTHROPIC_API_KEY=your-key
```

> For first-time setup, env is the simplest auth path.

---

## Step 2) Create or edit project config

If you started from quickstart, `.obora/config.yaml` already exists.
If not, create it in your project.

```bash
mkdir -p .obora

cat > .obora/config.yaml << 'EOF'
defaults:
  provider: openai

providers:
  openai:
    defaultModel: gpt-4o-mini
EOF
```

If you prefer ZAI instead:

```yaml
defaults:
  provider: zai

providers:
  zai:
    defaultModel: glm-4.7
```

### Why this is the recommended split

- env is better for secrets
- project config is better for provider/model defaults
- this keeps auth and model selection easy to understand
- if you later want a managed auth store, use `obora auth add/list/test/remove` as a separate operator workflow

---

## Step 3) Verify resolution on the quickest path

If you are following the onboarding path, use the quickstart project directly:

```bash
obora doctor
obora validate judge.yaml
# Optional: inspect the expanded one-file workflow after edits
obora expand --json -- judge.yaml
obora --json expand judge.yaml
obora judge --dry-run
obora judge
```

If you want a normal multi-step workflow instead, you can still run one explicitly:

```bash
obora run examples/07-contract-first-evaluation/workflow.yaml --dry-run
obora run examples/07-contract-first-evaluation/workflow.yaml
```

---

## Step 4) Read the startup summary

At startup, Obora prints an execution summary.
Look for lines like:

```text
Execution Resolution
- provider: openai
- model: gpt-4o-mini
- auth source: env(OPENAI_API_KEY)
- config source: /path/to/.obora/config.yaml
- model source: provider(openai).defaultModel
```

This tells you:

- which provider was selected
- which model was selected
- where auth came from
- which config file influenced the result

---

## When to use runtime `llm`

Use runtime `llm` only when you need a temporary or programmatic override.

```ts
const runtime = new OboraRuntime({
  llm: {
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY!,
    model: "gpt-4o-mini",
  },
});
```

### Good use cases

- tests
- temporary experiments
- app-level runtime overrides

### Not the best default for beginners

- everyday project setup
- team-shared workflow defaults

---

## When to use `authRef`

`authRef` is useful, but treat it as an advanced path.

Example:

```yaml
providers:
  openai:
    authRef: env:OPENAI_API_KEY
    defaultModel: gpt-4o-mini
```

This is helpful when you want provider config to declare where auth comes from.
But for first use, plain env + project config is simpler.

---

## Recommended mental model

If you're unsure where to put something, use this rule:

- **secret** → env
- **project default provider/model** → `.obora/config.yaml`
- **temporary override** → runtime `llm`

---

## Common mistakes

### Mistake 1: putting everything in runtime `llm`

This works, but it is less friendly for shared project defaults.

### Mistake 2: mixing too many layers at once

If you are just getting started, do not combine:

- env
- authRef
- runtime overrides
- workflow-local provider/model
  all at the same time.

Start with the simplest path first.

### Mistake 3: debugging the workflow before debugging resolution

Before changing prompts or workflow steps, first confirm:

- provider
- model
- auth source
- config source

from the startup summary.

---

## Next step

Once this setup is working, continue with:

- [Judge Quickstart](./02-judge-quickstart.md)
- [Quick Troubleshooting](./03-quick-troubleshooting.md)
- [Contract-First Quickstart](./04-contract-first-quickstart.md)
- [Contract-First Authoring Guide](./05-contract-first-authoring-guide.md)
- [One-File Workflows](./one-file-workflows.md)
