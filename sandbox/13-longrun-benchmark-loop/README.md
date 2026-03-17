# 13 Longrun Benchmark Loop Sandbox

> 상태: **active / canonical step 13**
>
> 이 sandbox는 long-running runner 위에서 benchmark attempt가 처음엔 실패하고, judge feedback을 반영해 repair한 뒤 최종 PASS로 끝나는 canonical sandbox입니다.

## 목적
- long-running runner(watchdog + large safety ceiling)를 사용한다
- solver와 judge 역할을 분리한다
- 첫 attempt는 의도적으로 FAIL verdict를 받는다
- repair step이 judge feedback을 반영해 attempt를 수정한다
- re-judge가 PASS verdict를 만든다
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
- 첫 verdict는 FAIL이다
- repaired attempt가 생성된다
- 최종 verdict는 PASS다
- archive note가 생성된다


## 워크플로우 그래프 (ASCII)

```text
+-------------------+
| run-with-watchdog |
+-------------------+
    |
    v
+---------------+
| solve initial |
+---------------+
    |
    v
+---------------+
| judge initial |
| FAIL          |
+---------------+
    |
    v
+--------+
| repair |
+--------+
    |
    v
+----------------+
| judge repaired |
| PASS           |
+----------------+
    |
    v
+---------+
| archive |
+---------+
```
