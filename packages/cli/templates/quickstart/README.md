# Obora Quickstart

## First run

1) Set your API key

Example with OpenAI:

```bash
export OPENAI_API_KEY=***
```

2) Check readiness

```bash
obora doctor
```

3) Validate before execution

```bash
obora run judge.yaml --dry-run
```

4) Run the judge example

```bash
obora run judge.yaml
```

## Files

- `judge.yaml` — one-file judge workflow
- `artifacts/submission.json` — sample input
- `artifacts/result.schema.json` — expected output schema
- `artifacts/result.json` — written after a successful run
