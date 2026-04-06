# 07 — Contract-First Evaluation

## What this example demonstrates
- Explicit `input.bindings` for structured input artifacts
- `{{binding}}` prompt substitution
- Step-level `output.path` persistence
- Step-level `output.schema` contract declaration
- Startup preview for input/output contract inspection

## Files
- `workflow.yaml` — contract-first workflow definition
- `artifacts/submission.json` — sample input payload
- `artifacts/rubric.json` — sample scoring rubric
- `artifacts/result.schema.json` — minimal output contract

## How it works
1. The workflow binds `submission.json` and `rubric.json` into named inputs
2. The task prompt references them via `{{submission}}` and `{{rubric}}`
3. The model is instructed to `Return JSON only`
4. Obora applies the declared output contract
5. The final JSON result is written to `artifacts/result.json`

## Run
```bash
# Provide a real model key for your provider
export OPENAI_API_KEY=your-key

obora run examples/07-contract-first-evaluation/workflow.yaml
```

You can also discover this example from:
- `docs/getting-started.md`
- `docs/tutorials/04-contract-first-quickstart.md`
- `docs/tutorials/05-contract-first-authoring-guide.md`

> Replace the provider/model in `workflow.yaml` if your environment uses a different default.

## Expected result
- Startup logs include:
  - `Execution Resolution`
  - `Binding Preview`
  - `Output Preview`
- The workflow writes `artifacts/result.json`
- If the model output is not valid JSON, you should see `SCHEMA_1001`
- If required fields are missing or field types mismatch, you should see `SCHEMA_1003`

## Key YAML pattern
```yaml
steps:
  - name: evaluate_submission
    agent: evaluator
    input:
      bindings:
        submission:
          path: artifacts/submission.json
          kind: json
        rubric:
          path: artifacts/rubric.json
          kind: json
      task: |
        Evaluate {{submission}} using {{rubric}}.
        Return JSON only.
    output:
      path: artifacts/result.json
      schema: artifacts/result.schema.json
```

## Notes
- Current schema support is intentionally minimal.
- The current contract checks focus on:
  - valid JSON
  - schema file presence
  - top-level object expectation
  - required field mismatch
  - field type mismatch
- This example is meant to show the recommended current authoring style for structured evaluation steps.
