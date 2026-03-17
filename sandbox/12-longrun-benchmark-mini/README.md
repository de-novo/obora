# 12 Longrun Benchmark Mini Sandbox

> 상태: **active / canonical step 12**
>
> 이 sandbox는 long-running runner 위에서 solver와 judge를 분리한 가장 작은 benchmark workflow 기준점입니다.

## 목적
- long-running runner(watchdog + large safety ceiling)를 사용한다
- solver와 judge 역할을 분리한다
- solver는 문제만 보고 attempt를 만든다
- judge는 reference answer와 attempt를 비교해 PASS/FAIL verdict를 만든다
- 최종 결과를 archive note로 남긴다

## 입력
- `input/problem.md`
- `input/reference-answer.md`

## 출력
- `output/final/01-attempt.md`
- `output/final/02-verdict.md`
- `output/archive/40-longrun-benchmark-note.md`
- `output/iterations/logs/run.log`
- `output/iterations/logs/run.tail.log`

## 실행
```bash
# existing outputs 검증
sandbox/12-longrun-benchmark-mini/verify.sh

# sandbox 재실행
sandbox/12-longrun-benchmark-mini/run.sh

# output을 비우고 재실행 후 바로 검증
sandbox/12-longrun-benchmark-mini/verify.sh --fresh
```

## 성공 기준
- workflow가 `completed`로 끝난다
- watchdog wrapper를 통해 실행된다
- solver와 judge step이 분리되어 있다
- `02-verdict.md`가 PASS verdict를 남긴다
- archive note가 생성된다


## 워크플로우 그래프 (ASCII)

```text
+-------------------+
| run-with-watchdog |
+-------------------+
    |
    v
+-------+
| solve |
+-------+
    |
    v
+-------+
| judge |
+-------+
    |
    v
+---------+
| archive |
+---------+
```
