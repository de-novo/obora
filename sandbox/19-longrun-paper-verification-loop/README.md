# 19 Longrun Paper Verification Loop Sandbox

> 상태: **active / canonical step 19**
>
> 이 sandbox는 step 18의 minimal real-paper claim verification 패턴을 확장해, 같은 vendored LoRA fixture만으로 초기 불충분 보고서를 검증하고 remediation한 뒤 최종 PASS까지 닫는 canonical long-running verification loop 기준점입니다.

## 목적

- long-running runner(watchdog + large safety ceiling)를 사용한다
- step 18과 같은 vendored real-paper fixture만 사용한다
- 초기 verification report를 의도적으로 불충분하게 작성해 validation FAIL을 만든다
- 같은 fixture만으로 verification report를 repair한다
- 최종 validation PASS와 archive note까지 생성한다

## 입력

- `input/paper-metadata.md`
- `input/paper-excerpts.md`
- `input/claims.md`

## 출력

- `output/final/01-paper-verification.md`
- `output/final/02-paper-validation.md`
- `output/final/03-repaired-paper-verification.md`
- `output/final/04-final-paper-validation.md`
- `output/archive/40-paper-verification-loop-note.md`
- `output/iterations/results/longrun-paper-verification-loop-*.json`
- `output/iterations/logs/run.log`
- `output/iterations/logs/run.tail.log`

## 실행

```bash
# existing outputs 검증
sandbox/19-longrun-paper-verification-loop/verify.sh

# sandbox 재실행
sandbox/19-longrun-paper-verification-loop/run.sh

# output을 비우고 재실행 후 바로 검증
sandbox/19-longrun-paper-verification-loop/verify.sh --fresh
```

## 성공 기준

- workflow가 `completed`로 끝난다
- watchdog wrapper를 통해 실행된다
- 초기 verification report가 요구된 5개 top-level section을 모두 포함한다
- 초기 validation report가 요구된 4개 top-level section을 포함하고 `FAIL`을 명시한다
- repaired verification report가 모든 claim의 evidence coverage를 보강한다
- final validation report가 `PASS`를 명시한다
- archive note가 요구된 3개 top-level section을 모두 포함한다
- 결과는 sandbox-local vendored paper fixture만을 근거로 서술된다
