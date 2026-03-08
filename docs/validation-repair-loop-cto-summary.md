# Validation-Repair Loop CTO Summary

## 한줄 결론

Obora는 이번 라운드를 통해 **"한 번 생성하고 끝나는 워크플로우 러너"**에서
**"검증 실패를 다시 입력으로 받아 수렴을 관리하는 AI Control Runtime"**으로 한 단계 올라왔다.

이 변화는 단순 기능 추가가 아니라,
Obora의 제품 포지셔닝(operable / auditable / recoverable)과 실제 구현 능력 사이의 간극을 줄인 작업이다.

---

## 1. 이번에 실제로 확보한 것

### 1.1 Runtime capability

기존 요소:
- JudgmentEngine
- back-edge loop (`on_fail.goto`, `max_iterations`)
- recovery / audit / persistence

이번에 붙인 것:
- `ValidationResult` / `RepairContext` 계약
- validation 실패를 repair step 입력으로 자동 연결
- repair-aware step 재진입
- no-progress 판단
- persisted `run.metadata.repairLoop`
- `toolLimits`

즉 기존 조각은 있었지만,
이번에 처음으로 **engineering-grade validation-repair loop**가 제품 기능으로 이어졌다.

### 1.2 CLI capability

추가된 것:
- `obora run` live repair-loop progress
- `obora inspect` / `obora runs inspect` repair-loop summary
- recent validation failures 표시
- `obora runs list --repair-loop ...`
- `obora runs list --sort validationFailed|repairStarted`
- compact `Loop State` column

즉 CLI만으로도 run triage가 가능해졌다.

### 1.3 Dashboard capability

추가된 것:
- repair-loop column
- 상태 badge (`EXHAUSTED`, `STALLED`, `CONVERGED`, `REPAIRED`, `PASSED`)
- quick filter chips
- chip counts
- `validationFailed` sort
- detail page repair-loop card
- recent validation failures drilldown

즉 dashboard가 단순 run viewer에서
**repair-loop operations console** 쪽으로 움직이기 시작했다.

### 1.4 Example / sandbox proof

- 최소 예제: `examples/06-validation-repair-loop`
- 프로젝트급 검증: `.sandbox/12-reddit-clone-modern-repair-loop`

즉:
- 이해용 reference
- 실전 수렴 증빙

두 층이 모두 생겼다.

---

## 2. 제품 관점에서의 의미

이번 작업의 본질은 아래 변화다.

### 이전
- LLM이 잘 생성하면 성공
- 실패하면 사람이 프롬프트를 고친다
- recovery는 generic retry 쪽에 가까움

### 현재
- validator가 실패를 구조화한다
- runtime이 repair step으로 재주입한다
- 수렴 과정을 persistence에 남긴다
- CLI/dashboard가 그 과정을 해석해 보여준다

즉 Obora의 중심이
**"생성"**에서
**"수렴 관리(convergence management)"** 쪽으로 이동했다.

이건 Obora positioning과도 맞다.

- deterministic orchestration
- recovery
- auditability
- operability

이 네 축과 지금 구현이 더 정렬됐다.

---

## 3. 이번 라운드에서 같이 발견하고 해결한 부수 이슈

### 3.1 dashboard websocket 무한 루프

캡처 과정에서 드러난 문제:
- `useWebSocket` callback identity 변화로 reconnect/disconnect 루프
- 결과적으로 blank page + `Maximum update depth exceeded`

해결:
- callback ref 분리
- effect dependency 안정화

의미:
- quick filter 작업 과정에서, dashboard 공통 안정성도 같이 올라감

### 3.2 persistence precedence / completion save 정합성

확인된 문제:
- explicit runtime persistence 설정이 loaded config에 밀릴 수 있었음
- completion save 전에 `execution.endedAt` / `status` 세팅이 애매했음

해결:
- runtime explicit config 우선
- completion save 타이밍 정리

의미:
- repair-loop metadata 저장만 고친 게 아니라,
  persistence 경계 자체가 더 명확해짐

### 3.3 tool limit 설계

초기 문제:
- blanket tool round limit이 file-heavy generation step을 가로막음

개선:
- `toolLimits` 도입
- expensive/external tool만 제한
- file tool은 사실상 unrestricted

의미:
- 현실적인 생성 워크플로우에 더 맞는 정책으로 이동

---

## 4. 지금 상태에서의 강점

### 강점 1 — 실제로 동작하는 loop
`.sandbox/12`에서
생성 → validation fail → repair → re-validation pass
가 실제로 검증됐다.

즉 이건 설계 문서만 있는 게 아니라,
실제 working proof가 있다.

### 강점 2 — 관찰성이 좋다
run 중 / run 후 / list / detail / dashboard까지
모두 repair-loop 관점으로 해석 가능하다.

이건 운영성 측면에서 중요하다.

### 강점 3 — persisted schema가 있다
`run.metadata.repairLoop`가 생기면서
외부 dashboard / analytics / automation이 붙기 쉬워졌다.

### 강점 4 — 예제와 문서가 있다
이제 기능이 “코드만 있는 상태”가 아니다.
- docs
- example
- sandbox
- CLI UX
- dashboard UX

가 같이 있다.

---

## 5. 남은 리스크 / 한계

### 리스크 1 — validator/log drilldown은 아직 완전하지 않음
현재는 log path / failed check를 보여주지만,
실제 artifact/file/log로 바로 drilldown 하는 UX는 아직 얕다.

즉 diagnosis는 가능하지만,
**조치 동선(actionability)** 은 더 좋아질 수 있다.

### 리스크 2 — post-processing 기반 list/sort
CLI `runs list` 일부 정렬/필터는 post-processing 기반이다.
데이터셋이 커지면 효율 문제가 생길 수 있다.

현재는 기능적으로 충분하지만,
대규모 운영에서는 server-side optimization 여지가 있다.

### 리스크 3 — persisted summary는 repair-loop 중심
`run.metadata.repairLoop`는 지금 매우 유용하지만,
모든 workflow semantics를 일반화한 메타모델은 아니다.

즉 지금은 정확히 필요한 부분을 잘 저장하는 상태이고,
장기적으로 broader execution summaries로 확장할 여지가 있다.

### 리스크 4 — demo data와 실제 운영 DB의 간극
캡처 검증은 demo DB로 했다.
실제 운영 run들에 repair-loop metadata가 자연스럽게 쌓이는지,
운영 환경에서 더 자주 검증할 필요는 있다.

---

## 6. 지금 시점의 권장 우선순위

### Priority 1 — drilldown UX 강화
추천 이유:
- 현재 가장 남은 gap이 diagnosis → action 연결이다.
- log path / failed checks에서 실제 artifact/log/file로 더 쉽게 이동하게 만들면 운영 가치가 바로 올라간다.

예:
- dashboard detail에서 log path 클릭
- failed file path 클릭
- related artifact jump

### Priority 2 — history/list 효율 최적화
추천 이유:
- 지금 기능은 충분히 좋지만,
  큰 데이터셋에서 sorting/filtering 비용이 커질 수 있다.
- persisted summary를 더 직접 활용하는 query path를 만들면 좋아진다.

### Priority 3 — external API exposure
추천 이유:
- 이미 metadata schema가 있으니,
  외부 automation / dashboards / reports가 붙기 좋다.
- product platform 방향으로 가려면 가치가 크다.

### Priority 4 — generalized execution summaries
추천 이유:
- repair-loop에서 끝나지 않고,
  장기적으로 workflow observability 전반으로 확장 가능하다.
- 다만 지금은 repair-loop가 더 우선이다.

---

## 7. 추천하지 않는 것

### 비추천 1 — 지금 또 새로운 큰 DSL 만들기
현재는 existing back-edge + repair_loop + validation으로 충분히 가치가 난다.
지금 시점에서 더 큰 DSL 실험을 늘리는 건 우선순위가 아니다.

### 비추천 2 — prompt tuning으로 회귀
우리가 얻은 가장 중요한 교훈은
프롬프트를 더 세게 만드는 것보다,
validation-driven repair loop가 훨씬 본질적이라는 점이다.

### 비추천 3 — 문서 없이 기능만 더 늘리기
이번 라운드는 코드/예제/문서/UX가 같이 갔기 때문에 가치가 컸다.
앞으로도 이 정합성을 유지하는 게 좋다.

---

## 8. 최종 판단

지금 상태에서 Obora는 분명히 한 단계 올라왔다.

이전보다 더 정확하게 말하면,
Obora는 이제:
- 실패를 구조화하고
- repair를 반복하며
- 수렴을 저장하고
- 그 상태를 운영자가 관찰하고 탐색할 수 있는

**실무형 validation-driven runtime**이 되기 시작했다.

이건 단지 기능 몇 개가 붙은 게 아니라,
Obora의 제품 정체성이 실제 구현으로 더 내려온 변화다.

---

## 9. 다음 액션 제안

바로 다음 라운드에서 추천하는 순서는 이렇다.

1. dashboard detail / inspect에서 log/artifact drilldown 강화
2. list/history query 효율 최적화
3. persisted repair-loop summary의 external API exposure 검토

이 세 개가 다음 가장 현실적이고 가치 있는 우선순위다.
