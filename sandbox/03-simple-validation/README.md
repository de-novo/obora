# 03 Simple Validation Sandbox

> 상태: **active / canonical step 03**
>
> 이 sandbox는 생성(draft) 이후 검증(validation)을 별도 step으로 수행하는 가장 작은 validation workflow 기준점입니다.

## 목적
- brief 1개를 읽고 초안 문서를 만든다
- validator가 초안을 체크리스트 기준으로 검증한다
- validation 결과 문서를 남긴다

## 입력
- `input/brief.md`

## 출력
- `output/final/01-draft.md`
- `output/final/02-validation.md`

## 실행
```bash
node bin/obora.js run \
  sandbox/03-simple-validation/workflows/00-draft-validate.yaml \
  --config sandbox/03-simple-validation/obora.config.yaml \
  --agents sandbox/03-simple-validation/agents.yaml \
  --output-dir sandbox/03-simple-validation/output/iterations/results \
  --verbose --no-color
```

또는
```bash
sandbox/03-simple-validation/run.sh
```

## 성공 기준
- workflow가 `completed`로 끝난다
- `01-draft.md`와 `02-validation.md`가 생성된다
- `02-validation.md` 안에 아래 섹션이 있다
  - Verdict
  - Passed Checks
  - Failed Checks
  - Next Action


## 워크플로우 그래프 (ASCII)

```text
+-------+
| input |
+-------+
    |
    v
+-------+
| draft |
+-------+
    |
    v
+------------+
| validation |
+------------+
    |
    v
+-------------------+
| validation report |
+-------------------+
```
