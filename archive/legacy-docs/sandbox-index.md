# Sandbox Index

> Last updated: 2026-03-15

이 문서는 현재 `obora-kit`에서 제공하는 sandbox를 **공식 제공 / 베타 / 실험용**으로 최소한만 분류한 인덱스다.

## 분류 기준

- **official**: 지금 바로 예제로 보여줘도 되는 수준. 실행 경로와 성공 기준이 비교적 명확함.
- **beta**: 데모 가치는 있으나, native runtime 또는 운영 계약이 아직 불완전함.
- **experimental**: 구조/흐름은 있으나 아직 표준 예제로 내세우기 이름.

---

## Current Sandbox Index

| Sandbox | Tier | Status | Type | 실행 방식 | 비고 |
|---|---|---|---|---|---|
| `sandbox/reddit-poc` | official | verified | short native workflow | native `obora run` | 가장 작은 native workflow 예제 |
| `sandbox/math-proof-loop` | official | verified | proof / benchmark loop | native long-running workflow | solved/refuted/unresolved benchmark 가능 |
| `sandbox/glm47-research-loop` | official | verified | research / remediation loop | native long-running workflow | watchdog + archive + decision loop 검증 완료 |
| `sandbox/reddit-design-poc` | beta | partially verified | design-doc demo | fallback demo 중심 | 결과는 잘 나오지만 native workflow 예제로는 불완전 |
| `sandbox/todoapp-poc` | experimental | in-progress | product planning / dev workflow | native workflow 검증 중 | planning/dev ladder 정리 필요 |

---

## Recommended Starting Order

처음 체험 순서는 아래를 권장한다.

1. `sandbox/reddit-poc`
2. `sandbox/math-proof-loop`
3. `sandbox/glm47-research-loop`
4. `sandbox/reddit-design-poc`
5. `sandbox/todoapp-poc`

---

## Next Small Step

다음으로 할 가장 작은 작업은 아래 중 하나다.

1. `reddit-poc` README에 `official` 라벨과 실행/성공 기준 추가
2. `reddit-design-poc` README에 `beta/fallback demo` 명시
3. `todoapp-poc` planning workflow만 단독으로 재검증하고 상태 업데이트
