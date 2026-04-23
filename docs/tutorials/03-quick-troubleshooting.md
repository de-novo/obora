# Tutorial 03: Quick Troubleshooting

**Estimated time:** 3 minutes
**Audience:** First-time users who are blocked in the install → doctor → quickstart → run path

## Use this page for the common first-run failures

The fastest recovery rule is:

1. run `obora doctor`
2. run `obora validate judge.yaml` if you changed the quickstart workflow
3. read the resolved provider/model/auth source
4. fix resolution before changing prompts or workflow YAML

---

## 1) `doctor` says auth is missing or stub mode is active

### Symptom

- `doctor` does not show a ready state
- `judge --dry-run` or `run ... --dry-run` warns about fallback or stub mode

### Fix

Export one provider API key in your shell:

```bash
export OPENAI_API_KEY=***
# or
export ANTHROPIC_API_KEY=***
# or
export ZAI_API_KEY=***
```

Then run:

```bash
obora doctor
```

If you need the recommended setup split, read:

- [LLM Config / Auth Quickstart](./06-llm-config-auth-quickstart.md)

---

## 2) `doctor` shows a provider conflict

### Symptom

You configured one provider, but another provider key is active in env.

Examples:

- config says `anthropic`
- env only has `OPENAI_API_KEY`
- resolved provider becomes `openai`

### Fix

Option A — use the configured provider in this shell

```bash
unset OPENAI_API_KEY OPENAI_MODEL
```

Option B — switch the project default provider in `.obora/config.yaml`

```yaml
defaults:
  provider: openai
```

After the change:

```bash
obora doctor
```

---

## 3) You are not sure which model ref to use

### Symptom

- you want to change models
- a model name looks wrong
- you want to inspect valid refs before editing config

### Fix

Query the catalog first:

```bash
obora models openai
obora models openai gpt-5.4
obora models anthropic opus
```

Then update `.obora/config.yaml` with a real model ref.

---

## 4) `judge --dry-run` or `run ... --dry-run` preview does not match what you expected

### Symptom

- wrong provider/model shows up
- binding preview points to the wrong artifact
- output preview is not what you intended

### Fix

Check in this order:

1. `obora validate judge.yaml`
2. `obora expand --json -- judge.yaml` if the workflow shape still looks suspicious
3. `obora doctor`
4. `.obora/config.yaml`
5. environment variables like `OPENAI_MODEL`, `ANTHROPIC_MODEL`
6. `judge.yaml` input/output paths

For the bundled quickstart, these are the important files:

- `judge.yaml`
- `artifacts/submission.json`
- `artifacts/submission.schema.json`
- `artifacts/result.schema.json`

---

## 5) The workflow runs but result validation fails

### Symptom

- execution starts
- output file is written or attempted
- schema validation fails

### Fix

Check the output contract first:

- prompt says JSON only
- `output.schema` matches the fields you expect
- your schema is not stricter than your prompt allows

For the quickstart template, the result schema expects:

- `score`
- `verdict`
- `rationale`

---

## Fast recovery loop

Use this order every time:

```bash
obora doctor
obora validate judge.yaml
# Optional: inspect the expanded one-file workflow after edits
obora expand --json -- judge.yaml
obora --json expand judge.yaml
obora judge --dry-run
obora judge
```

If the first three commands look correct, the live run usually becomes much easier to debug.

## Next docs

- [3-Minute Quickstart](./01-3-minute-quickstart.md)
- [Judge Quickstart](./02-judge-quickstart.md)
- [LLM Config / Auth Quickstart](./06-llm-config-auth-quickstart.md)
- [One-File Workflows](./one-file-workflows.md)
