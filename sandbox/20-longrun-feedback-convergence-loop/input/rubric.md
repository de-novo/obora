# Rubric

Score the candidate by counting how many of the following checks are explicitly and concretely satisfied.

- `C1` - names the deliverable as Obora canonical sandbox step 20
- `C2` - states that all outputs stay sandbox-local
- `C3` - mentions the long-running runner contract with watchdog and large safety ceiling
- `C4` - states that the workflow contains four candidate versions and four evaluations
- `C5` - states that scores must improve monotonically across evaluations
- `C6` - states that the convergence loop stops only when the final score reaches at least 9/10
- `C7` - states as a workflow invariant that every revision after v1 must read and apply the immediately previous evaluation feedback
- `C8` - requires an archive note with the headings Summary of Convergence, Score Trajectory, and Reuse Notes
- `C9` - requires verification invariants covering logs, workflow result JSON, and regenerated artifacts on fresh run
- `C10` - includes a reuse note for adapting the same pattern to other structured checklist tasks

The score is the number of passed checks, reported as an integer out of 10.
