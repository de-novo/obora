# Multi-Run Comparison Loop Archive Note

## 1. Summary of Loop

The multi-run comparison loop executed a runtime-native `compare_or_repair` ↔ `validate_comparison` cycle to evaluate three execution runs against a reference answer.

**Initial State (Partial):**
- 2 of 3 runs passed (66.67% pass rate)
- run-1: PASS (answer: 15)
- run-2: FAIL (answer: 14 — arithmetic error)
- run-3: PASS (answer: 15)

**Validator-Driven Remediation:**
The initial validation detected run-2 as failing due to an arithmetic error (120 ÷ 8 computed as 14 instead of 15). The validation step signaled `compare_or_repair` to fix only the failing run while preserving the passing runs.

**Final State (PASS):**
- 3 of 3 runs passed (100% pass rate)
- run-1: PASS (answer: 15)
- run-2: PASS (answer: 15 — repaired)
- run-3: PASS (answer: 15)

**Loop Iterations:** 1 repair cycle required to achieve full pass rate.

## 2. Final Comparison Result

**Verdict: PASS** — All three runs evaluated against the reference answer (15) and passed with 100% pass rate.

| Run ID | Final Answer | Status | Notes |
|--------|--------------|--------|-------|
| run-1 | 15 | PASS | Correct reasoning, explicit division wording |
| run-2 | 15 | PASS | Repaired from initial error (14 → 15) |
| run-3 | 15 | PASS | Correct reasoning using ÷ symbol |

**Validation Signature:** stable-signature

The final comparison is acceptable for archive with no further remediation required.

## 3. Reuse Notes

**Pattern:** Runtime-native compare_or_repair ↔ validate_comparison loop

**Key Behaviors:**
1. **Targeted Repair:** The validator identified only the failing run (run-2) and instructed repair without modifying passing runs (run-1, run-3).
2. **Deterministic Termination:** Loop terminates when validation passes with all runs evaluated and successful.
3. **State Tracking:** Each iteration preserves the comparison summary and validation report for traceability.

**Applicability:**
- Use this pattern when executing multiple runs that must all pass against a reference answer.
- The validator acts as the gatekeeper, signaling specific repair targets.
- The compare_or_repair step performs minimal necessary corrections.

**Artifacts Generated:**
- Initial comparison summary (partial state)
- Initial validation report (FAIL with specific failures)
- Final comparison summary (PASS state)
- Final validation report (PASS with all checks met)

**Failure Mode Observed:** Arithmetic calculation error (120 ÷ 8 = 14 instead of 15) — corrected in single repair cycle.
