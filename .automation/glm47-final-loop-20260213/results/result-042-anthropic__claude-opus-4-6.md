I'll review all the specified files to evaluate TASK-042 rollup readiness.
Now let me verify the tests pass:
SCORE: 7
P0: 0
P1: 3
DECISION: FAIL - 042c advanced scope (manual resolution workflow, persistent reporting, batch strategy) remains at in-memory stub level; InMemoryProductionTKG exposes mutable Map via public nodes field undermining readonly contract; TKGReflector does not implement IReflector interface from core/tkg.ts.
