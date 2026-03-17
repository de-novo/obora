# Canonical Sandbox Ladder

> Last updated: 2026-03-17

이 문서는 현재 활성 canonical sandbox `01~11`를 한눈에 설명하는 인덱스다.

## 목적

canonical sandbox ladder는 Obora의 핵심 실행 패턴을
**작은 것부터 큰 것으로** 단계적으로 학습하고 검증하기 위한 기준 세트다.

각 단계는 이전 단계 위에 정확히 하나의 새로운 능력 또는 조합 패턴을 더한다.

---

## Ladder Overview

| Step | Sandbox | 핵심 패턴 | 무엇을 검증하는가 |
|---|---|---|---|
| 01 | `01-simple-native` | 단일 native step | 가장 작은 Obora native workflow |
| 02 | `02-simple-review` | draft → review | handoff / review 분리 |
| 03 | `03-simple-validation` | draft → validation | validation report / PASS-FAIL 구조 |
| 04 | `04-simple-loop` | fail → repair → pass | 최소 repair loop |
| 05 | `05-simple-archive` | final → archive | 결과와 archive 분리 |
| 06 | `06-project-mini` | small project lifecycle | draft → review → final → validation → archive |
| 07 | `07-project-loop` | project + repair loop | project lifecycle 안의 remediation |
| 08 | `08-benchmark-mini` | solve → judge → archive | solver / judge 분리 benchmark |
| 09 | `09-benchmark-loop` | fail → repair → re-judge → archive | benchmark remediation loop |
| 10 | `10-longrun-mini` | watchdog-wrapped longrun | long-running runner 계약 |
| 11 | `11-longrun-loop` | longrun + fail → repair → pass | long-running repair loop contract |

---

## Step-by-step meaning

### 01 — simple native
가장 작은 native 실행 예제.

- input 1개
- step 1개
- output 1개

이 단계는 “Obora workflow가 실제로 돈다”를 가장 작은 형태로 보여준다.

### 02 — simple review
처음으로 draft와 review를 분리한다.

- writer
- reviewer
- intermediate output
- final output

이 단계는 multi-step handoff를 검증한다.

### 03 — simple validation
처음으로 explicit validation report를 도입한다.

- validator role
- checklist
- Verdict / Passed / Failed / Next Action

이 단계는 review와 validation을 구분하는 기준점이다.

### 04 — simple loop
validation fail 이후 repair를 수행한다.

- first fail
- repair
- second pass

이 단계는 최소 remediation loop를 검증한다.

### 05 — simple archive
최종 결과를 archive note로 별도 보존한다.

- final output
- archive output

이 단계는 “완료”와 “보존”을 분리한다.

### 06 — project mini
01~05를 직선형 project lifecycle로 합친다.

- draft
- review
- final
- validation
- archive

이 단계는 가장 작은 project-style canonical sandbox다.

### 07 — project loop
06 위에 project remediation loop를 추가한다.

- initial validation fail
- repair
- final validation pass
- archive

이 단계는 실무형 project sandbox의 최소 루프 패턴이다.

### 08 — benchmark mini
처음으로 benchmark 패턴을 도입한다.

- solver
- judge
- archive

이 단계는 “문제를 푼다”와 “답안을 채점한다”를 분리한다.

### 09 — benchmark loop
08 위에 benchmark remediation loop를 추가한다.

- first attempt fail
- repair
- re-judge pass
- archive

이 단계는 benchmark에서도 feedback loop가 가능함을 보여준다.

### 10 — longrun mini
처음으로 long-running runner 계약을 canonical ladder에 올린다.

- watchdog wrapper
- idle timeout
- large safety ceiling
- tail log 보존

이 단계는 “오래 도는 workflow를 어떻게 안전하게 감싸고 추적할 것인가”를 검증한다.

### 11 — longrun loop
10 위에 validation-repair loop contract를 결합한다.

- first validation fail
- repair re-entry
- final validation pass
- archive
- validator report와 structured return 분리

이 단계는 long-running workflow에서도 repair loop contract가 안정적으로 유지되는지 검증한다.

---

## How to use this ladder

### 처음 보는 사용자
권장 순서:
1. 01
2. 02
3. 03
4. 04
5. 05
6. 06
7. 07
8. 08
9. 09
10. 10
11. 11

### 제품형 sandbox 설계자
추천 기준점:
- 06
- 07
- 10
- 11

### benchmark형 sandbox 설계자
추천 기준점:
- 08
- 09

---

## What comes next

`10+`부터는 primitive를 더 추가하기보다,
이미 검증된 조합을 더 현실적인 운영 시나리오로 확장한다.

예시:
- long-running project loop
- long-running benchmark loop
- multi-run comparison sandbox
- tool-using benchmark sandbox

즉 01~09는 foundation이고,
10~11은 runner/contract expansion의 첫 기준점이다.
