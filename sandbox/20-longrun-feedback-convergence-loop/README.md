# 20 Longrun Feedback Convergence Loop Sandbox

> 상태: **active / canonical step 20**
>
> 이 sandbox는 step 19의 one-shot remediation loop를 넘어, validator의 structured result가 runtime back-edge를 다시 열고 같은 candidate를 임계치까지 수렴시키는 첫 canonical convergence loop 기준점입니다.

## 목적

- long-running runner(watchdog + large safety ceiling)를 사용한다
- 작은 구조화 writing task를 `build_or_repair -> validate` cyclic loop로 반복한다
- validator의 structured result가 runtime loop control을 담당한다
- builder가 실제 prior validation feedback를 읽고 같은 candidate를 개선한다
- score가 threshold 이상에 도달하면 archive로 종료하고, 아니면 back-edge로 재진입한다
- archive note로 convergence trajectory를 재사용 가능하게 남긴다

## 입력

- `input/brief.md`
- `input/rubric.md`

## 출력

- `output/final/01-current.md`
- `output/final/02-validation.md`
- `output/archive/40-feedback-convergence-note.md`
- `output/iterations/30-validation-history.md`
- `output/iterations/results/longrun-feedback-convergence-loop-*.json`
- `output/iterations/logs/run.log`
- `output/iterations/logs/run.tail.log`

## 실행

```bash
# existing outputs 검증
sandbox/20-longrun-feedback-convergence-loop/verify.sh

# sandbox 재실행
sandbox/20-longrun-feedback-convergence-loop/run.sh

# output을 비우고 재실행 후 바로 검증
sandbox/20-longrun-feedback-convergence-loop/verify.sh --fresh
```

## 성공 기준

- workflow가 `completed`로 끝난다
- watchdog wrapper를 통해 실행된다
- `build_or_repair`와 `validate`가 로그에서 반복 실행된 뒤 archive로 닫힌다
- current candidate는 고정된 5개 top-level section을 유지한다
- latest validation report는 고정된 heading 구조와 정수 `/10` score를 가진다
- validation history가 반복 실행의 score trajectory를 보존하며 non-regression을 보여준다
- final validation state가 `PASS`이고 score가 `>= 9/10`이다
- archive note가 runtime-native cyclic loop와 실제 convergence trajectory를 안정적인 heading 구조로 보존한다

## 워크플로우 그래프 (ASCII)

```text
+-------------------+
| run-with-watchdog |
+-------------------+
          |
          v
 +-----------------+
 | build_or_repair |
 +-----------------+
          |
          v
   +---------------+
   | validate      |
   | score: N/10   |
   | verdict: ?    |
   +---------------+
      |         |
      | FAIL    | PASS (>= 9/10)
      |         |
      v         v
+-----------------+   +---------------------+
| on_fail.goto    |   | archive-convergence |
| build_or_repair |   +---------------------+
+-----------------+
          |
          +------ feedback from latest validation ------+
                                                         |
                                                         v
                                                  +-----------------+
                                                  | build_or_repair |
                                                  +-----------------+

loop invariant:
  validate emits structured results for runtime control
  build_or_repair consumes actual latest validation feedback
  repeat until threshold reached or runtime stop guard triggers
```
