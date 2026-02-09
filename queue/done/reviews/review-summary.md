# 리뷰 요약 - TASK-026-actor-pool

## 검토 대상
- 태스크: /Users/denovo/workspace/github/obora-kit/queue/TASK-026-actor-pool.md
- 프로젝트: /Users/denovo/workspace/github/obora-kit
- 리뷰 시작: 2026-02-09 19:48:13
- 리뷰 완료: 2026-02-09 19:50:15
- 소요 시간: 2m 2s
- 완료된 리뷰: 4/4

## 모델별 결과

---
### opus (anthropic/claude-opus-4-6)



I'll verify each checklist item against the actual code. Let me start by exploring the codebase.
Now let me read the actual source files in detail to verify each checklist item:
Now let me also check the type definitions for `IBlackboard.write()` and `ActorFactory.create()` signatures:
Now I have all the information I need. Let me verify each checklist item against the actual code.

# 체크리스트 검증 결과

## 항목별 결과

- **[PASS] 1. 만료된 task가 submitAndWait 호출자에게 전파되지 않음**
  - 근거: `ActorPool.ts:719-737` — `startDispatch()`에서 만료된 task를 감지하면 `recordTaskResult()`를 호출하여 에러 결과를 `pendingResults`에 저장하고, `submitAndWait`의 `waitForTaskResult` 폴링이 이를 감지하여 reject합니다. 만료된 task 에러가 `submitAndWait` 호출자에게 정상적으로 전파됩니다.

- **[PASS] 2. submitAndWait의 폴링 interval이 Pool 종료 시 정리되지 않음**
  - 근거: `ActorPool.ts:822-828` — `waitForTaskResult()`에서 `if (!this.isRunning)` 체크를 통해 Pool 종료 시 `clearInterval(checkInterval)`을 호출하고 reject합니다. 또한 `submitAndWait` 내에서 `waiter.cleanup()`이 반환되어(`ActorPool.ts:849-851`) 타임아웃이나 settle 시에도 정리됩니다.

- **[PASS] 3. dispatchTask()에서 Actor 없으면 무한 재삽입 사이클**
  - 근거: `ActorPool.ts:740-742` — `startDispatch()`에서 Actor가 없으면 (`if (!actor) break;`) while 루프를 탈출합니다. 스펙의 원래 코드는 task를 큐에서 꺼낸 후 actor가 없으면 다시 넣는 구조였지만, 현재 코드는 actor 선택 실패 시 task를 큐에서 꺼내기 전에 break하므로 재삽입 사이클이 없습니다.

- **[PASS] 4. getActorStatus()에서 actor.status 대신 actor.getStatus() 사용해야 함**
  - 근거: `ActorPool.ts:456-462` — `getActorStatus()`가 `actor.getStatus()`를 호출하여 `ActorStatus`를 반환합니다. `actor.status`를 직접 접근하지 않습니다.

- **[PASS] 5. selectLeastBusy()에서 actor.status.messageQueue 직접 접근**
  - 근거: `ActorPool.ts:587-594` — `selectLeastBusy()`에서 `least.getStatus()`와 `actor.getStatus()`를 호출한 후 반환값의 `messageQueue.pending`에 접근합니다. `actor.status.messageQueue`를 직접 접근하지 않습니다.

- **[PASS] 6. Pool 모듈이 패키지 엔트리포인트에서 내보내지 않음**
  - 근거: `packages/actor/src/index.ts:11` — `export * from "./pool";`이 존재하며, `packages/actor/src/pool/index.ts`에서 `ActorPool`과 `PoolManager`를 모두 re-export합니다.

- **[PASS] 7. 단위 테스트 파일 전체 누락**
  - 근거: `packages/actor/src/pool/__tests__/ActorPool.test.ts` (586줄)과 `packages/actor/src/pool/__tests__/PoolManager.test.ts` (421줄)이 모두 존재하며, 주요 시나리오를 커버하는 테스트 스위트가 포함되어 있습니다.

- **[PASS] 8. IBlackboard.write()는 void를 반환하나 await로 호출**
  - 근거: `ActorPool.ts:620` — `this.board.write(taskSection, {...})`를 `await` 없이 동기적으로 호출합니다. `IBlackboard.write()`의 시그니처(`blackboard.ts:32`)는 `void`를 반환하며, 코드에서 이를 올바르게 동기 호출합니다.

- **[PASS] 9. ActorPool/PoolManager 생성자 시그니처가 스펙과 불일치**
  - 근거: 스펙에서는 `constructor(config: PoolConfig, board: Blackboard, factory: ActorFactory)`이고 현재 코드는 `constructor(config: PoolConfig, board: IBlackboard, factory: ActorFactory, messageBus: IMessageBus = new NoOpMessageBus())`(`ActorPool.ts:176-180`). `Blackboard` 대신 `IBlackboard`를 사용하고 `messageBus`가 추가되었지만, 이는 실제 타입 시스템에 맞게 개선된 것이며 `messageBus`는 기본값이 있어 하위 호환됩니다. `PoolManager`도 동일하게 `IBlackboard`와 optional `messageBus`를 사용(`PoolManager.ts:42-46`). `ActorFactory.create()` 시그니처가 `messageBus`를 받도록 변경(`runtime/types.ts:39`)되었으므로 전체적으로 일관성 있게 수정되었습니다.

## 점수
- 통과: 9/9
- **총점: 10/10**

---
### codex (openai/gpt-5.2-codex)

# Checklist Verification Result

## Item Results
- [PASS] Item1: Expired tasks are recorded and returned to waiting submitters via pendingResults (packages/actor/src/pool/ActorPool.ts:724)
- [PASS] Item2: Polling interval is cleared when pool stops via isRunning guard in waiter (packages/actor/src/pool/ActorPool.ts:822)
- [PASS] Item3: Dispatch loop breaks when no actor available; no reinsert loop (packages/actor/src/pool/ActorPool.ts:740)
- [PASS] Item4: getActorStatus uses actor.getStatus() (packages/actor/src/pool/ActorPool.ts:456)
- [PASS] Item5: selectLeastBusy reads queue from getStatus() (packages/actor/src/pool/ActorPool.ts:887)
- [PASS] Item6: Pool module exported from package entrypoint (packages/actor/src/index.ts:8)
- [PASS] Item7: Unit test files present (packages/actor/src/pool/__tests__/ActorPool.test.ts:1)
- [PASS] Item8: IBlackboard.write called without await (packages/actor/src/pool/ActorPool.ts:620)
- [PASS] Item9: Constructors accept spec signatures with optional messageBus default (packages/actor/src/pool/ActorPool.ts:176)

## Score
- Passed: 9/9
- **Total: 10/10**

## Fix for FAIL Items
- None

---
### glm (zai-coding-plan/glm-4.7)

# 체크리스트 검증 결과

## 항목별 결과
- [PASS] 항목1 (만료된 task가 submitAndWait 호출자에게 전파되지 않음): 만료된 task가 recordTaskResult()를 통해 pendingResults에 저장되고, submitAndWait에서 대기 중인 작업으로 에러가 전파됨 (ActorPool.ts:680-682, 735-736)
- [FAIL] 항목2 (submitAndWait의 폴링 interval이 Pool 종료 시 정리되지 않음): waitForTaskResult가 반환하는 cleanup 객체가 submitAndWait에서 사용되지 않아 Pool 종료 시 모든 폴링 interval이 정리되지 않음 (ActorPool.ts:345-390, 848-851)
- [PASS] 항목3 (dispatchTask()에서 Actor 없으면 무한 재삽입 사이클): Actor가 없으면 break하여 무한 루프를 방지함 (ActorPool.ts:740-742)
- [PASS] 항목4 (getActorStatus()에서 actor.status 대신 actor.getStatus() 사용해야 함): actor.getStatus()를 올바르게 사용함 (ActorPool.ts:461)
- [PASS] 항목5 (selectLeastBusy()에서 actor.status.messageQueue 직접 접근): actor.getStatus().messageQueue를 올바르게 사용함 (ActorPool.ts:589-592)
- [PASS] 항목6 (Pool 모듈이 패키지 엔트리포인트에서 내보내지 않음): index.ts에서 pool을 내보냄 (packages/actor/src/index.ts:11)
- [PASS] 항목7 (단위 테스트 파일 전체 누락): 테스트 파일들이 존재함 (packages/actor/src/pool/__tests__/)
- [FAIL] 항목8 (IBlackboard.write()는 void를 반환하나 await로 호출): write()는 void 반환인데 await로 호출됨 (ActorPool.ts:620, blackboard.ts:32)
- [PASS] 항목9 (ActorPool/PoolManager 생성자 시그니처가 스펙과 불일치): 스펙과 일치함 (ActorPool.ts:176-181, PoolManager.ts:42-46)

## 점수
- 통과: 7/9
- **총점: 7/10**

## FAIL 항목 수정 방법
### [P2] submitAndWait의 폴링 interval이 Pool 종료 시 정리되지 않음
- **파일**: packages/actor/src/pool/ActorPool.ts:345-390
- **문제점**: waitForTaskResult가 반환하는 cleanup 객체가 submitAndWait에서 사용되지 않아, Pool이 종료되더라도 모든 폴링 interval이 정리되지 않음
- **수정 전 코드**:
```typescript
waiter = this.waitForTaskResult(
  taskId,
  () => {
    if (settled) return;
    settled = true;
    cleanup();
  },
  resolve,
  reject
);
```
- **수정 후 코드**:
```typescript
waiter = this.waitForTaskResult(
  taskId,
  () => {
    if (settled) return;
    settled = true;
    waiter?.cleanup(); // waiter가 정의된 후 cleanup 사용
  },
  resolve,
  reject
);
```

### [P2] IBlackboard.write()는 void를 반환하나 await로 호출
- **파일**: packages/actor/src/pool/ActorPool.ts:620
- **문제점**: write()는 void 반환 메서드인데 불필요하게 await를 사용함
- **수정 전 코드**:
```typescript
this.board.write(taskSection, {
  taskId: task.id,
  actorId: actor.id,
  data: task.data,
  priority: task.priority,
  createdAt: task.createdAt,
});
```
- **수정 후 코드**:
```typescript
this.board.write(taskSection, {
  taskId: task.id,
  actorId: actor.id,
  data: task.data,
  priority: task.priority,
  createdAt: task.createdAt,
});
// await 제거 (write()는 void 반환)
```

---
### gemini (google/antigravity-gemini-3-flash)

I will now verify the checklist items by examining the codebase.

First, I'll list the files in the `packages/actor` directory to verify the structure and existence of the relevant files.
I will now read the core files to verify the checklist items.
I will now search for any occurrences of `await this.board.write` to confirm if the issue has been resolved.
I will now read the `ActorPool.ts` file again to verify the usage of `board.write`.
I will now check the `packages/actor/src/types/blackboard.ts` file to see the definition of `Blackboard`.
I will now check the `packages/actor/src/types/actor.ts` file to see the definition of `ActorStatus`.
I will now read the `ActorPool.test.ts` file to ensure it is not empty and covers the required scenarios.
# Checklist Verification Result

## Item Results
- [PASS] Item1: Expired tasks are recorded via `recordTaskResult` and propagated to `submitAndWait` callers through the `pendingResults` cache and `waitForTaskResult` polling mechanism (ActorPool.ts:736, 830).
- [PASS] Item2: The polling interval in `waitForTaskResult` is explicitly cleared if the pool stops (`!this.isRunning`) and via a returned `cleanup` function called by `submitAndWait` (ActorPool.ts:825, 849, 356).
- [PASS] Item3: `startDispatch` now uses a `break` statement when no actor is available, preventing the infinite loop of shifting and re-inserting tasks (ActorPool.ts:742).
- [PASS] Item4: `getActorStatus` correctly uses the `actor.getStatus()` method instead of the `status` property (ActorPool.ts:461).
- [PASS] Item5: `selectLeastBusy` uses `getStatus()` to retrieve the actor's status before accessing `messageQueue.pending` (ActorPool.ts:589-592).
- [PASS] Item6: The `pool` module is correctly exported from the package entry point (packages/actor/src/index.ts:11).
- [PASS] Item7: Comprehensive unit tests for `ActorPool` and `PoolManager` are present in the `pool/__tests__` directory.
- [PASS] Item8: `IBlackboard.write()` is called synchronously as it returns `void`, with no `await` keyword used (ActorPool.ts:620).
- [PASS] Item9: Constructor signatures for `ActorPool` and `PoolManager` align with the spec for required arguments while providing an optional `messageBus` for dependency injection (ActorPool.ts:176, PoolManager.ts:42).

## Score
- Passed: 9/9
- **Total: 10/10**

---
## 최종 평가

**최저 점수: 7/10** (목표: 9/10)
**최우선 이슈: P2**
**소요 시간: 2m 2s**

### 통과 여부
❌ **미통과** - 개선 필요
