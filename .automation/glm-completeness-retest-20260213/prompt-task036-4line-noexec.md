Validate TASK-036 completeness using repository file inspection only. Do NOT run shell commands or tests.
Task document: docs/tasks/P1/TASK-036-agenda-management.md
Focus code: packages/blackboard/src/domains/agenda/* and tests under packages/blackboard/test/domains/agenda/*

Output must be EXACTLY 4 lines, with no extra text:
SCORE: <0.0-10.0>
P0: <integer>
P1: <integer>
DECISION: <PASS|FAIL>

Decision rule: PASS only if SCORE >= 9.0 and P0=0 and P1=0.