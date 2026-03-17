# 15 Longrun Project Loop Sandbox

> 상태: **active / canonical step 15**
>
> 이 sandbox는 long-running runner 위에서 `build_or_repair -> review_project -> validate_project`가 validator 결과로 실제 재진입하는 canonical honest project loop입니다.

## 목적

- long-running runner(watchdog + large safety ceiling)를 사용한다
- project draft를 만든다
- review를 통해 현재 candidate의 상태를 기록한다
- FAIL이면 runtime이 `build_or_repair`로 되돌아가 최신 validation feedback으로 수정한다
- PASS 뒤에만 archive를 남긴다

## 입력

- `input/brief.md`

## 출력

- `output/final/01-draft.md`
- `output/final/02-review.md`
- `output/final/03-validation.md`
- `output/final/04-repaired.md`
- `output/final/05-final-validation.md`
- `output/archive/40-longrun-project-loop-note.md`
- `output/iterations/logs/run.log`
- `output/iterations/logs/run.tail.log`

## 실행

```bash
# existing outputs 검증
sandbox/15-longrun-project-loop/verify.sh

# sandbox 재실행
sandbox/15-longrun-project-loop/run.sh

# output을 비우고 재실행 후 바로 검증
sandbox/15-longrun-project-loop/verify.sh --fresh
```

## 성공 기준

- workflow가 `completed`로 끝난다
- watchdog wrapper를 통해 실행된다
- `build_or_repair`, `review_project`, `validate_project`가 실제로 두 번 이상 실행된다
- 첫 validation은 FAIL이다
- 최종 validation은 PASS다
- archive note가 생성된다

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
