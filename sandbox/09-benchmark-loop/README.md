# 09 Benchmark Loop Sandbox

> 상태: **active / canonical step 09**
>
> 이 sandbox는 `solve_or_repair <-> judge`가 실제 judge 결과로 다시 연결되는 가장 작은 honest benchmark loop 기준점입니다.

## 목적

- solver가 첫 시도(attempt)를 만든다
- judge가 reference answer와 비교해 FAIL 또는 PASS를 판정한다
- FAIL이면 runtime이 `solve_or_repair`로 다시 들어가 최신 judge feedback으로 수정한다
- PASS가 나면 archive note로 보존한다

## 입력

- `input/problem.md`
- `input/reference-answer.md`

## 출력

- `output/final/01-attempt.md`
- `output/final/02-verdict.md`
- `output/final/03-repaired-attempt.md`
- `output/final/04-final-verdict.md`
- `output/archive/40-benchmark-loop-archive-note.md`
- `output/iterations/logs/run.log`
- `output/iterations/logs/run.tail.log`

## 실행

```bash
node bin/obora.js run \
  sandbox/09-benchmark-loop/workflows/00-benchmark-loop.yaml \
  --config sandbox/09-benchmark-loop/obora.config.yaml \
  --agents sandbox/09-benchmark-loop/agents.yaml \
  --output-dir sandbox/09-benchmark-loop/output/iterations/results \
  --verbose --no-color
```

또는

```bash
sandbox/09-benchmark-loop/run.sh

# output을 비우고 재실행 후 바로 검증
sandbox/09-benchmark-loop/verify.sh --fresh
```

## 성공 기준

- workflow가 `completed`로 끝난다
- `solve_or_repair`와 `judge`가 실제로 두 번 이상 실행된다
- 첫 verdict는 FAIL이다
- 최종 verdict는 PASS다
- archive note가 생성된다

## 워크플로우 그래프 (ASCII)

```text
+---------+
| problem |
+---------+
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
