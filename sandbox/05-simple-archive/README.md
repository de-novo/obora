# 05 Simple Archive Sandbox

> 상태: **active / canonical step 05**
>
> 이 sandbox는 완료된 결과를 archive 문서로 묶는 가장 작은 archive workflow 기준점입니다.

## 목적
- brief를 읽고 결과 문서를 만든다
- archive step이 결과를 요약/정리한 archive 문서를 만든다
- final output과 archive output을 분리해 본다

## 입력
- `input/brief.md`

## 출력
- `output/final/01-summary.md`
- `output/archive/40-archive-note.md`

## 실행
```bash
node bin/obora.js run \
  sandbox/05-simple-archive/workflows/00-summary-archive.yaml \
  --config sandbox/05-simple-archive/obora.config.yaml \
  --agents sandbox/05-simple-archive/agents.yaml \
  --output-dir sandbox/05-simple-archive/output/iterations/results \
  --verbose --no-color
```

또는
```bash
sandbox/05-simple-archive/run.sh
```

## 성공 기준
- workflow가 `completed`로 끝난다
- `01-summary.md`가 생성된다
- `40-archive-note.md`가 생성된다
- archive 문서 안에 Summary of Result / Why Archived / Reuse Notes 가 존재한다
