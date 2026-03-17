# 18 Longrun Paper Verification Mini Sandbox

> 상태: **active / canonical step 18**
>
> 이 sandbox는 vendored real-paper fixture를 바탕으로 공개 논문의 claim을 작은 범위에서 검증하는 첫 canonical example입니다. long-running runner(watchdog + large safety ceiling) 위에서 paper claim verification report와 archive note를 생성합니다.

## 목적

- long-running runner(watchdog + large safety ceiling)를 사용한다
- 공개 논문 fixture를 live fetch 없이 sandbox-local input으로 고정한다
- 제공된 paper excerpts만 근거로 claim verification report를 만든다
- claim별로 `SUPPORTED`, `PARTIAL`, `UNSUPPORTED`를 명시한다
- 최종 verification 결과를 archive note로 남긴다

## 입력

- `input/paper-metadata.md`
- `input/paper-excerpts.md`
- `input/claims.md`

## 출력

- `output/final/01-paper-verification.md`
- `output/archive/40-paper-verification-note.md`
- `output/iterations/results/longrun-paper-verification-mini-*.json`
- `output/iterations/logs/run.log`
- `output/iterations/logs/run.tail.log`

## 실행

```bash
# existing outputs 검증
sandbox/18-longrun-paper-verification-mini/verify.sh

# sandbox 재실행
sandbox/18-longrun-paper-verification-mini/run.sh

# output을 비우고 재실행 후 바로 검증
sandbox/18-longrun-paper-verification-mini/verify.sh --fresh
```

## 성공 기준

- workflow가 `completed`로 끝난다
- watchdog wrapper를 통해 실행된다
- verification report가 요구된 5개 top-level section을 모두 포함한다
- 각 claim이 `SUPPORTED`, `PARTIAL`, `UNSUPPORTED` 중 하나로 판정된다
- archive note가 요구된 3개 top-level section을 모두 포함한다
- 결과는 제공된 vendored paper fixture만을 근거로 서술된다


## 워크플로우 그래프 (ASCII)

```text
+-------------------+
| run-with-watchdog |
+-------------------+
    |
    v
+----------------+
| paper metadata |
| + excerpts     |
| + claims       |
+----------------+
    |
    v
+--------------------+
| paper verification |
| report             |
+--------------------+
    |
    v
+---------+
| archive |
+---------+
```
