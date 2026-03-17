# Summary of Convergence

This sandbox demonstrates a **repeated evaluation-driven improvement workflow** where a candidate artifact is iteratively drafted, evaluated against a rubric, revised based on feedback, and re-evaluated until reaching a quality threshold. This is **not a one-shot repair process**—each iteration explicitly reads and applies the immediately previous evaluation feedback, producing progressively refined candidates.

The workflow began with v1 scoring 4/10 and converged through four revision cycles to v4 scoring 10/10. Each revision addressed specific failed rubric checks identified in the preceding evaluation, demonstrating how structured feedback loops enable systematic quality improvement.

Key characteristics of this convergence pattern:
- **Monotonic improvement**: Scores increased or stayed equal at each iteration (never decreased)
- **Threshold-based termination**: The loop continued until achieving the minimum required score (9/10+)
- **Invariant-driven revisions**: Every post-v1 revision explicitly consumed prior evaluation feedback
- **Reproducible verification**: Logs, workflow result JSON, and regenerated artifacts provide audit trails

# Score Trajectory

| Iteration | Candidate | Evaluation | Score | Status |
|-----------|-----------|------------|-------|--------|
| 1 | v1 | e1 | **4/10** | Failed 6 checks (C5–C10) |
| 2 | v2 | e2 | **6/10** | Failed 4 checks (C7–C10) |
| 3 | v3 | e3 | **8/10** | Failed 2 checks (C9–C10) |
| 4 | v4 | e4 | **10/10** | All checks passed |

**Sequence: 4 → 6 → 8 → 10**

Each iteration addressed a progressively smaller set of remaining issues:
- v1→v2: Added monotonic scoring constraint (C5) and convergence stop condition (C6)
- v2→v3: Added revision-feedback invariant (C7) and archive-note requirement (C8)
- v3→v4: Added verification invariants (C9) and reuse guidance (C10)

# Reuse Notes

This feedback-convergence pattern can be adapted to any small structured checklist task by modifying three core components:

## 1. Rubric Substitution

Replace the 10-check rubric with domain-specific criteria:
- Define 5–15 discrete, binary-checkable items
- Ensure each check is independently verifiable
- Order checks by logical dependency (foundational checks first)

## 2. Iteration Count Calibration

Adjust the maximum iteration ceiling based on task complexity:
- **Simple tasks** (5–7 checks): 2–3 iterations typically sufficient
- **Moderate tasks** (8–12 checks): 3–4 iterations (as in this sandbox)
- **Complex tasks** (13+ checks): 4–6 iterations may be needed

Set the safety ceiling conservatively to prevent runaway loops while allowing adequate refinement.

## 3. Threshold Configuration

Calibrate the minimum passing score to domain requirements:
- **Exploratory/draft work**: 6/10 threshold permits faster convergence
- **Production-ready artifacts**: 9/10 threshold ensures thoroughness (used here)
- **Safety-critical domains**: Consider 10/10 threshold with broader rubric coverage

## Pattern Template

```
1. Initialize: brief.md + rubric.md → workspace
2. Loop (max N iterations):
   a. Generate/revise candidate based on prior feedback
   b. Evaluate candidate against rubric
   c. If score ≥ threshold: exit loop
   d. Else: generate feedback for next revision
3. Archive: final candidate + evaluation + convergence note
4. Verify: logs + workflow-result.json + fresh-run reproducibility
```

## Applicable Use Cases

- **Document drafting**: Style guide compliance, formatting standards
- **Code review preparation**: Linting rules, security checklist adherence
- **Specification validation**: Requirements coverage, constraint satisfaction
- **Test case generation**: Coverage criteria, edge case inclusion
- **Configuration hardening**: Security baseline, best practice alignment

The key insight is that **iterative feedback with explicit rubric-based evaluation** produces more reliable convergence than single-pass generation, especially for tasks with multiple independent quality criteria.
