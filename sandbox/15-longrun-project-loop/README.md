# 15 Longrun Project Loop Sandbox

> 상태: **active / canonical step 15**
>
> 이 sandbox는 long-running runner 위에서 project draft가 처음엔 validation에 실패하고, repair를 거쳐 최종 PASS와 archive까지 닫히는 canonical sandbox입니다.

## 목적
- long-running runner(watchdog + large safety ceiling)를 사용한다
- project draft를 만든다
- review를 통해 개선 포인트를 정리한다
- 첫 validation이 실패하면 repair를 수행한다
- 최종 validation을 통과한 결과를 archive로 남긴다

## 입력
- `input/brief.md`

## 출력
- `output/final/01-draft.md`
- `output/final/02-review.md`
- `output/final/03-validation.md`
- `output/final/04-repaired.md`
- `output/final/05-final-validation.md`
- `output/archive/40-longrun-project-loop-note.md`
- `output/iterations/logs/run.log`
- `output/iterations/logs/run.tail.log`

## 실행
```bash
# existing outputs 검증
sandbox/15-longrun-project-loop/verify.sh

# sandbox 재실행
sandbox/15-longrun-project-loop/run.sh

# output을 비우고 재실행 후 바로 검증
sandbox/15-longrun-project-loop/verify.sh --fresh
```

## 성공 기준
- workflow가 `completed`로 끝난다
- watchdog wrapper를 통해 실행된다
- 첫 validation은 FAIL이다
- repair step이 실행된다
- 최종 validation은 PASS다
- archive note가 생성된다
