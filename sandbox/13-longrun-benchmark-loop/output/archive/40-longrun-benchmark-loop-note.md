# Longrun Benchmark Loop Archive Note

## Summary of Attempt

The workflow executed a runtime-native `solve_or_repair <-> judge` loop controlled by judge output:

1. **Initial Attempt**: An initial answer was generated (documented in prior step artifacts).
2. **Judge Evaluation**: The judge evaluated the initial attempt against the benchmark criteria.
3. **Repair Phase**: Based on judge feedback, a repair was performed to correct the answer.
4. **Final Judge**: The repaired attempt was re-evaluated and passed.

**Repaired Answer**: 12

**Reasoning**: The deployment window is 48 minutes total, split into 4 equal phases. The duration per phase is 48 ÷ 4 = 12 minutes.

## Benchmark Result

| Metric | Value |
|--------|-------|
| Verdict | PASS |
| Score | 10/10 |
| Correct Answer | 12 |
| Signature | stable-signature |

The repaired attempt provides the correct answer of 12, which matches the reference answer. The reasoning correctly identifies that a 48-minute deployment window split into 4 equal phases results in 48 ÷ 4 = 12 minutes per phase.

## Reuse Notes

### Workflow Pattern
- This benchmark demonstrated a successful `solve_or_repair <-> judge` loop pattern where:
  - Judge output directly controls whether repair is needed
  - Repair phase addresses specific correctness issues identified by judge
  - Loop terminates when judge returns `passed: true`

### Key Learnings
1. **Judge Control Flow**: The judge's `passed` boolean and `failedChecks` array drive the repair logic deterministically.
2. **Signature Stability**: The `stable-signature` indicates the answer is reproducible across runs.
3. **Repair Effectiveness**: The repair successfully corrected the initial incorrect answer by re-evaluating the arithmetic (48 ÷ 4 = 12).

### Reuse Considerations
- For similar arithmetic/division benchmarks, ensure initial attempts correctly parse and solve the problem before entering the repair loop.
- The `solve_or_repair` function should be able to accept judge feedback to guide repairs.
- Judge feedback should be specific enough to enable targeted repairs (e.g., "incorrect arithmetic" vs. generic "wrong answer").
