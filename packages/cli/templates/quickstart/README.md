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

This prints the resolved provider/model context plus a preview of:
- `artifacts/submission.json`
- `artifacts/submission.schema.json`
- `artifacts/result.json`
- `artifacts/result.schema.json`

4) Run the judge example

```bash
obora run judge.yaml
```

## Files

- `judge.yaml` — one-file judge workflow
- `artifacts/submission.json` — sample input
- `artifacts/result.schema.json` — expected output schema
- `artifacts/result.json` — written after a successful run

## Read next

If you want the shortest onboarding path, continue with the main Obora docs:

1. https://github.com/de-novo/obora/blob/main/docs/tutorials/01-3-minute-quickstart.md
2. https://github.com/de-novo/obora/blob/main/docs/tutorials/02-judge-quickstart.md
3. https://github.com/de-novo/obora/blob/main/docs/tutorials/03-quick-troubleshooting.md
4. https://github.com/de-novo/obora/blob/main/docs/tutorials/06-llm-config-auth-quickstart.md
