# Canonical Sandbox Spec

> Last updated: 2026-03-17

이 문서는 `sandbox/01~20` active canonical sandbox들이 공통으로 따라야 하는 최소 규격을 정의한다.

## 목적

canonical sandbox는 레거시 실험 자산이 아니라,
**Obora의 재현 가능한 학습 사다리**를 구성하는 기준 예제여야 한다.

즉 각 sandbox는 다음 중 하나의 새로운 primitive를 검증해야 한다.

- native execution
- review handoff
- validation
- repair loop
- archive
- small project lifecycle
- benchmark / judge separation
- long-running runner contract
- minimal real-paper claim verification
- paper-verification remediation loop
- threshold-driven feedback convergence loop

---

## 공통 규칙

### 1. 위치

- 활성 sandbox는 `sandbox/` 바로 아래에 둔다.
- 이름은 숫자 prefix를 가진다.
  - 예: `01-simple-native`
  - 예: `02-simple-review`

### 2. 최소 구조

각 sandbox는 최소한 아래 구조를 가진다.

```text
sandbox/<name>/
├── README.md
├── agents.yaml
├── obora.config.yaml
├── input/
├── output/
│   ├── final/
│   ├── iterations/
│   │   └── results/
│   └── archive/   # 필요 시
├── workflows/
└── run.sh
```

### 3. 입력/출력 경로

- workflow는 sandbox-local absolute path를 사용한다.
- repo top-level `output/`에 쓰면 안 된다.
- active canonical sandbox는 서로의 output을 참조하지 않는다.

### 4. 실행 방식

모든 canonical sandbox는 아래 두 방식 중 적어도 하나를 문서화한다.

1. 직접 실행

```bash
node bin/obora.js run ...
```

2. wrapper 실행

```bash
sandbox/<name>/run.sh
```

### 5. 성공 기준

README에는 반드시 아래가 있어야 한다.

- 목적
- 입력
- 출력
- 실행 명령
- 성공 기준

### 6. 검증 원칙

- sandbox는 실제 **Obora native run**으로 검증되어야 한다.
- fallback demo는 canonical sandbox로 분류하지 않는다.
- 각 sandbox는 이전 단계보다 정확히 하나의 새로운 primitive만 추가하는 것이 바람직하다.

### 7. 루프 정직성 규칙

- back-edge 없이 미리 펼쳐 둔 고정 step 나열을 **loop**라고 부르면 안 된다.
- `v1 -> e1 -> v2 -> e2 -> v3 -> e3` 같은 scripted sequence는 feedback-aware sequence일 수는 있어도, runtime-native cyclic loop는 아니다.
- canonical sandbox가 feedback loop / convergence loop / repair loop라고 주장하려면, **validator/judge 결과가 실제 control flow를 다시 이전 step으로 되돌리는 구조**가 있어야 한다.
  - 예: `on_fail.goto`, runtime branch, explicit re-entry
- revision step은 다음에 무엇을 고칠지 **미리 박아두면 안 되고**, 직전 evaluation/validation 결과에서 failed checks 또는 next action을 읽어 동적으로 결정해야 한다.
- threshold-driven loop라고 주장하려면 종료는 미리 정한 마지막 step이 아니라 **실제 threshold 충족 여부**로 결정되어야 한다.
- README의 ASCII 그래프와 ladder 설명은 데이터 참조가 아니라 **실제 control flow**를 그려야 한다.

---

## 현재 canonical ladder

### 01 — simple native

- primitive: 단일 native step

### 02 — simple review

- primitive: draft → review handoff

### 03 — simple validation

- primitive: draft → validation report

### 04 — simple loop

- primitive: validation fail → repair → pass

### 05 — simple archive

- primitive: final → archive

### 06 — project mini

- primitive: draft → review → final → validation → archive 조합

### 07 — project loop

- primitive: project lifecycle 안의 runtime-native build_or_repair/validate remediation loop

### 08 — benchmark mini

- primitive: solve → judge → archive

### 09 — benchmark loop

- primitive: runtime-native solve_or_repair/judge remediation loop

### 10 — longrun mini

- primitive: watchdog-wrapped long-running runner

### 11 — longrun loop

- primitive: long-running runner + validation-repair contract

### 12 — longrun benchmark mini

- primitive: long-running runner + solver/judge benchmark separation

### 13 — longrun benchmark loop

- primitive: long-running runner + runtime-native solve_or_repair/judge loop

### 14 — longrun project mini

- primitive: long-running runner + project mini lifecycle

### 15 — longrun project loop

- primitive: long-running runner + runtime-native build_or_repair/validate loop

### 16 — multi-run comparison mini

- primitive: 동일 문제 다회 독립 실행 + 정규화된 per-run result 비교 + archive

### 17 — multi-run comparison loop

- primitive: multi-run comparison baseline + runtime-native compare_or_repair/validate loop with targeted remediation

### 18 — longrun paper verification mini

- primitive: long-running runner + vendored public-paper fixture + claim-by-claim verification + archive

### 19 — longrun paper verification loop

- primitive: long-running runner + runtime-native verify_or_repair/validate loop against the same vendored fixture + archive

### 20 — longrun feedback convergence loop

- primitive: long-running runner + runtime-native build_or_repair/validate back-edge loop with structured validation control until threshold + archive

---

## 다음 단계 설계 원칙

`10+`부터는 primitive를 하나 더 추가하기보다,
이미 검증된 조합을 더 현실적인 운영 흐름으로 확장한다.

즉 다음 단계 sandbox는 아래 중 하나여야 한다.

- project-oriented extension
- benchmark-oriented extension
- long-running extension
- multi-run comparison extension (step 16 완료, step 17 loop 완료)
- paper-verification extension
- feedback-convergence extension
- tool-using extension

단, 기존 canonical ladder의 공통 계약을 깨면 안 된다.
