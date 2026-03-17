# 17 Multi-Run Comparison Loop Sandbox

> 상태: **active / canonical step 17**
>
> 이 sandbox는 step 16의 solve×3 baseline 위에 `compare_or_repair <-> validate_comparison` back-edge를 올려, validator가 지목한 failing run만 고쳐 다시 비교하는 canonical honest multi-run comparison loop 기준점입니다.

## 목적

- 동일한 작은 benchmark 문제를 3회 독립 실행한다
- 초기 비교에서 의도적으로 하나의 실패 run을 포함해 PARTIAL 결과를 만든다
- `validate_comparison`이 FAIL이면 runtime이 `compare_or_repair`로 되돌아간다
- remediation은 latest validation이 지목한 failing run만 대상으로 한다
- 최종 비교가 PASS일 때만 archive를 수행한다
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
- `compare_or_repair`와 `validate_comparison`이 실제로 두 번 이상 실행된다
- 초기 비교 요약이 `PARTIAL`을 나타내고 초기 validation은 `FAIL`이다
- 최종 비교 요약이 안정적인 비교 heading을 포함하고 최종 validation은 `PASS`다
- archive note가 안정적인 heading 구조로 생성된다

## 워크플로우 그래프 (ASCII)

```text
+-------------------+
| run-with-watchdog |
+-------------------+
    |
    +--> [run-1 result]
    +--> [run-2 result: FAIL]
    +--> [run-3 result]
             |
             v
   +-------------------+
   | compare_or_repair |
   +-------------------+
             |
             v
   +---------------------+
   | validate_comparison |
   +---------------------+
      | FAIL                       PASS
      |                            |
      +------ back-edge -----------+
      |   repair only failing run
      v
   +--------------------+
   | archive-comparison |
   +--------------------+
```
