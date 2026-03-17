# 01 Simple Native Sandbox

> 상태: **active / canonical step 01**
>
> 이 sandbox는 Obora의 가장 작은 native workflow 기준점입니다.

## 목적
- input 1개를 읽는다
- agent 1명이 요약 문서 1개를 만든다
- 실행 성공 여부를 가장 단순하게 검증한다

## 입력
- `input/brief.md`

## 출력
- `output/final/01-summary.md`

## 실행
```bash
node bin/obora.js run \
  sandbox/01-simple-native/workflows/00-brief-to-summary.yaml \
  --config sandbox/01-simple-native/obora.config.yaml \
  --agents sandbox/01-simple-native/agents.yaml \
  --output-dir sandbox/01-simple-native/output/iterations/results \
  --verbose --no-color
```

## 성공 기준
- workflow가 `completed`로 끝난다
- `output/final/01-summary.md`가 생성된다
- 문서 안에 아래 4개 섹션이 존재한다
  - Summary
  - Key Points
  - Uncertainties
  - Next Action


## 워크플로우 그래프 (ASCII)

```text
+-------+
| input |
+-------+
    |
    v
+-------------+
| native step |
+-------------+
    |
    v
+--------+
| output |
+--------+
```
