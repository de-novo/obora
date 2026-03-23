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

### confidence conflict policy

기본값은 `signal_only`다.

- `signal_only`: confidence conflict를 summary/conflict signal로만 남김
- `review`: high confidence conflict를 review queue에 넣지만 promotion block은 하지 않음
- `blocking`: high confidence conflict를 review queue에 넣고 promotion도 block함

설정 예시:

```yaml
tkgProjection:
  promotion:
    confidenceConflictMode: blocking
```

### conflict → review queue 라우팅 규칙

현재 구현 기준:

| conflict type | severity | promotion block | review queue enqueue | 비고 |
|---|---:|---:|---:|---|
| `contradiction` | `high` | 예 | 예 | 같은 step에 `validation_failed`와 `validation_passed`가 동시에 존재 |
| `version` | `medium` | 예 | 예 | 같은 step에 promotable version이 여러 개 존재 |
| `confidence` | `medium` | 아니오 | 아니오 | spread가 threshold 이상이지만 high는 아님 |
| `confidence` | `high` | 기본은 아니오 | mode에 따라 달라짐 | `signal_only`/`review`/`blocking` 정책 적용 |

핵심은 아래 두 줄입니다.

- **기본 blocking conflict**: `contradiction`, `version`
- **기본 queue 대상**: blocking conflict 전체
- `confidence` high는 `confidenceConflictMode`에 따라 signal/review/blocking 중 하나로 승격 가능

즉, 기본값 기준 review queue의 의미는 여전히 단순하다.

- queue에 들어온 것은 **수동 검토가 실제로 필요한 blocking conflict**다
- 추가로 confidence를 queue에 올리고 싶을 때만 정책으로 승격한다

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

현재 구현에서는 **blocking이며 queue item도 자동 생성됩니다.**

즉 증상은 다음처럼 보일 수 있습니다.

- `promotableCount`가 기대보다 낮음
- review queue에 version conflict item이 생성됨
- apply는 보류됨

운영 해석:
- contradiction와 마찬가지로 운영자 확인 후 approve/reject해야 하는 대상이다
- long-run에서는 `latest_effective`를 우선 사용해 version 충돌 자체를 줄이는 것이 1차 대응이다

### 3. confidence

`confidence`는 기본적으로는 **operator signal**로 취급된다.

- `medium`: 지표로만 남음
- `high`: mode에 따라 signal / review / blocking으로 승격 가능
- `signal_only`에서는 candidate가 `requiresReview=true`가 되지 않는다
- `blocking`에서는 high confidence conflict에 걸린 candidate도 manual review 대상이 된다

운영 해석:
- 보수적인 workflow가 아니면 기본값 `signal_only`가 안전하다
- 운영 리스크가 높은 workflow만 `review` 또는 `blocking`으로 올리는 편이 현실적이다

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
- blocking conflict가 있었다
- contradiction이거나 version conflict일 가능성이 높다

우선 확인:
- `candidateNodeIds`가 비었는지
- `conflicts[].type`이 무엇인지

### 케이스 2. promote가 안 됐는데 queue도 없다

가장 먼저 의심할 것:
- `confidence` signal만 있었는지
- 단순 low-confidence로 promote가 안 된 것인지
- `evaluationMode`가 `full_history`라서 누적 이력이 많이 섞였는지

대응:
- 중간 trigger에서 `latest_effective` 적용 여부 확인
- debug trace의 `candidateCount / promotableCount / reviewQueueCount` 확인
- conflict summary에 version/contradiction이 실제 없는지 확인

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
- version conflict도 contradiction와 동일하게 queue 기반 수동 검토 대상으로 본다
- confidence conflict는 workflow risk에 따라 `signal_only` / `review` / `blocking`으로 운영한다
- approve는 단순 버튼이 아니라 **shared memory truth 승격 승인**으로 취급한다
- reject는 실패가 아니라 noisy / stale 상태를 정리하는 정상 운영 액션이다

---

## 현재 한계

- confidence conflict mode를 workflow별로 어떻게 표준화할지 운영 기준은 더 다듬을 여지가 있다
- no-op / apply skipped / review-queue-only 케이스를 더 잘 드러내는 표준 debug 출력은 추가 여지가 있다

즉, 현재 review queue는 **핵심 운영 루프는 가능하지만 정책은 아직 완전 마감 전** 상태로 보는 것이 정확하다.
