SCORE: 8.8
P0: 0
P1: 1
DECISION: FAIL - CRUD, status transitions, and bus emission are implemented and tested, but event "immutability" is only partial because frozen `Date` objects (`timestamp`/`dueAt`) can still be mutated, leaving a safety gap in event integration.
