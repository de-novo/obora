# Obora DX Contract-First Summary

## 한줄 결론

Obora DX 개선은 이제 contract-first authoring을 실제 runtime, 문서, example, test에 걸쳐 일관되게 드러내는 상태에 도달했다.

---

## What changed

### Runtime surface
- execution resolution summary
- short actionable diagnostics
- judge mode minimal runtime path
- `input.bindings` substitution
- binding preview at startup
- `step.output.schema` handling
- `step.output.path` persistence
- output preview at startup
- minimal detailed schema mismatch diagnostics

### Documentation surface
- contract-first quickstart tutorial
- contract-first authoring guide
- getting-started integration
- one-file workflow docs updated with judge mode and contract-first framing
- SDK API docs updated for input/output contract surface

### Example surface
- runnable canonical example:
  - `examples/07-contract-first-evaluation`
- docs now link directly to that example

### Test surface
- judge mode e2e
- binding DX test
- binding preview test
- step output schema tests
- canonical contract-first example smoke test

---

## Why it matters

Before this work, structured workflows were possible but often felt prompt-first.
Important execution assumptions were easy to hide in prose.

After this work, the preferred path is clearer:
- declare inputs explicitly
- declare outputs explicitly
- inspect startup preview
- persist structured output artifacts
- get shorter, more actionable schema diagnostics

This does not make Obora fully contract-driven yet.
But it does make the direction real in product behavior.

---

## Recommended current authoring style

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

---

## Current limits

The current contract layer is intentionally minimal.
It currently focuses on:
- JSON parse validity
- schema file presence
- top-level object expectation
- required field mismatch
- field type mismatch
- nested object mismatch
- array item type mismatch
- enum mismatch
- minimal `anyOf` handling
- minimal `oneOf` handling
- minimal `allOf` handling

It does not yet provide full JSON Schema coverage.

---

## Final statement

> Obora DX is now materially more contract-first than before, and that change is visible in runtime behavior, docs, runnable examples, and regression tests.
