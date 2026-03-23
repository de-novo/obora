# TKG Review Queue Runbook

> Last updated: 2026-03-23

이 문서는 TKG promotion conflict가 언제 review queue로 가는지, 운영자가 어떤 순서로 approve / reject / re-apply 해야 하는지 정리한다.

---

## 목적

review queue는 단순 저장소가 아니라, 아래 운영 루프를 위한 수동 개입 지점이다.

1. 현재 open item 조회
2. 왜 queue에 들어왔는지 conflict 확인
3. approve / reject 결정
4. approve된 item 재적용
5. 필요 시 rollback restore

---

## 현재 정책 요약

### 평가 모드

- `execution_end` 기본값: `full_history`
- 중간 trigger 기본값: `latest_effective`
- 명시적으로 `promotion.evaluationMode`를 주면 override 가능
  - `full_history`
  - `current_execution`
  - `latest_effective`

### conflict → review queue 라우팅 규칙

현재 구현 기준:

| conflict type | severity | promotion block | review queue enqueue | 비고 |
|---|---:|---:|---:|---|
| `contradiction` | `high` | 예 | 예 | 같은 step에 `validation_failed`와 `validation_passed`가 동시에 존재 |
| `version` | `medium` | 예 | 아니오 | 같은 step에 promotable version이 여러 개 존재 |
| `confidence` | `medium` | 아니오 | 아니오 | spread가 threshold 이상이지만 high는 아님 |
| `confidence` | `high` | 아니오 | 예 | operator visibility용 queue. 현재는 promotion 자체를 막지 않음 |

핵심은 아래 두 줄입니다.

- **blocking conflict**: `contradiction`, `version`
- **queue 대상**: `severity === high`

즉, 현재는 다음이 가능합니다.

- `version` conflict는 **promotion을 막지만 queue에는 안 들어감**
- `confidence` high conflict는 **queue에는 들어가지만 promotion을 직접 막지는 않음**

이건 현재 구현 의도와 운영 UX가 완전히 일치한다고 보긴 어렵기 때문에, 운영 시 아래 주의사항을 같이 봐야 한다.

---

## 운영 해석

### 1. contradiction

가장 강한 수동 검토 대상입니다.

예:
- 같은 step에서 검증 실패와 성공이 동시에 남아 있음
- long-run 누적 과정에서 서로 반대되는 상태가 공존함

권장 처리:
- 원인 확인 전 자동 promote로 간주하지 말 것
- `approve`는 “현재 state를 운영자가 최신 truth로 인정”한다는 의미로 쓸 것
- `reject`는 noisy / stale / 잘못된 projection일 때 사용

### 2. version

현재 구현에서는 **blocking이지만 queue item을 자동 생성하지 않습니다.**

즉 증상은 다음처럼 보일 수 있습니다.

- `promotableCount`가 기대보다 낮음
- review queue는 비어 있음
- apply가 안 됨

운영 해석:
- queue가 없다고 해서 conflict가 없는 것이 아님
- version conflict는 현재 단계에서는 **silent block**에 가깝다
- long-run에서는 `latest_effective`를 우선 사용해 version 충돌을 줄이는 것이 1차 대응이다

### 3. confidence

`confidence`는 현재 **operator signal**로 취급된다.

- `medium`: 그냥 지표로만 남음
- `high`: review queue에는 들어갈 수 있음
- 하지만 confidence만으로는 candidate가 `requiresReview=true`가 되지 않으므로, promotion block과 review 재적용의 semantics가 contradiction/version보다 약하다

운영 해석:
- confidence-only queue item은 “승인 후 재적용”보다는 **관찰/감사 포인트**로 보는 편이 맞다
- 실제 운영에서 promote를 막아야 하는 confidence policy가 필요하면 후속 정책 강화가 필요하다

---

## 운영자 절차

### A. open queue 조회

```ts
const items = await runtime.listOpenTKGReviewQueueItems("my-workflow");
```

확인할 것:
- `item.conflicts`
- `item.candidateNodeIds`
- `item.summary`
- `item.createdAt`

### B. approve / reject

```ts
await runtime.resolveTKGReviewQueueItem("my-workflow", itemId, {
  status: "approved",
  actor: "cto",
  note: "latest validated state is safe to promote",
});
```

또는:

```ts
await runtime.resolveTKGReviewQueueItem("my-workflow", itemId, {
  status: "rejected",
  actor: "cto",
  note: "stale contradiction from older run",
});
```

권장 규칙:
- `actor`는 실제 승인 주체를 남긴다
- `note`는 나중에 봐도 이해되는 짧은 운영 판단으로 적는다
- 모호하면 approve보다 reject + note가 더 안전하다

### C. approved item 재적용

```ts
const summary = await runtime.reapplyApprovedTKGReviewQueueItems("my-workflow", {
  sourceExecutionId: "manual-review-2026-03-23",
});
```

현재 보장:
- fact / decision id 기준 dedupe
- 같은 approved item을 다시 re-apply해도 중복 축적되지 않음
- approved resolution의 `actor / note / resolvedAt`는 shared memory `decisions.history`에 audit로 남음

---

## file adapter 기준 저장 위치

기본 경로:

- review queue: `.obora/tkg-review-queue/<scope-level>/<scope-key>.json`
- rollback: `.obora/tkg-rollback/<scope-level>/<scope-key>.json`

예:

```text
.obora/tkg-review-queue/project/test-project.json
.obora/tkg-rollback/project/test-project.json
```

---

## 자주 보는 운영 케이스

### 케이스 1. queue item이 생겼다

의미:
- high severity conflict가 있었다
- contradiction이거나 high confidence일 가능성이 높다

우선 확인:
- `candidateNodeIds`가 비었는지
- `conflicts[].type`이 무엇인지

### 케이스 2. promote가 안 됐는데 queue도 없다

가장 먼저 의심할 것:
- `version` conflict
- `evaluationMode`가 `full_history`라서 누적 이력이 많이 섞였는지

대응:
- 중간 trigger에서 `latest_effective` 적용 여부 확인
- debug trace의 `candidateCount / promotableCount / reviewQueueCount` 확인

### 케이스 3. approve했는데 재적용 효과가 없다

가능한 원인:
- `candidateNodeIds`가 빈 queue item이었다
- 허용 event type filter에서 제외됐다
- staging snapshot에 해당 node가 더 이상 없다

대응:
- review item의 `candidateNodeIds` 확인
- `allowedEventTypes` 설정 확인
- staging store 내용을 확인

---

## 운영 원칙

- contradiction는 수동 승인 없이 truth로 승격하지 않는다
- version conflict는 queue가 없더라도 blocking 상태로 해석한다
- confidence conflict는 현재 구현에서 보조 signal 성격이 강하므로 note를 남겨 운영 맥락을 보존한다
- approve는 단순 버튼이 아니라 **shared memory truth 승격 승인**으로 취급한다
- reject는 실패가 아니라 noisy / stale 상태를 정리하는 정상 운영 액션이다

---

## 현재 한계

- version conflict용 전용 queue 정책이 아직 없다
- confidence-only queue item은 signal과 action semantics가 완전히 정렬돼 있지 않다
- no-op / apply skipped / review-queue-only 케이스를 더 잘 드러내는 표준 debug 출력은 추가 여지가 있다

즉, 현재 review queue는 **핵심 운영 루프는 가능하지만 정책은 아직 완전 마감 전** 상태로 보는 것이 정확하다.
