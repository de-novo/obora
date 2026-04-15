# Tutorial 04: Contract-First Quickstart

**Estimated time:** 10 minutes  
**Audience:** Developers who want a faster, more explicit authoring style for structured workflows

## What you'll learn

In this tutorial, you'll write a workflow that declares:

- explicit input bindings
- an explicit output path
- an explicit output schema
- a JSON-only contract for the model response

By the end, you'll have a workflow that is easier to inspect before execution and easier to validate after execution.

## Prerequisites

- You already have a working Obora project, or you completed:
  - [3-Minute Quickstart](./01-3-minute-quickstart.md)
  - [Judge Quickstart](./02-judge-quickstart.md)
- You can run `obora run ...` successfully

---

## Step 1) Create the input and schema artifacts

Let's create a small input payload, a rubric, and an output schema.

```bash
mkdir -p artifacts

cat > artifacts/submission.json << 'EOF'
{
  "title": "Example submission",
  "body": "The answer is clear and concise."
}
EOF

cat > artifacts/rubric.json << 'EOF'
{
  "criteria": ["clarity", "correctness"],
  "scale": "0..1"
}
EOF

cat > artifacts/result.schema.json << 'EOF'
{
  "type": "object",
  "required": ["score", "verdict"],
  "properties": {
    "score": { "type": "number" },
    "verdict": { "type": "string" }
  }
}
EOF
```

---

## Step 2) Write a contract-first workflow

Now create a workflow that binds the input artifacts explicitly and declares the output contract explicitly.

> If you want a ready-to-run version instead of creating files manually, see:
> `examples/07-contract-first-evaluation/`

```bash
cat > workflow-contract-first.yaml << 'EOF'
name: contract-first-evaluation
version: "1.0"

agents:
  evaluator:
    provider: openai
    model: gpt-4o-mini

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
EOF
```

> Replace the provider/model with whatever is valid in your environment.

---

## Step 3) Preview and run the workflow

```bash
obora run workflow-contract-first.yaml --dry-run
obora run workflow-contract-first.yaml
```

At execution start, you should now see a clearer startup summary, including:

- execution resolution
- binding preview
- output preview

That gives you a quick preflight check before the step runs.

---

## Step 4) Inspect the result artifact

If the workflow succeeds, the structured result should be persisted automatically.

```bash
cat artifacts/result.json
```

You should see a JSON object similar to:

```json
{
  "score": 0.9,
  "verdict": "accept"
}
```

---

## Step 5) Understand failure modes

When `output.schema` is declared, Obora now produces short diagnostics for common failures.

### Invalid JSON

- `SCHEMA_1001`
- The model did not return valid JSON.

### Missing schema file

- `SCHEMA_1002`
- The declared schema file path does not exist.

### Contract mismatch

- `SCHEMA_1003`
- The JSON shape does not match the declared contract.

Examples:

- `missing required field(s): verdict`
- `field 'score' should be number, got string`
- `missing required field(s): meta.summary`
- `field 'tags[1]' should be string, got integer`
- `field 'verdict' should be one of: accept, reject; got "maybe"`
- `field 'value' did not match any allowed schema option`
- `field 'value' did not match exactly one schema option`
- `field 'value' did not satisfy all schema requirements`

---

## Why this style is useful

This authoring style makes the workflow easier to reason about because:

- input files are declared structurally
- output expectations are declared structurally
- startup logs preview both sides of the contract
- the final artifact is persisted automatically

In short: it reduces hidden assumptions in the prompt.

---

## Next step

If you want an even shorter path for JSON-in / JSON-out evaluation, continue with one-file judge mode:

➡️ [One-File Workflows](./one-file-workflows.md)
