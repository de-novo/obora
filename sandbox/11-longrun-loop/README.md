# 11 Longrun Loop Sandbox

> 상태: **active / canonical step 11**
>
> 이 sandbox는 long-running runner 계약과 repair loop를 함께 검증하는 canonical sandbox입니다.

## 목적
- long-running runner(watchdog + large safety ceiling)를 사용한다
- 첫 validation은 실패한다
- repair를 거쳐 최종 validation은 PASS가 된다
- validator는 human-readable report와 structured return을 분리한다
- 최종 결과를 archive로 남긴다

## 입력
- `input/brief.md`

## 출력
- `output/final/01-draft.md`
- `output/final/02-validation.md`
- `output/final/03-repaired.md`
- `output/final/04-final-validation.md`
- `output/archive/40-longrun-loop-note.md`
- `output/iterations/logs/run.log`
- `output/iterations/logs/run.tail.log`

## 실행
```bash
# existing outputs 검증
sandbox/11-longrun-loop/verify.sh

# sandbox 재실행
sandbox/11-longrun-loop/run.sh

# output을 비우고 재실행 후 바로 검증
sandbox/11-longrun-loop/verify.sh --fresh
```

## 성공 기준
- workflow가 `completed`로 끝난다
- watchdog wrapper를 통해 실행된다
- 첫 validation은 FAIL이다
- repair 이후 최종 validation은 PASS다
- archive note가 생성된다


## 워크플로우 그래프 (ASCII)

```text
+-------------------+
| run-with-watchdog |
+-------------------+
    |
    v
+---------+
| attempt |
+---------+
    |
    v
+------------+
| validation |
| FAIL       |
+------------+
    |
    v
+--------+
| repair |
+--------+
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
