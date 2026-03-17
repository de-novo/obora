# 13 Longrun Benchmark Loop Sandbox

> 상태: **active / canonical step 13**
>
> 이 sandbox는 long-running runner 위에서 `solve_or_repair <-> judge` back-edge가 실제 judge 결과로 제어되는 canonical honest benchmark loop입니다.

## 목적

- long-running runner(watchdog + large safety ceiling)를 사용한다
- solver와 judge 역할을 분리한다
- 첫 attempt는 의도적으로 FAIL verdict를 받는다
- FAIL이면 runtime이 `solve_or_repair`로 되돌아간다
- repaired attempt는 latest judge feedback으로 수정된다
- PASS verdict 뒤에만 archive가 실행된다
- 최종 결과를 archive note로 남긴다

## 입력

- `input/problem.md`
- `input/reference-answer.md`

## 출력

- `output/final/01-attempt.md`
- `output/final/02-verdict.md`
- `output/final/03-repaired-attempt.md`
- `output/final/04-final-verdict.md`
- `output/archive/40-longrun-benchmark-loop-note.md`
- `output/iterations/logs/run.log`
- `output/iterations/logs/run.tail.log`

## 실행

```bash
# existing outputs 검증
sandbox/13-longrun-benchmark-loop/verify.sh

# sandbox 재실행
sandbox/13-longrun-benchmark-loop/run.sh

# output을 비우고 재실행 후 바로 검증
sandbox/13-longrun-benchmark-loop/verify.sh --fresh
```

## 성공 기준

- workflow가 `completed`로 끝난다
- watchdog wrapper를 통해 실행된다
- `solve_or_repair`와 `judge`가 실제로 두 번 이상 실행된다
- 첫 verdict는 FAIL이다
- 최종 verdict는 PASS다
- archive note가 생성된다

## 워크플로우 그래프 (ASCII)

```text
+-------------------+
| run-with-watchdog |
+-------------------+
    |
    v
+-----------------+
| solve_or_repair |
+-----------------+
    |
    v
+-------+
| judge |
+-------+
    | FAIL          PASS
    |               |
    +-- back-edge --+
    |
    v
+---------+
| archive |
+---------+
```
