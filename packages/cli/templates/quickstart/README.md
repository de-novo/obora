# Obora Quickstart

## 1) Set your API key

Example with OpenAI:

```bash
export OPENAI_API_KEY=your_key_here
```

## 2) Diagnose setup

```bash
obora doctor
```

## 3) Run the judge example

```bash
obora run judge.yaml
```

## Files

- `judge.yaml` — one-file judge workflow
- `artifacts/submission.json` — sample input
- `artifacts/result.schema.json` — expected output schema
- `artifacts/result.json` — written after a successful run
