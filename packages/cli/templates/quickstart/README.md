# Obora Quickstart

## First run

1. Set your API key

Example with OpenAI:

```bash
export OPENAI_API_KEY=***
```

2. Check readiness

```bash
obora doctor
```

3. Validate the workflow file

```bash
obora validate judge.yaml
```

If you edit `judge.yaml` and want deeper inspection, expand the one-file workflow:

```bash
obora expand --json -- judge.yaml
obora --json expand judge.yaml
```

4. Preview before execution

```bash
obora judge --dry-run
```

This prints the resolved provider/model context plus a preview of:

- `artifacts/submission.json`
- `artifacts/submission.schema.json`
- `artifacts/result.json`
- `artifacts/result.schema.json`

5. Run the judge example

```bash
obora judge
```

Optional: inspect or override the quickstart reviewer agent

```bash
obora agents show reviewer
obora agents set reviewer --model gpt-5.4 --dry-run
```

This only mutates project/global `.obora/config.yaml` agent overrides. It does not rewrite workflow-local `agents` or other execution-only sources.

If you want to test a different payload without editing `judge.yaml`, you can also load JSON from a file:

```bash
obora judge --input @artifacts/submission.json --dry-run
obora judge --input @artifacts/submission.json
```

If the payload is coming from another command, stdin is also supported:

```bash
cat artifacts/submission.json | obora judge --input @- --dry-run
cat artifacts/submission.json | obora judge --input @-
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
