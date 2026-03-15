# Sandbox Overhaul Plan

> Last updated: 2026-03-15

## 1. 목적

현재 `obora-kit`의 sandbox들은 성격이 서로 다르다.

- 일부는 fallback 기반 데모에 가깝고
- 일부는 native Obora workflow가 실제로 돌며
- 일부는 장시간 연구/검증 루프를 수행한다.

이 문서의 목적은 sandbox들을 **난이도와 운영 성격 기준으로 재계층화**하고,
**간단한 workflow에서 복잡한 workflow로 자연스럽게 올라가는 구조**로 전면 개편하는 것이다.

---

## 2. 현재 상태 요약

### 2.1 현재 sandbox 분류

| Sandbox | 현재 성격 | 현재 상태 |
|---------|-----------|-----------|
| `reddit-design-poc` | 문서 생성 demo / fallback 중심 | 부분 검증 |
| `reddit-poc` | 짧은 deterministic native workflow | 검증 완료 |
| `todoapp-poc` | planning/dev형 product workflow | planning 검증 중 |
| `math-proof-loop` | 장시간 proof/review/archive loop | 검증 완료 |
| `glm47-research-loop` | 장시간 research/remediation/archive loop | 검증 완료 |

### 2.2 문제점

1. sandbox 간 **운영 계약이 균일하지 않음**
2. 어떤 sandbox는 `.obora/`, 어떤 sandbox는 루트 config를 사용하여 **구조가 섞여 있음**
3. fallback demo와 native workflow sandbox가 **같은 위상으로 섞여 있음**
4. 초보 사용자가 어디서부터 시작해야 하는지 **사다리가 없음**
5. benchmark / regression / archive 목적이 섞여 있어 **역할이 흐림**

---

## 3. 개편 목표

개편 목표는 세 가지다.

### 3.1 난이도 사다리 명확화
- 아주 짧고 deterministic한 workflow부터 시작해
- product planning/dev
- research/proof loop
- long-running benchmark loop
로 올라가게 한다.

### 3.2 운영 계약 통일
모든 sandbox가 아래 공통 원칙을 따르도록 한다.
- sandbox-local path only
- 명시적 input/output/notes 구조
- 실행 엔트리 명확화
- artifact/result/log 경로 일관화
- README에서 목적/실행법/성공 기준 명시

### 3.3 benchmark friendliness
각 sandbox가 아래 중 무엇인지 분명해야 한다.
- demo
- workflow regression
- product planning
- proof/research benchmark
- long-running orchestration benchmark

---

## 4. 권장 계층 구조

### Tier 0 — deterministic / fallback demo
**목적:** Obora를 처음 접할 때 가장 빠르게 “무언가 나온다”를 보여주는 층

대상:
- `reddit-design-poc`

특징:
- 1분 이내
- native workflow가 아니어도 됨
- fallback 허용
- 산출물은 문서/표/요약

성공 기준:
- 항상 동일하거나 거의 동일한 결과
- 설치/인증 민감도 낮음
- README 따라가면 실패하지 않음

권장 개편:
- `reddit-design-poc`는 **명시적으로 fallback demo**라고 표기
- native Obora path가 아직 미완이면 억지로 숨기지 말고 분리
- `run-design-demo.sh`의 목표를 “문서 세트 생성 데모”로 고정

---

### Tier 1 — short native workflow
**목적:** native Obora workflow 실행 자체를 검증하는 가장 작은 단위

대상:
- `reddit-poc`

특징:
- 수 초~수 분
- deterministic input
- output이 짧고 명확
- step trace가 읽기 쉬움

성공 기준:
- native `obora run`으로 매번 통과
- artifact JSON 결과가 명확
- regression test와 잘 연결됨

권장 개편:
- `reddit-poc`를 Tier 1 표준 예제로 승격
- README 추가
- expected output 예시 저장
- smoke test 스크립트 추가

---

### Tier 2 — product planning / product dev workflow
**목적:** product/task planning과 multi-step agent orchestration을 보여주는 층

대상:
- `todoapp-poc`

특징:
- planning workflow + dev workflow 분리
- LLM step이 실제로 의미를 가짐
- 산출물은 PRD/checklist/release package 등

성공 기준:
- planning workflow 완주
- dev workflow가 planning 산출물을 소비하도록 연결
- 산출물이 누적되고 추적 가능

권장 개편:
- `todoapp-poc`를 planning/dev 두 sandbox로 분리 고려
  - `todoapp-planning-poc`
  - `todoapp-dev-poc`
- 또는 하나로 유지하되 README에 2단계 ladder 명시
- output 경로, result/log 경로를 명시적으로 만들 것
- 현재는 `.obora/artifacts`와 문서 산출물의 연결이 약하므로 정리 필요

---

### Tier 3 — proof / research benchmark loop
**목적:** solved / refuted / unresolved를 정직하게 분류하는 연구용 루프

대상:
- `math-proof-loop`

특징:
- 문제 framing
- known results audit
- proof attempt
- counterexample check
- review/final/archive

성공 기준:
- bounded conclusion을 정직하게 냄
- archiveable output 생성
- false progress를 review가 잡음

권장 개편:
- benchmark mode를 명시적으로 분리
  - solved benchmark
  - refuted benchmark
  - former-conjecture benchmark
  - external benchmark (예: Aletheia statement-only)
- input/problem-instance 교체 이력을 notes로 남길 것
- run 결과별 verdict summary index 추가

---

### Tier 4 — long-running research / remediation loop
**목적:** 장시간 loop, remediation, archive, loop decision까지 포함한 운영형 benchmark

대상:
- `glm47-research-loop`

특징:
- multi-step research
- remediation iteration
- final stop/continue decision
- archive-or-deferral
- watchdog 기반 장시간 실행

성공 기준:
- sandbox-local 경로 고정
- result JSON fallback 포함 decision 파싱
- idle watchdog 정책으로 안정 완주
- archive 품질 유지

권장 개편:
- compact / semicompact / semifine / remediation 모드 설명을 README에 표로 정리
- 각 runner의 차이를 문서화
- benchmark matrix 추가
  - model
  - runtime mode
  - duration
  - verdict
  - archive quality

---

## 5. 공통 표준 구조

모든 sandbox는 가능하면 아래 구조를 따른다.

```text
sandbox/<name>/
├── README.md
├── agents.yaml or .obora/agents.yaml
├── obora.config.yaml or .obora/config.yaml
├── input/
├── output/
│   ├── final/
│   ├── iterations/
│   │   ├── logs/
│   │   └── results/
│   └── archive/
├── notes/
├── workflows/
├── run-*.sh
└── .gitignore
```

### 원칙
1. relative path가 repo root로 새지 않도록 **sandbox-local path 우선**
2. `output/final`, `output/iterations`, `output/archive` 역할 분리
3. result/log path를 항상 예측 가능하게 유지
4. README에 최소 다음 내용 포함
   - 목적
   - 실행 명령
   - 성공 기준
   - 실패 시 체크포인트

---

## 6. 실행/검증 계약 표준

### 6.1 Runner contract
모든 장시간 runner는 다음 정책을 사용한다.
- idle watchdog + large safety ceiling
- 짧은 wall-clock hard timeout 금지
- result JSON fallback 지원
- decision parsing 시 whitespace trim 포함

### 6.2 Workflow contract
모든 workflow는:
- sandbox-local input/output만 사용
- top-level `output/` 오염 금지
- archive output 경로 명시
- final classification semantics 명시

### 6.3 Verification contract
각 sandbox는 적어도 아래 중 하나를 가져야 한다.
- smoke run
- regression test
- expected artifact snapshot
- benchmark verdict index

---

## 7. 추천 재편 순서

### Phase 1 — taxonomy 정리
1. `reddit-design-poc` → fallback demo로 명확히 표기
2. `reddit-poc` → Tier 1 native workflow exemplar로 승격
3. `todoapp-poc` → planning/dev ladder로 명확히 분리

### Phase 2 — directory / README 표준화
1. README 통일 템플릿 적용
2. output/log/result 구조 통일
3. notes에 benchmark / verdict 기록 추가

### Phase 3 — verification 강화
1. Tier 1/2 smoke test 추가
2. Tier 3/4 regression test 확장
3. sandbox matrix 문서 생성

### Phase 4 — experience design
1. “처음 써보는 사용자”용 추천 순서 제공
2. `run all verified sandboxes` 같은 상위 스크립트 고려
3. sandbox별 runtime cost/latency 표기

---

## 8. 추천 사용자 경험(학습 사다리)

사용자가 처음 Obora를 체험할 때는 아래 순서가 좋다.

1. `reddit-design-poc`
   - fallback demo
   - 산출물이 빨리 나옴
2. `reddit-poc`
   - native workflow가 실제로 돈다는 걸 확인
3. `todoapp-poc` planning
   - multi-step agent planning 체험
4. `math-proof-loop`
   - solved/refuted/unresolved benchmark
5. `glm47-research-loop`
   - 장시간 remediation/archive loop

즉 **simple → native → planning → proof → long-running orchestration** 순서다.

---

## 9. 즉시 실행 가능한 다음 작업

### P1
- `reddit-poc` README 추가
- `todoapp-poc` planning/dev 산출물 경로 정리
- sandbox index 문서 생성

### P2
- `todoapp-poc` planning workflow 완주 후 dev workflow 검증
- `reddit-design-poc`를 fallback demo로 명시하고 native path는 future work로 분리

### P3
- 모든 sandbox에 동일 README 템플릿 적용
- benchmark status matrix 추가

---

## 10. CTO 권장안

지금 기준 최우선은 아래다.

1. **sandbox taxonomy를 고정**한다.
2. **Tier 0~4 학습 사다리**를 README/index에 드러낸다.
3. `todoapp-poc`를 Tier 2 표준 sandbox로 완주 검증한다.
4. 그 다음에야 남은 demo/poc를 미세 정리한다.

핵심은 “샌드박스가 많다”가 아니라,
**각 샌드박스가 사용자의 어떤 학습/검증 경험을 담당하는지 명확해야 한다**는 점이다.
