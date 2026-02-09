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
