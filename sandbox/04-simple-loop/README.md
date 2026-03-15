# 04 Simple Loop Sandbox

> 상태: **active / canonical step 04**
>
> 이 sandbox는 생성 → 검증 → 수정의 가장 작은 loop 패턴을 검증하는 native workflow 기준점입니다.

## 목적
- 초안을 만든다
- validator가 체크리스트로 검증한다
- 실패하면 repair step이 수정한다
- 다시 validation을 통과해 최종 완료된다

## 입력
- `input/brief.md`

## 출력
- `output/final/01-draft.md`
- `output/final/02-validation.json`
- `output/final/03-repaired.md`
- `output/final/04-final-validation.md`

## 실행
```bash
node bin/obora.js run \
  sandbox/04-simple-loop/workflows/00-draft-repair-loop.yaml \
  --config sandbox/04-simple-loop/obora.config.yaml \
  --agents sandbox/04-simple-loop/agents.yaml \
  --output-dir sandbox/04-simple-loop/output/iterations/results \
  --verbose --no-color
```

또는
```bash
sandbox/04-simple-loop/run.sh
```

## 성공 기준
- workflow가 `completed`로 끝난다
- validation step이 적어도 한 번 실패 후 repair를 거친다
- 최종 validation 결과가 PASS다
