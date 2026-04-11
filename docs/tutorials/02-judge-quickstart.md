# Tutorial 02: Judge Quickstart

**Estimated time:** 5 minutes
**Audience:** Users who want the shortest JSON-in / JSON-out evaluation path

## What judge mode is

`judge` mode is the shortest Obora path for a single evaluation task:

- JSON input
- one evaluation step
- JSON result artifact
- optional schema contract on both ends

This is the best onboarding surface when you do not want to learn the full workflow DSL yet.

---

## The minimal project path

Create the bundled quickstart project first:

```bash
obora init my-project --quickstart
cd my-project
```

The generated `judge.yaml` already gives you a runnable example.

---

## The generated workflow

```yaml
name: quickstart-judge
mode: judge
provider: openai
model: gpt-4o-mini
prompt: |
  Evaluate the submission and return JSON with fields score, verdict, rationale.
input:
  json: artifacts/submission.json
  schema: artifacts/submission.schema.json
output:
  path: artifacts/result.json
  schema: artifacts/result.schema.json
```

Read it as:

- load JSON from `artifacts/submission.json`
- validate the expected input shape with `artifacts/submission.schema.json`
- ask the model to return JSON only
- write the result to `artifacts/result.json`
- validate the result against `artifacts/result.schema.json`

---

## First run

1) Set auth in env

```bash
export OPENAI_API_KEY=***
```

2) Check readiness

```bash
obora doctor
```

3) Preview the resolved execution

```bash
obora judge --dry-run
```

4) Execute

```bash
obora judge
```

If you want to try a different payload without editing `judge.yaml`, you can also point `--input` at a JSON file:

```bash
obora judge --input @artifacts/submission.json --dry-run
obora judge --input @artifacts/submission.json
```

If the payload is coming from another command, stdin is also supported:

```bash
cat artifacts/submission.json | obora judge --input @- --dry-run
cat artifacts/submission.json | obora judge --input @-
```

---

## What to inspect before execution

`--dry-run` is useful because it shows the parts beginners usually get wrong:

- resolved provider
- resolved model
- auth source
- binding preview
- output preview
- fallback / stub warnings

If the preview is wrong, fix resolution first before editing prompts.

---

## When to use `obora models`

If you want a different model ref, inspect the provider catalog first:

```bash
obora models openai
obora models openai gpt-5.4
obora models anthropic opus
```

Use this when:

- you are not sure which model refs exist
- `doctor` recommends a provider/model you want to inspect
- you need to change `.obora/config.yaml` safely

---

## When to move beyond judge mode

Stay with `judge` mode when you only need:

- one input
- one evaluation step
- one JSON result

Move to fuller workflow authoring when you need:

- multiple dependent steps
- repair loops
- parallel review or routing
- shell hooks or richer orchestration

Next docs after this:

- [LLM Config / Auth Quickstart](./06-llm-config-auth-quickstart.md)
- [One-File Workflows](./one-file-workflows.md)
- [Contract-First Quickstart](./04-contract-first-quickstart.md)
