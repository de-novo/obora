# 08 Benchmark Mini Sandbox

> 상태: **active / canonical step 08**
>
> 이 sandbox는 solver가 문제만 보고 답안을 만들고, judge가 reference answer와 비교해 채점하는 가장 작은 benchmark workflow 기준점입니다.

## 목적
- solver와 judge 역할을 분리한다
- solver는 문제만 보고 attempt를 만든다
- judge는 reference answer와 attempt를 비교해 verdict를 만든다
- benchmark 결과를 archive note로 남긴다

## 입력
- `input/problem.md`
- `input/reference-answer.md`

## 출력
- `output/final/01-attempt.md`
- `output/final/02-verdict.md`
- `output/archive/40-benchmark-archive-note.md`

## 실행
```bash
node bin/obora.js run \
  sandbox/08-benchmark-mini/workflows/00-benchmark-mini.yaml \
  --config sandbox/08-benchmark-mini/obora.config.yaml \
  --agents sandbox/08-benchmark-mini/agents.yaml \
  --output-dir sandbox/08-benchmark-mini/output/iterations/results \
  --verbose --no-color
```

또는
```bash
sandbox/08-benchmark-mini/run.sh
```

## 성공 기준
- workflow가 `completed`로 끝난다
- `01-attempt.md`, `02-verdict.md`, `40-benchmark-archive-note.md`가 생성된다
- `02-verdict.md` 안에 Verdict / Score / Correctness / Feedback 섹션이 있다
