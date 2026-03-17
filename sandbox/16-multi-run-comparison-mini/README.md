# 16 Multi-Run Comparison Mini Sandbox

> 상태: **active / canonical step 16**
>
> 이 sandbox는 동일한 작은 benchmark 문제를 3회 독립 실행하고, 각 run의 정규화된 결과를 비교해 최종 요약과 archive note를 남기는 canonical multi-run comparison 기준점입니다.

## 목적

- 동일한 문제를 3회 독립적으로 실행한다
- 각 run이 정규화된 JSON result artifact를 남긴다
- comparator가 per-run snapshot, best/worst run, pass rate를 포함한 비교 요약을 만든다
- 최종 비교 결과를 archive note로 보존한다
- long-running runner(watchdog + large safety ceiling)를 사용한다

## 입력

- `input/problem.md`
- `input/reference-answer.md`

## 출력

- `output/iterations/results/01-run-1-result.json`
- `output/iterations/results/02-run-2-result.json`
- `output/iterations/results/03-run-3-result.json`
- `output/final/01-comparison-summary.md`
- `output/archive/40-multi-run-comparison-note.md`
- `output/iterations/logs/run.log`
- `output/iterations/logs/run.tail.log`

## 실행

```bash
# existing outputs 검증
sandbox/16-multi-run-comparison-mini/verify.sh

# sandbox 재실행
sandbox/16-multi-run-comparison-mini/run.sh

# output을 비우고 재실행 후 바로 검증
sandbox/16-multi-run-comparison-mini/verify.sh --fresh
```

## 성공 기준

- workflow가 `completed`로 끝난다
- watchdog wrapper를 통해 실행된다
- 3개의 독립 solver run이 각각 JSON result artifact를 생성한다
- 비교 요약에 `Overall Result`, `Per-Run Snapshot`, `Best Run`, `Worst Run`, `Pass Rate`가 포함된다
- archive note가 안정적인 heading 구조로 생성된다


## 워크플로우 그래프 (ASCII)

```text
                 +--------------+
                 | run-1 result |
                 +--------------+
                        \
                         \
                          v
+-------------------+  +--------------------+  +---------+
| run-with-watchdog |->| comparison summary |->| archive |
+-------------------+  +--------------------+  +---------+
                          ^
                         /
                        /
                 +--------------+
                 | run-2 result |
                 +--------------+
                        ^
                        |
                 +--------------+
                 | run-3 result |
                 +--------------+
```
