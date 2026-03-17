# 17 Multi-Run Comparison Loop Sandbox

> 상태: **active / canonical step 17**
>
> 이 sandbox는 step 16의 solve×3 -> compare -> archive 패턴을 확장해, 초기 비교 실패를 검증하고 실패한 run 하나를 remediation한 뒤 최종 비교를 다시 통과시키는 canonical multi-run comparison loop 기준점입니다.

## 목적

- 동일한 작은 benchmark 문제를 3회 독립 실행한다
- 초기 비교에서 의도적으로 하나의 실패 run을 포함해 PARTIAL 결과를 만든다
- validation 단계가 초기 비교를 FAIL로 판정한다
- 실패한 run 하나를 repair한 뒤 최종 비교를 다시 수행한다
- long-running runner(watchdog + large safety ceiling)를 사용한다

## 입력

- `input/problem.md`
- `input/reference-answer.md`

## 출력

- `output/iterations/results/01-run-1-result.json`
- `output/iterations/results/02-run-2-result.json`
- `output/iterations/results/03-run-3-result.json`
- `output/final/01-initial-comparison-summary.md`
- `output/final/02-comparison-validation.md`
- `output/iterations/results/04-run-2-repaired-result.json`
- `output/final/03-final-comparison-summary.md`
- `output/final/04-final-comparison-validation.md`
- `output/archive/40-multi-run-comparison-loop-note.md`
- `output/iterations/logs/run.log`
- `output/iterations/logs/run.tail.log`

## 실행

```bash
# existing outputs 검증
sandbox/17-multi-run-comparison-loop/verify.sh

# sandbox 재실행
sandbox/17-multi-run-comparison-loop/run.sh

# output을 비우고 재실행 후 바로 검증
sandbox/17-multi-run-comparison-loop/verify.sh --fresh
```

## 성공 기준

- workflow가 `completed`로 끝난다
- watchdog wrapper를 통해 실행된다
- 3개의 초기 run과 repaired run이 각각 정규화된 JSON result artifact를 생성한다
- 초기 비교 요약이 `PARTIAL` 또는 `FAIL`을 나타내고 초기 validation은 `FAIL`이다
- 최종 비교 요약이 안정적인 비교 heading을 포함하고 최종 validation은 `PASS`다
- archive note가 안정적인 heading 구조로 생성된다


## 워크플로우 그래프 (ASCII)

```text
                 +--------------+
                 | run-1 result |
                 +--------------+
                        \
                         \
                          v
+-------------------+  +--------------------+  +---------------------+
| run-with-watchdog |->| initial comparison |->| comparison validation|
+-------------------+  +--------------------+  | FAIL                |
                          ^                     +---------------------+
                         /                                 |
                        /                                  v
                 +-------------------+               +--------------+
                 | run-2 result FAIL |               | repair failed|
                 +-------------------+               | run          |
                        ^                            +--------------+
                        |                                   |
                 +--------------+                           v
                 | run-3 result |               +----------------------+
                 +--------------+               | run-2 repaired result|
                                                +----------------------+
                                                           |
                                                           v
                 +--------------+                 +------------------+
                 | run-1 result |---------------> | final comparison |
                 +--------------+                 +------------------+
                                                           ^
                                                           |
                 +--------------+                          |
                 | run-3 result |--------------------------+
                 +--------------+
                                                           |
                                                           v
                                                +------------------+
                                                | final validation |
                                                | PASS             |
                                                +------------------+
                                                           |
                                                           v
                                                    +---------+
                                                    | archive |
                                                    +---------+
```
