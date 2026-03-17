# Multi-Run Comparison Loop — Archive Note

Date: 2026-03-17

---

## Summary of Loop

The multi-run comparison loop evaluated three independent runs computing the processing rate for 120 records over 8 minutes.

### Initial State (Partial)

- **Overall Result**: PARTIAL
- **Pass Rate**: 2/3 (66.67%)
- **Run Statuses**:
  - run-1: PASS (answer: 15)
  - run-2: FAIL (answer: 14 — intentionally incorrect)
  - run-3: PASS (answer: 15)

### Repair Action

- run-2 was identified as failing due to an incorrect calculation (14 instead of 15).
- The run was repaired (renamed to run-2-repaired) and corrected its division: 120 records ÷ 8 minutes = 15 records per minute.

### Final State (Pass)

- **Overall Result**: PASS
- **Pass Rate**: 3/3 (100%)
- **All runs now produce the correct answer**: 15 records per minute.

---

## Final Comparison Result

| Run | Answer | Reasoning | Status |
|-----|--------|-----------|--------|
| run-1 | 15 | 120 records / 8 minutes = 15 records per minute | PASS |
| run-2-repaired | 15 | 120 records divided by 8 minutes equals 15 records per minute | PASS |
| run-3 | 15 | Processing rate = 120 records ÷ 8 minutes = 15 records per minute | PASS |

**Reference Answer**: 15 records per minute

**Validation Verdict**: PASS — All runs passed against the reference answer. The final comparison is acceptable for archive.

---

## Reuse Notes

### What Worked Well

1. **Per-Run Snapshot Table**: Providing a clear tabular summary of each run's answer, reasoning, and status made it easy to identify failures and track repairs.

2. **Best/Worst Run Selection**: Explicitly documenting best and worst runs helped surface reasoning quality differences even when answers matched.

3. **Pass Rate Tracking**: Including both fraction (e.g., 2/3) and percentage (e.g., 66.67%) provided unambiguous quality metrics.

4. **Repair Mechanism**: Renaming failed runs (e.g., run-2 → run-2-repaired) preserved provenance while clearly indicating intervention.

### Recommendations for Future Loops

1. **Include Reference Answer Explicitly**: Always state the reference answer in the comparison summary for quick verification.

2. **Standardize Reasoning Format**: Encourage runs to use consistent reasoning templates (e.g., "X / Y = Z units per time") to simplify comparison.

3. **Automate Repair Detection**: Consider flagging runs with answers deviating from the majority for automatic repair prompts.

4. **Archive Intermediate States**: Keep both initial and final comparison summaries to demonstrate the repair trajectory.

### Template Artifacts

- `01-initial-comparison-summary.md` — Captures partial state before repairs
- `03-final-comparison-summary.md` — Captures final pass state after repairs
- `04-final-comparison-validation.md` — Validates that all checklist criteria are met

These artifacts form a complete audit trail for the multi-run comparison loop.
