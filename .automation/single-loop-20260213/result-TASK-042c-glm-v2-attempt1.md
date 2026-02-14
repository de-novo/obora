[0m
> build · glm-5

[0m[0m→ [0mRead packages/blackboard/test/domains/tkg/observer-reflector.test.ts
[0m→ [0mRead packages/blackboard/src/domains/tkg/ObserverReflector.ts
[0m→ [0mRead docs/tasks/P1/TASK-042c-conflict-guardrail-advanced.md
[0m> @obora-kit/blackboard@0.1.0 test /Users/denovo/workspace/github/obora-kit/packages/blackboard
> vitest run "test/domains/tkg/observer-reflector.test.ts"


 RUN  v1.6.1 /Users/denovo/workspace/github/obora-kit/packages/blackboard

 ✓ test/domains/tkg/observer-reflector.test.ts  (6 tests) 5ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Start at  22:37:38
   Duration  389ms (transform 83ms, setup 13ms, collect 87ms, tests 5ms, environment 0ms, prepare 129ms)
[0m

[0m$ [0mpnpm --filter @obora-kit/blackboard test -- test/domains/tkg/observer-reflector.test.ts 2>&1 | tail -20


[0m
[0m$ [0mpnpm --filter @obora-kit/blackboard build 2>&1 | tail -10DTS dist/snapshot/index.d.ts             4.91 KB
DTS dist/index.d.ts                      11.66 KB
DTS dist/types/index.d.ts                5.67 KB
DTS dist/events/index.d.ts               1.46 KB
DTS dist/tkg-DL6Qd1BT.d.ts               5.94 KB
DTS dist/serializer-Cc6GeiWO.d.ts        3.04 KB
DTS dist/snapshot-manager-BvOUavuR.d.ts  15.03 KB
DTS dist/blackboard-Czo3Q41n.d.ts        25.22 KB
DTS dist/tkg-BFHJRFkj.d.ts               28.69 KB
DTS dist/index-Bzidvz6u.d.ts             26.44 KBSCORE: 9
P0: 0
P1: 0
DECISION: PASS
