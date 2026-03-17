# 20 Longrun Feedback Convergence Loop Sandbox

> 상태: **active / canonical step 20**
>
> 이 sandbox는 step 19의 one-shot remediation loop를 넘어, 같은 과제를 여러 번 평가하고 피드백을 반영하며 임계치에 수렴할 때까지 개선하는 첫 canonical convergence loop 기준점입니다.

## 목적

- long-running runner(watchdog + large safety ceiling)를 사용한다
- 작은 구조화 writing task를 평가-수정-재평가 루프로 반복한다
- 최소 4개의 candidate와 4개의 evaluation point를 생성한다
- evaluation score가 단조 증가하며 최종 threshold 이상에 도달한다
- archive note로 convergence trajectory를 재사용 가능하게 남긴다

## 입력

- `input/brief.md`
- `input/rubric.md`

## 출력

- `output/final/01-v1.md`
- `output/final/02-eval-v1.md`
- `output/final/03-v2.md`
- `output/final/04-eval-v2.md`
- `output/final/05-v3.md`
- `output/final/06-eval-v3.md`
- `output/final/07-v4.md`
- `output/final/08-eval-v4.md`
- `output/archive/40-feedback-convergence-note.md`
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
- candidate 4개와 evaluation 4개가 모두 생성된다
- 각 candidate는 고정된 5개 top-level section을 유지한다
- 각 evaluation은 고정된 4개 top-level section을 유지한다
- evaluation score가 정수 `/10` 형식으로 기록되고 단조 증가한다
- final evaluation score가 `>= 9/10`에 도달한다
- archive note가 convergence trajectory와 재사용 포인트를 안정적인 heading 구조로 보존한다

## 워크플로우 그래프 (ASCII)

```text
+-------------------+
| run-with-watchdog |
+-------------------+
    |
    v
+------------+     +-------------+
| produce v1 | --> | evaluate v1 |
+------------+     +-------------+
                         |
                         v
                    +-----------+
                    | revise v2 |
                    +-----------+
                         |
                         v
                    +-------------+
                    | evaluate v2 |
                    +-------------+
                         |
                         v
                    +-----------+
                    | revise v3 |
                    +-----------+
                         |
                         v
                    +-------------+
                    | evaluate v3 |
                    +-------------+
                         |
                         v
                    +-----------+
                    | revise v4 |
                    +-----------+
                         |
                         v
                    +-------------+
                    | evaluate v4 |
                    +-------------+
                         |
                         v
                    +---------+
                    | archive |
                    +---------+
```
