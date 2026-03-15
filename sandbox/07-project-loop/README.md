# 07 Project Loop Sandbox

> 상태: **active / canonical step 07**
>
> 이 sandbox는 project draft를 만들고, validation 실패를 한 번 수정한 뒤, 최종 validation과 archive까지 마치는 가장 작은 project loop 기준점입니다.

## 목적
- project draft를 만든다
- review를 통해 개선 포인트를 정리한다
- validation이 실패하면 repair를 수행한다
- 최종 validation을 통과한 결과를 archive로 남긴다

## 입력
- `input/brief.md`

## 출력
- `output/final/01-draft.md`
- `output/final/02-review.md`
- `output/final/03-validation.md`
- `output/final/04-repaired.md`
- `output/final/05-final-validation.md`
- `output/archive/40-project-loop-archive-note.md`

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
```

## 성공 기준
- workflow가 `completed`로 끝난다
- 첫 validation은 실패한다
- repair step이 실행된다
- 최종 validation은 PASS다
- archive 문서가 생성된다
