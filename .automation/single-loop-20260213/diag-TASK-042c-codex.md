[0m

[0m
> build · gpt-5.3-codex[0m→ [0mRead docs/tasks/P1/TASK-042c-conflict-guardrail-advanced.md
[0m→ [0mRead packages/blackboard/test/domains/tkg/observer-reflector.test.ts
[0m→ [0mRead packages/blackboard/src/domains/tkg/ObserverReflector.ts
- `packages/blackboard/src/domains/tkg/ObserverReflector.ts:107` — Conflict detection runs only on `eligible` nodes, so a low-confidence node can hide a real conflict and let its high-confidence twin promote; **minimal fix:** run `detectConflicts` on all `candidates`, then filter conflicted IDs out of `eligible` before `promoteBatch`.
- `packages/blackboard/src/domains/tkg/ObserverReflector.ts:146` — Any same-statement/same-version pair with small confidence gap is forced to `contradiction`, creating false positives and blocking valid promotion; **minimal fix:** replace final `else` with `continue` (no conflict) unless explicit contradiction evidence exists in node data.
- `packages/blackboard/src/domains/tkg/ObserverReflector.ts:156` + `packages/blackboard/test/domains/tkg/observer-reflector.test.ts:109` — `rollback()` blindly clears entire staging and test only validates this destructive path, risking unrelated batch loss; **minimal fix:** require/validate `mergeResultId` and rollback only nodes linked to that merge (or return no-op/error when linkage is unavailable), then update test to assert scoped rollback.
