# Summary of Convergence

This sandbox demonstrates a runtime-native cyclic feedback loop in Obora using a `build_or_repair -> validate` step pair with an `on_fail.goto` back-edge. The workflow runs under the long-running runner contract with a watchdog and bounded-stop safeguards. Each validation attempt produces structured results consumed by the runtime for loop control. Repair steps read and apply the latest validation feedback to improve the candidate artifact.

Termination is threshold-driven: the loop exits when the score reaches 9/10 or when bounded-stop conditions trigger (repeated-signature count, no-progress ceiling, repeated critical issue). This is not a fixed four-stage script; it is a genuine runtime loop controlled by validation outcomes.

Convergence achieved: score 9/10, final verdict PASS. C9 (verification invariants concretely demonstrated) was not fully satisfied but does not block the PASS decision at the 9/10 threshold.

# Score Trajectory

| Attempt | Score | Verdict | Failed Checks |
|---------|-------|---------|---------------|
| 1 | 4/10 | FAIL | C5, C6, C7, C8, C9, C10 |
| 2 | 7/10 | FAIL | C8, C9, C10 |
| 3 | 9/10 | PASS | C9 |

Trajectory analysis:
- Attempt 1: Initial candidate missing C5–C10 (runtime loop description, feedback application, termination criteria, convergence history, reuse notes).
- Attempt 2: Repair addressed C5–C7; C8–C10 still failing.
- Attempt 3: Repair addressed C8 and C10; C9 remains undemonstrated but score 9/10 meets threshold.

# Reuse Notes

To adapt this runtime-native feedback-convergence pattern to other small structured checklist tasks:

1. Define a rubric with explicit checks (e.g., C1–CN) and a score threshold for convergence.
2. Provide a brief describing the deliverable, constraints, and any domain-specific requirements.
3. Configure the runner with:
   - Long-running contract and watchdog
   - Bounded-stop ceilings (repeated-signature, no-progress, repeated-critical)
   - Loop control via `on_fail.goto` back-edge from validate to build_or_repair
4. Ensure the validator emits structured results (score, verdict, failed checks) that the runtime can consume.
5. Maintain a validation history log (table of attempts, scores, verdicts, failed checks) for auditability.
6. Produce an archive note with Summary of Convergence, Score Trajectory, and Reuse Notes after convergence.

This pattern works well for iterative refinement tasks where a rubric can be codified and a threshold determines success. Examples include specification documents, compliance checklists, configuration templates, and any artifact that can be scored against a deterministic rubric.
