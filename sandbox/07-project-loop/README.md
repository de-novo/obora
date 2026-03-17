# 07 Project Loop Sandbox

> 상태: **active / canonical step 07**
>
> 이 sandbox는 advisory review를 유지하되, `build_or_repair -> review_project -> validate_project`가 실제 runtime back-edge로 다시 들어가는 가장 작은 honest project loop 기준점입니다.

## 목적

- project draft를 만든다
- review를 통해 현재 candidate의 상태를 기록한다
- `validate_project` 결과가 FAIL이면 runtime이 `build_or_repair`로 되돌린다
- validator가 PASS를 낸 뒤에만 archive를 남긴다

## 입력

- `input/brief.md`

## 출력

- `output/final/01-draft.md`
- `output/final/02-review.md`
- `output/final/03-validation.md`
- `output/final/04-repaired.md`
- `output/final/05-final-validation.md`
- `output/archive/40-project-loop-archive-note.md`
- `output/iterations/logs/run.log`
- `output/iterations/logs/run.tail.log`

## 실행

```bash
node bin/obora.js run \
  sandbox/07-project-loop/workflows/00-project-loop.yaml \
  --config sandbox/07-project-loop/obora.config.yaml \
  --agents sandbox/07-project-loop/agents.yaml \
  --output-dir sandbox/07-project-loop/output/iterations/results \
  --verbose --no-color
```

또는

```bash
sandbox/07-project-loop/run.sh

# output을 비우고 재실행 후 바로 검증
sandbox/07-project-loop/verify.sh --fresh
```

## 성공 기준

- workflow가 `completed`로 끝난다
- `build_or_repair`, `review_project`, `validate_project`가 실제로 두 번 이상 실행된다
- 첫 validation은 FAIL이고 runtime back-edge가 발생한다
- 최종 validation은 PASS다
- archive 문서가 생성된다

## 워크플로우 그래프 (ASCII)

```text
+-------+
| brief |
+-------+
    |
    v
+-----------------+
| build_or_repair |
+-----------------+
    |
    v
+----------------+
| review_project |
+----------------+
    |
    v
+------------------+
| validate_project |
+------------------+
    | FAIL                  PASS
    |                       |
    +------ back-edge ------+
    |
    v
+----------------+
| archive_project |
+----------------+
```
