# 02 Simple Review Sandbox

> 상태: **active / canonical step 02**
>
> 이 sandbox는 생성(draft)과 검토(review)를 분리한 가장 작은 2-step native workflow 기준점입니다.

## 목적
- brief 1개를 읽고 초안 문서를 만든다
- reviewer가 초안을 검토하고 개선된 최종본을 만든다
- multi-step handoff가 실제로 동작하는지 검증한다

## 입력
- `input/brief.md`

## 출력
- `output/final/01-draft.md`
- `output/final/02-review.md`
- `output/final/03-final.md`

## 실행
```bash
node bin/obora.js run \
  sandbox/02-simple-review/workflows/00-draft-review.yaml \
  --config sandbox/02-simple-review/obora.config.yaml \
  --agents sandbox/02-simple-review/agents.yaml \
  --output-dir sandbox/02-simple-review/output/iterations/results \
  --verbose --no-color
```

또는
```bash
sandbox/02-simple-review/run.sh
```

## 성공 기준
- workflow가 `completed`로 끝난다
- 위 3개 파일이 모두 생성된다
- `02-review.md` 안에 아래 섹션이 있다
  - Strengths
  - Issues
  - Suggested Revisions
- `03-final.md` 안에 아래 섹션이 있다
  - Final Summary
  - Key Points
  - Changes Applied
  - Next Action
