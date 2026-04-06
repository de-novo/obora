# Contract-First Authoring Guide

**Audience:** Workflow authors who want clearer input/output contracts and better startup visibility

## Overview

Obora workflows have historically been flexible but prompt-heavy.
That works, but it can hide important execution assumptions inside prose.

The newer authoring direction is **contract-first**:

- declare inputs explicitly
- declare outputs explicitly
- make startup previews visible
- keep structured steps JSON-only when the output contract is strict

This guide explains the recommended current pattern.

---

## 1. Declare inputs structurally

Prefer this:

```yaml
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
```

Instead of this:

```yaml
input:
  task: |
    Read artifacts/submission.json and artifacts/rubric.json.
    Evaluate them and write something useful.
```

### Why

The first version makes it clear:
- which artifacts are inputs
- what their names are in the prompt
- which parts of the prompt are stable vs. substituted

---

## 2. Declare outputs structurally

Prefer this:

```yaml
output:
  path: artifacts/result.json
  schema: artifacts/result.schema.json
```

### Why

This makes the output contract visible at the step definition level.
It also allows Obora to:

- attempt structured JSON parsing automatically
- fail early with short diagnostics
- persist the output artifact automatically

---

## 3. Keep structured responses strict

When `output.schema` is present, the safest prompt style is:

```yaml
task: |
  Evaluate {{submission}} using {{rubric}}.
  Return JSON only.
```

### Avoid

- free-form commentary before the JSON
- markdown explanations mixed with the final payload
- ambiguous output instructions

### Why

Strict prompts reduce parse failures and make schema diagnostics more meaningful.

---

## 4. Use startup preview as a preflight check

At execution start, Obora can show a startup summary like this:

```text
Execution Resolution
- provider: openai
- model: gpt-4o-mini
- auth source: env(OPENAI_API_KEY)
- config source: ...
- model source: runtime.llm
- fallback/stub: disabled
- warnings: none
Binding Preview
- evaluate_submission.submission: json <- artifacts/submission.json [resolved]
- evaluate_submission.rubric: json <- artifacts/rubric.json [resolved]
Output Preview
- evaluate_submission: path <- artifacts/result.json [pending]; schema <- artifacts/result.schema.json [resolved]
```

### What to check

Before worrying about model quality, first verify:
- required bindings are resolved
- schema files exist
- output path is what you intended

This catches many authoring mistakes before they turn into confusing runtime failures.

---

## 5. Understand the current schema validation boundary

Current `output.schema` support is intentionally minimal.

### Already supported
- valid JSON parse requirement
- schema file presence check
- top-level object expectation
- required field mismatch
- field type mismatch
- nested object required/type mismatch
- array item type validation (`items.type`)
- enum mismatch validation
- minimal `anyOf` support
- minimal `oneOf` support
- minimal `allOf` support

### Not yet fully supported
- deep / complete JSON Schema coverage
- richer combinator branch diagnostics beyond the current minimal subset
- `$ref` / shared schema composition
- rich string/number constraints beyond the current minimal subset

So treat the current contract layer as:
- immediately useful
- intentionally partial
- designed to grow without changing the authoring style again

---

## 6. Migration advice

If you already have prompt-first workflows, the easiest migration path is:

1. move file paths into `input.bindings`
2. replace prose references with `{{binding}}`
3. add `output.path`
4. add `output.schema`
5. tighten the task prompt to `Return JSON only`

This usually gives the largest DX improvement with the smallest workflow rewrite.

---

A ready-to-run reference for this style is available at:

- `examples/07-contract-first-evaluation/`

## 7. Recommended current pattern

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

If you need the shortest possible contract-first path for a single evaluation, consider one-file judge mode.

---

## Final note

Obora is not fully contract-driven yet, but it is no longer purely prompt-driven either.

The recommended authoring style today is:

> explicit inputs, explicit outputs, and visible startup previews.
