# 06 Project Mini Sandbox

> 상태: **active / canonical step 06**
>
> 이 sandbox는 draft → review → final → validation → archive를 한 번에 수행하는 가장 작은 project lifecycle 기준점입니다.

## 목적
- brief를 바탕으로 project-style 초안을 만든다
- review를 통해 개선 포인트를 정리한다
- 개선된 final 문서를 만든다
- final을 validation으로 확인한다
- 결과를 archive note로 보존한다

## 입력
- `input/brief.md`

## 출력
- `output/final/01-draft.md`
- `output/final/02-review.md`
- `output/final/03-final.md`
- `output/final/04-validation.md`
- `output/archive/40-project-archive-note.md`

## 실행
```bash
node bin/obora.js run \
  sandbox/06-project-mini/workflows/00-project-mini.yaml \
  --config sandbox/06-project-mini/obora.config.yaml \
  --agents sandbox/06-project-mini/agents.yaml \
  --output-dir sandbox/06-project-mini/output/iterations/results \
  --verbose --no-color
```

또는
```bash
sandbox/06-project-mini/run.sh
```

## 성공 기준
- workflow가 `completed`로 끝난다
- 위 5개 문서가 모두 생성된다
- validation 문서에 Verdict / Passed Checks / Failed Checks / Next Action이 있다
- archive 문서에 Summary of Project / Why Archived / Reuse Notes가 있다


## 워크플로우 그래프 (ASCII)

```text
+-------+
| brief |
+-------+
    |
    v
+-------+
| draft |
+-------+
    |
    v
+--------+
| review |
+--------+
    |
    v
+-------+
| final |
+-------+
    |
    v
+------------+
| validation |
+------------+
    |
    v
+---------+
| archive |
+---------+
```
