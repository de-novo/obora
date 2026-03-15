# 09 Benchmark Loop Sandbox

> 상태: **active / canonical step 09**
>
> 이 sandbox는 benchmark attempt가 처음엔 실패하고, judge feedback을 반영해 repair한 뒤 최종 PASS로 끝나는 가장 작은 benchmark loop 기준점입니다.

## 목적
- solver가 첫 시도(attempt)를 만든다
- judge가 reference answer와 비교해 FAIL verdict를 만든다
- repair step이 attempt를 수정한다
- judge가 repaired attempt를 다시 채점해 PASS를 만든다
- 최종 결과를 archive note로 보존한다

## 입력
- `input/problem.md`
- `input/reference-answer.md`

## 출력
- `output/final/01-attempt.md`
- `output/final/02-verdict.md`
- `output/final/03-repaired-attempt.md`
- `output/final/04-final-verdict.md`
- `output/archive/40-benchmark-loop-archive-note.md`

## 실행
```bash
node bin/obora.js run \
  sandbox/09-benchmark-loop/workflows/00-benchmark-loop.yaml \
  --config sandbox/09-benchmark-loop/obora.config.yaml \
  --agents sandbox/09-benchmark-loop/agents.yaml \
  --output-dir sandbox/09-benchmark-loop/output/iterations/results \
  --verbose --no-color
```

또는
```bash
sandbox/09-benchmark-loop/run.sh
```

## 성공 기준
- workflow가 `completed`로 끝난다
- 첫 verdict는 FAIL이다
- repaired attempt가 생성된다
- 최종 verdict는 PASS다
- archive note가 생성된다
