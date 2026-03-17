# Rubric

Score the candidate by counting how many of the following checks are explicitly and concretely satisfied.

- `C1` - names the deliverable as Obora canonical sandbox step 20
- `C2` - states that all outputs stay sandbox-local
- `C3` - mentions the long-running runner contract with watchdog and large safety ceiling
- `C4` - states that step 20 is a runtime-native cyclic loop using `build_or_repair -> validate` with a real back-edge
- `C5` - states that the validator emits structured validation results that the runtime uses for loop control
- `C6` - states that every repair attempt reads and applies the latest validation feedback when present
- `C7` - states that the loop terminates only when the score reaches at least `9/10`, plus bounded-stop behavior, not by a fixed four-stage script
- `C8` - requires a convergence history plus an archive note with the headings Summary of Convergence, Score Trajectory, and Reuse Notes
- `C9` - requires verification invariants covering repeated loop execution in logs, workflow result JSON, final PASS, and regenerated artifacts on fresh run
- `C10` - includes a reuse note for adapting the same pattern to other structured checklist tasks

The score is the number of passed checks, reported as an integer out of 10.
