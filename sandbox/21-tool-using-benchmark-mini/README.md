# 21 Tool-Using Benchmark Mini Sandbox

> status: **active / canonical step 21**
>
> This sandbox adds the first canonical benchmark where local tool output is materially required to produce the final answer.

## Purpose

- preserve the long-running runner contract with watchdog, idle timeout, and a large safety ceiling
- introduce the smallest honest tool-using benchmark pattern
- require the solver to use local Obora tools to discover and inspect benchmark artifacts
- keep solver, judge, and archive roles separate

## Input

- `input/problem.md`
- `input/tool-task.md`
- `input/reference-answer.md`
- `input/tool-data/`

## Output

- `output/final/01-attempt.md`
- `output/final/02-verdict.md`
- `output/archive/40-tool-using-benchmark-note.md`
- `output/iterations/logs/run.log`
- `output/iterations/logs/run.tail.log`
- `output/iterations/results/tool-using-benchmark-mini-*.json`

## Run

```bash
# verify existing outputs
sandbox/21-tool-using-benchmark-mini/verify.sh

# rerun the sandbox
sandbox/21-tool-using-benchmark-mini/run.sh

# clear outputs, rerun, then verify
sandbox/21-tool-using-benchmark-mini/verify.sh --fresh
```

## Success Criteria

- the workflow finishes with `completed`
- execution goes through the watchdog wrapper
- the solver uses local tool output from `input/tool-data/` as part of the answer
- `01-attempt.md` records the final answer, short reasoning, tool used, and observed tool output summary
- `02-verdict.md` records a PASS verdict only when the answer matches the reference and tool-use evidence is present
- the archive note captures the reusable tool-using benchmark pattern

## Why This Is Canonical

- unlike earlier benchmark steps, the answer is not available from a single named fixture file in the prompt
- the solver must first discover the benchmark report filenames via tool output, then inspect those reports to answer
- this keeps step 21 minimal and auditable while leaving step 22 available for the loop variant

## Workflow Graph (ASCII)

```text
[run-with-watchdog]
  -> [solve-with-tool]
  -> [judge-tool-result]
  -> [archive-tool-benchmark]
```
