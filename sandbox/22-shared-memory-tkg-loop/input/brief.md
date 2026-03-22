# Shared Memory / TKG Sandbox Brief

Create a short reusable project note that demonstrates runtime-native repair and memory continuity.

## Required intent
- The first attempt should be incomplete enough that validation fails once.
- The repaired attempt should pass the checklist.
- If prior shared memory exists, the repaired or later run should visibly reuse it.

## Final artifact goals
The final artifact should explain:
1. What this sandbox is testing
2. What was learned from the latest run
3. What to do next

## Memory continuity rule
If shared memory context is present, reuse only concrete reusable signals from it.
Do not invent prior facts.
