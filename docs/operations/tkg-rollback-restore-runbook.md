# TKG Rollback Restore Runbook

> Last updated: 2026-03-23

이 문서는 TKG promotion apply 이전 snapshot이 언제 rollback으로 남는지, restore가 정확히 무엇을 하는지, 운영자가 어떤 순서로 복원해야 하는지 정리한다.

---

## 목적

rollback restore는 “현재 shared memory를 과거 snapshot으로 되돌리는 것”이다.

현재 구현은 아래 목적에 맞춰져 있다.

- 잘못 promote된 shared memory를 이전 상태로 복원
- 수동 review 이후 재적용 실패/오판 시 안전하게 되돌림
- long-run 검증 중 메모리 pollution을 빠르게 정리

---

## rollback entry가 생성되는 시점

rollback entry는 아래 조건을 모두 만족할 때만 생성된다.

1. promotion apply 대상 fact가 실제로 존재함
2. apply 대상 scope가 존재함
3. 해당 scope의 기존 shared memory snapshot이 이미 존재함
4. rollback store가 활성화돼 있음

즉, 아래 경우에는 rollback이 생기지 않을 수 있다.

- 첫 promotion이라 기존 shared memory가 비어 있음
- apply 자체가 no-op였음
- rollback 기능이 꺼져 있음

---

## 현재 restore semantics

현재 restore는 **merge가 아니라 overwrite**다.

```ts
await store.save(scope, entry.snapshot)
```

즉 의미는 다음과 같다.

- restore 시점의 shared memory 전체를 entry snapshot으로 덮어쓴다
- 부분 patch가 아니다
- dry-run은 아직 없다
- restore 결과 요약은 `restoredFactCount` 중심으로 반환된다

이 점 때문에 restore는 운영상 꽤 강한 액션으로 봐야 한다.

---

## runtime API

### latest rollback restore

```ts
const summary = await runtime.restoreLatestTKGRollback("my-workflow");
```

### 특정 rollback id restore

```ts
const summary = await runtime.restoreLatestTKGRollback("my-workflow", {
  rollbackId: "rollback-123",
});
```

반환 요약 예시:

```ts
{
  restored: true,
  scope: "project:test-project",
  rollbackId: "rollback-123",
  restoredFactCount: 12,
}
```

---

## rollback 선택 규칙

현재 helper는 다음 규칙을 따른다.

- `rollbackId`가 주어지면 해당 id를 우선 선택
- 없으면 `createdAt` 기준 최신 entry를 선택
- entry가 없으면 `restored: false`

즉 현재 운영 기본은 **latest restore**다.

---

## file adapter 기준 저장 위치

기본 경로:

```text
.obora/tkg-rollback/<scope-level>/<scope-key>.json
```

예:

```text
.obora/tkg-rollback/project/test-project.json
```

entry 구조 핵심 필드:
- `id`
- `createdAt`
- `executionId`
- `workflowName`
- `scope`
- `reason`
- `snapshot`

현재 `reason`은 주로 `pre-tkg-promotion-apply`로 저장된다.

---

## 권장 운영 절차

### 1. 먼저 왜 restore가 필요한지 확인

질문:
- 잘못된 promotion인가?
- approved item re-apply 후 결과가 나빠졌는가?
- long-run 누적으로 memory pollution이 심해졌는가?

restore는 overwrite이므로, 원인 확인 없이 바로 실행하는 것보다 note를 남기고 판단하는 편이 안전하다.

### 2. 최신 restore 먼저 고려

현재 list helper가 없기 때문에 운영상 가장 단순한 복구는 latest restore다.

```ts
await runtime.restoreLatestTKGRollback("my-workflow")
```

### 3. 특정 rollback id 복원이 필요하면 file store에서 id 확인

현재는 runtime의 rollback list API가 없으므로, file adapter 사용 시 저장 파일에서 entry id를 확인한 뒤 restore하는 방식이 가장 현실적이다.

### 4. restore 직후 재검증

restore 후 반드시 확인할 것:
- shared memory fact 수가 기대치와 맞는지
- 다음 run에서 unexpected promotion/no-op가 발생하지 않는지
- review queue에 stale item이 남아 있는지

restore는 메모리 복원이지 review queue 정리까지 자동으로 하지는 않는다.

---

## 안전 규칙

### overwrite policy

- 현재 restore는 전체 overwrite다
- 부분 restore가 아니므로, restore 직전 state를 보존할 필요가 있으면 별도 snapshot을 남겨야 한다

### dry-run

- 아직 없음
- 따라서 운영자는 restore 전에 대상 scope와 rollback id를 직접 확인해야 한다

### scope

- restore는 runner가 resolve한 target scope 하나에 적용된다
- 일반적으로 `tkgPromotion.applyScopes`가 있으면 그 마지막 scope
- 없으면 shared memory scope의 마지막 scope를 사용한다

즉 어떤 scope가 실제 restore 대상인지 workflow 설정을 기준으로 먼저 봐야 한다.

---

## 자주 보는 운영 케이스

### 케이스 1. restore가 `restored: false` 로 끝남

가능한 원인:
- rollback entry가 없음
- 지정한 `rollbackId`가 틀림
- rollback store가 비활성화돼 있음

### 케이스 2. restore는 성공했는데 기대 상태가 아님

가능한 원인:
- latest entry가 원하는 시점이 아니었음
- restore 대상 scope를 잘못 봤음
- 이후 run에서 다시 promotion이 적용됐음

### 케이스 3. restore 후 queue가 그대로 남아 있음

정상 가능성 있음.

현재 restore는 shared memory snapshot 복원이지, review queue item lifecycle 정리까지 포함하지 않는다.

---

## 현재 한계

- rollback entry list helper가 아직 없다
- restore 이후 별도 audit trail summary는 최소 수준이다
- dry-run이 없다
- review queue와 rollback을 묶은 transactional restore는 아직 없다

즉 현재 restore는 **작동은 하지만, 운영 UX는 여전히 low-level**이다.

가장 안전한 운영 방식은:
1. latest 또는 특정 id를 명확히 선택하고
2. restore 후 즉시 검증하고
3. 필요하면 review queue 처리와 재적용을 별도로 이어가는 것이다.
