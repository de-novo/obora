# Objective

Define a reproducible, runtime-native feedback-convergence workflow for Obora canonical sandbox step 20. The same candidate is built or repaired, validated, and sent back through a real back-edge loop until a score threshold is reached.

# Constraints

- All outputs remain sandbox-local under `/Users/denovo/workspace/github/obora-kit/sandbox/20-longrun-feedback-convergence-loop/`.
- Step 20 runs under the long-running runner contract with a watchdog and large safety ceiling.
- The loop is runtime-native: `build_or_repair -> validate` with a real back-edge (no pre-scripted stages).
- Convergence threshold is 9/10.
- Loop terminates only when the score reaches at least 9/10, plus bounded-stop behavior, not by a fixed four-stage script.
- The validator emits structured validation results that the runtime uses for loop control.
- Every repair attempt reads and applies the latest validation feedback when present.

# Proposed Approach

- Feedback applied from latest validation: C8, C9, C10.
- Runtime loop:
  - `build_or_repair` creates or repairs the candidate artifact at `output/final/01-current.md`.
  - `validate` scores the candidate against C1–C10 and emits structured results.
  - Runtime reads validation results; if score < 9/10 and no stop condition, re-enter `build_or_repair` with feedback.
- Bounded-stop behavior:
  - Stop on score >= 9/10.
  - Stop on repeated-signature count >= 2 (same failed-checks signature twice in a row).
  - Stop on no-progress ceiling >= 2 (no score improvement across consecutive attempts).
  - Stop on repeated critical issue ceiling >= 2 (same critical issue repeated).

## Convergence History and Archive Note

- Maintain `output/iterations/30-validation-history.md` with a table:
  - Columns: Attempt, Score, Verdict, Failed Checks.
  - Current history: Attempt 1: 4/10 FAIL (C5–C10); Attempt 2: 7/10 FAIL (C8–C10).
- After each validation, append a row to the history.
- Archive note headings under the **Success Check** section below:
  - Summary of Convergence: current status and last failed checks.
  - Score Trajectory: list of scores per attempt.
  - Reuse Notes: guidance for adapting this pattern.

## Verification Invariants

- Repeated loop execution in logs: each cycle logs `build_or_repair` -> `validate` with attempt number and score.
- Workflow result JSON: final JSON includes `passed: true` and `score: >= 9` on convergence.
- Final PASS: only emitted when score >= 9/10.
- Regenerated artifacts on fresh run: running the workflow from scratch reproduces the same artifact paths and scoring behavior (deterministic given same inputs and rubric).

## Reuse Note for Other Structured Checklist Tasks

- To adapt this pattern:
  - Define a rubric with explicit checks (e.g., C1–CN) and a score threshold.
  - Provide a brief describing the deliverable and constraints.
  - Configure the runner with watchdog and bounded-stop limits.
  - Ensure the validator emits structured results the runtime can consume.
  - Maintain a validation history log and archive note with Summary of Convergence, Score Trajectory, and Reuse Notes.

# Risks

- Repair may stall if the same failed-checks signature repeats without score improvement.
- Large iteration counts may accumulate long logs; rely on bounded-stop ceilings.
- Changes to rubric checks invalidate prior history.

# Success Check

- Convergence threshold: score >= 9/10.
- All checks C1–C10 explicitly and concretely satisfied.
- Validation history shows monotonic or stable score progression toward threshold.
- Final workflow result JSON records `passed: true`.

## Summary of Convergence

- Current attempt: 3.
- Last failed checks: C8, C9, C10.
- Status: repair in progress targeting C8, C9, C10 to reach threshold.

## Score Trajectory

- Attempt 1: 4/10 FAIL
- Attempt 2: 7/10 FAIL

## Reuse Notes

- Pattern is reusable for any structured checklist task with a rubric and threshold.
- Maintain validation history and archive note for auditability.
