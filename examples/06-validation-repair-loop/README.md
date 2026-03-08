# 06 — Validation Repair Loop

## What this example demonstrates
- Runtime-native `build_or_repair -> validate -> build_or_repair` loop
- Structured `ValidationResult` output from a validator step
- `repair_loop` config for repair-aware re-entry
- `toolLimits` for expensive tools while leaving file tools effectively unlimited
- `stepTools` injection through `OboraRuntime`

## Files
- `workflow.yaml` — repair-loop workflow definition
- `agents.yaml` — agent role descriptions
- `custom-tools.mjs` — example validator tool (`validate_release_note`)
- `run.mjs` — runtime entrypoint that injects custom step tools

## How it works
1. `build_or_repair` creates or updates `artifacts/release-note.md`
2. `validate` runs the custom validator tool
3. The validator returns a structured `ValidationResult`
4. On failure, Obora uses `on_fail.goto` to re-enter `build_or_repair`
5. The repair step receives repair context with the latest validation failure
6. The loop stops on pass or on exhaustion / no-progress

This example intentionally uses a **custom validation tool** so you can see where `toolLimits` belongs: on the validator / external-cost side, not on local file tools.

## Run
```bash
# build the SDK once if needed
pnpm --filter @obora/sdk build

# provide a real model key
export ZAI_API_KEY=your-key

node examples/06-validation-repair-loop/run.mjs
```

## Expected result
- The workflow writes `artifacts/release-note.md`
- The validator checks for required markers:
  - a `# Release Note` heading
  - a `READY` marker
- If the first draft misses a requirement, the repair step updates the file and the second validation passes
- Console output includes the final execution status and audit summary

## Key YAML pattern
```yaml
steps:
  - name: build_or_repair
    agent: builder
    config:
      repair_loop:
        enabled: true
        validation_step: validate
        max_no_progress_iterations: 2
      toolLimits:
        validate_release_note: 3

  - name: validate
    agent: validator
    depends_on: [build_or_repair]
    config:
      validation:
        enabled: true
        emit_structured_result: true
      toolLimits:
        validate_release_note: 1
    on_fail:
      goto: build_or_repair
      max_iterations: 3
      escalate_on_exhaust: fail
```

## Notes
- `toolLimits` should be used for external / expensive tools.
- Built-in file tools (`file_read`, `file_write`, `file_list`) usually do not need limits for generation steps.
- This example is intentionally small so the repair-loop mechanics are easy to inspect.
