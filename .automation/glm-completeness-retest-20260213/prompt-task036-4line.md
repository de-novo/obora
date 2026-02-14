You are validating TASK-036 implementation completeness in this repository.
Target task doc: docs/tasks/P1/TASK-036-agenda-management.md
Model output must be EXACTLY 4 lines, no extra text, no markdown fences.

Required format (exact keys):
SCORE: <0.0-10.0>
P0: <integer>
P1: <integer>
DECISION: <PASS|FAIL>

Rules:
- Evaluate against TASK-036 goals/completion criteria and current code under packages/blackboard/src/domains/agenda and tests.
- P0 means release-blocking defect, P1 means high-priority defect.
- PASS only if SCORE >= 9.0 and P0=0 and P1=0.
- If unsure, be conservative and FAIL.
- Output only the 4 required lines.