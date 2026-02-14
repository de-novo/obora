

[0m[0m
> build · gpt-5.3-codex[0m→ [0mRead packages/blackboard/src/types/tkg.ts
[0m→ [0mRead packages/blackboard/src/domains/tkg/InMemoryTKG.ts
[0m→ [0mRead packages/blackboard/src/domains/tkg/JsonFileReflectorStateStore.ts
[0m→ [0mRead packages/blackboard/src/core/tkg.ts
[0m→ [0mRead packages/blackboard/src/domains/tkg/ObserverReflector.ts
[0m→ [0mRead packages/blackboard/src/domains/tkg/index.ts
[0m→ [0mRead packages/blackboard/test/domains/tkg/observer-reflector.test.ts
[0m→ [0mRead packages/blackboard/src/index.ts
[0m
[0m
[0m$ [0mls
README.md
SNAPSHOT_REVIEW.md
architecture
bin
docs
eslint.config.js
node_modules
package.json
packages
pnpm-lock.yaml
pnpm-workspace.yaml
presets
queue
tsconfig.base.json
turbo.json
[0m→ [0mRead package.json
[0m→ [0mRead packages/blackboard/package.json
[0m> @obora-kit/blackboard@0.1.0 test /Users/denovo/workspace/github/obora-kit/packages/blackboard
> vitest run


 RUN  v1.6.1 /Users/denovo/workspace/github/obora-kit/packages/blackboard

 ✓ test/domains/voting/voting-store.test.ts  (26 tests) 10ms
 ✓ test/types/types.test.ts  (69 tests) 15ms
 ✓ test/domains/tkg/observer-reflector.test.ts  (17 tests) 13ms
 ✓ test/core/versioning.test.ts  (20 tests) 42ms
 ✓ test/events/event-factory.test.ts  (28 tests) 11ms
 ✓ test/core/blackboard.test.ts  (52 tests) 19ms
 ✓ test/core/accessors/knowledge-accessor.test.ts  (24 tests) 23ms
 ✓ test/core/accessors/decisions-accessor.test.ts  (20 tests) 18ms
stderr | test/events/event-bus.test.ts > EventBus > emit() > should handle handler errors gracefully
Error in event handler: Error: Handler error
    at Object.<anonymous> (/Users/denovo/workspace/github/obora-kit/packages/blackboard/test/events/event-bus.test.ts:243:15)
    at Object.mockCall (file:///Users/denovo/workspace/github/obora-kit/node_modules/.pnpm/@vitest+spy@1.6.1/node_modules/@vitest/spy/dist/index.js:50:17)
    at Object.spy [as handler] (file:///Users/denovo/workspace/github/obora-kit/node_modules/.pnpm/tinyspy@2.2.1/node_modules/tinyspy/dist/index.js:42:80)
    at EventBus.emit (/Users/denovo/workspace/github/obora-kit/packages/blackboard/src/events/event-bus.ts:319:28)
    at /Users/denovo/workspace/github/obora-kit/packages/blackboard/test/events/event-bus.test.ts:251:13
    at Proxy.assertThrows (/Users/denovo/workspace/github/obora-kit/node_modules/.pnpm/chai@4.5.0/node_modules/chai/lib/chai/core/assertions.js:2644:7)
    at Proxy.methodWrapper (/Users/denovo/workspace/github/obora-kit/node_modules/.pnpm/chai@4.5.0/node_modules/chai/lib/chai/utils/addMethod.js:57:25)
    at Proxy.<anonymous> (file:///Users/denovo/workspace/github/obora-kit/node_modules/.pnpm/@vitest+expect@1.6.1/node_modules/@vitest/expect/dist/index.js:850:16)
    at Proxy.overwritingMethodWrapper (/Users/denovo/workspace/github/obora-kit/node_modules/.pnpm/chai@4.5.0/node_modules/chai/lib/chai/utils/overwriteMethod.js:78:33)
    at Proxy.<anonymous> (file:///Users/denovo/workspace/github/obora-kit/node_modules/.pnpm/@vitest+expect@1.6.1/node_modules/@vitest/expect/dist/index.js:1324:19)

 ✓ test/core/accessors/state-accessor.test.ts  (38 tests) 19ms
 ✓ test/snapshot/snapshot-manager.test.ts  (43 tests) 42ms
 ✓ test/snapshot/compression.test.ts  (33 tests) 116ms
 ✓ test/events/event-bus.test.ts  (33 tests) 93ms
 ✓ test/core/immutable.test.ts  (30 tests) 10ms
 ✓ test/core/path-utils.test.ts  (40 tests) 11ms
 ✓ test/domains/consensus/rule-engine.test.ts  (3 tests) 3ms
 ✓ test/domains/agenda/agenda-store.test.ts  (11 tests) 8ms
 ✓ test/core/id-generator.test.ts  (25 tests) 14ms
 ✓ test/snapshot/serializer.test.ts  (15 tests) 9ms
 ✓ test/workflow/meeting-state-machine.test.ts  (2 tests) 4ms
 ✓ test/domains/consensus/types.test.ts  (2 tests) 2ms
 ✓ test/e2e/workflow-e2e.test.ts  (5 tests) 6ms

 Test Files  21 passed (21)
      Tests  536 passed (536)
   Start at  00:46:09
   Duration  1.11s (transform 804ms, setup 408ms, collect 3.30s, tests 488ms, environment 2ms, prepare 1.88s)[0m
[0m$ [0mpnpm --filter @obora-kit/blackboard test





[0m$ [0mpnpm --filter @obora-kit/blackboard build[0m> @obora-kit/blackboard@0.1.0 build /Users/denovo/workspace/github/obora-kit/packages/blackboard
> tsup

CLI Building entry: {"index":"src/index.ts","types/index":"src/types/index.ts","core/index":"src/core/index.ts","events/index":"src/events/index.ts","snapshot/index":"src/snapshot/index.ts"}
CLI Using tsconfig: tsconfig.json
CLI tsup v8.5.1
CLI Using tsup config: /Users/denovo/workspace/github/obora-kit/packages/blackboard/tsup.config.ts
CLI Target: node18
CLI Cleaning output folder
CJS Build start
ESM Build start
Generated an empty chunk: "chunk-Q6DHEXJI".
DTS Build start
Generated an empty chunk: "chunk-G4QBK2E3".
CJS dist/types/index.cjs        2.69 KB
CJS dist/events/index.cjs       620.00 B
CJS dist/core/index.cjs         4.39 KB
CJS dist/index.cjs              42.01 KB
CJS dist/chunk-EKPERDGM.cjs     541.00 B
CJS dist/chunk-G4QBK2E3.cjs     102.00 B
CJS dist/chunk-OZ7QK7BJ.cjs     4.20 KB
CJS dist/chunk-AHJKLJJJ.cjs     54.71 KB
CJS dist/snapshot/index.cjs     2.70 KB
CJS dist/chunk-JDTW6ECZ.cjs     28.47 KB
CJS dist/chunk-QMSWWWPU.cjs     86.65 KB
CJS dist/types/index.cjs.map    70.00 B
CJS dist/core/index.cjs.map     70.00 B
CJS dist/events/index.cjs.map   70.00 B
CJS dist/index.cjs.map          91.63 KB
CJS dist/chunk-G4QBK2E3.cjs.map 79.00 B
CJS dist/chunk-OZ7QK7BJ.cjs.map 28.77 KB
CJS dist/chunk-EKPERDGM.cjs.map 79.00 B
CJS dist/chunk-JDTW6ECZ.cjs.map 66.77 KB
CJS dist/snapshot/index.cjs.map 70.00 B
CJS dist/chunk-QMSWWWPU.cjs.map 192.49 KB
CJS dist/chunk-AHJKLJJJ.cjs.map 136.96 KB
CJS ⚡️ Build success in 596ms
ESM dist/core/index.js         730.00 B
ESM dist/index.js              38.11 KB
ESM dist/chunk-Q6DHEXJI.js     86.00 B
ESM dist/events/index.js       211.00 B
ESM dist/types/index.js        410.00 B
ESM dist/chunk-3PJPZJ3Y.js     3.76 KB
ESM dist/chunk-WC5COLG3.js     85.68 KB
ESM dist/chunk-2TTBYIUF.js     28.39 KB
ESM dist/chunk-XQNBWKUD.js     515.00 B
ESM dist/chunk-ZEPOQJW7.js     54.20 KB
ESM dist/snapshot/index.js     465.00 B
ESM dist/chunk-Q6DHEXJI.js.map 78.00 B
ESM dist/core/index.js.map     69.00 B
ESM dist/types/index.js.map    69.00 B
ESM dist/index.js.map          91.48 KB
ESM dist/events/index.js.map   69.00 B
ESM dist/chunk-WC5COLG3.js.map 192.32 KB
ESM dist/chunk-2TTBYIUF.js.map 66.77 KB
ESM dist/chunk-XQNBWKUD.js.map 78.00 B
ESM dist/snapshot/index.js.map 69.00 B
ESM dist/chunk-3PJPZJ3Y.js.map 28.77 KB
ESM dist/chunk-ZEPOQJW7.js.map 136.92 KB
ESM ⚡️ Build success in 596ms
DTS ⚡️ Build success in 3167ms
DTS dist/core/index.d.cts                2.65 KB
DTS dist/snapshot/index.d.cts            4.92 KB
DTS dist/index.d.cts                     15.87 KB
DTS dist/types/index.d.cts               5.68 KB
DTS dist/events/index.d.cts              1.47 KB
DTS dist/tkg-C8jGQPxl.d.cts              5.94 KB
DTS dist/serializer-BGNMRIwy.d.cts       3.04 KB
DTS dist/snapshot-manager-DS46jni-.d.cts 15.03 KB
DTS dist/blackboard-Czo3Q41n.d.cts       25.22 KB
DTS dist/tkg-DsmKky3X.d.cts              28.69 KB
DTS dist/index-BCNQDVpz.d.cts            26.68 KB
DTS dist/core/index.d.ts                 2.65 KB
DTS dist/snapshot/index.d.ts             4.91 KB
DTS dist/index.d.ts                      15.86 KB
DTS dist/types/index.d.ts                5.67 KB
DTS dist/events/index.d.ts               1.46 KB
DTS dist/tkg-DL6Qd1BT.d.ts               5.94 KB
DTS dist/serializer-Cc6GeiWO.d.ts        3.04 KB
DTS dist/snapshot-manager-BvOUavuR.d.ts  15.03 KB
DTS dist/blackboard-Czo3Q41n.d.ts        25.22 KB
DTS dist/tkg-Cs8N1L4U.d.ts               28.69 KB
DTS dist/index-UvAAX2O7.d.ts             26.68 KBSCORE: 9.4
P0: 0
P1: 0
DECISION: PASS - The scoped changes satisfy the prior gate issues and show strong spec alignment, runtime safety, persistence resilience, and practical test/build validation.
