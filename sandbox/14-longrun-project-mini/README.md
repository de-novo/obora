# 14 Longrun Project Mini Sandbox

> 상태: **active / canonical step 14**
>
> 이 sandbox는 long-running runner 위에서 draft → review → final → validation → archive를 수행하는 가장 작은 project lifecycle 기준점입니다.

## 목적
- long-running runner(watchdog + large safety ceiling)를 사용한다
- brief를 바탕으로 project-style 초안을 만든다
- review를 통해 개선 포인트를 정리한다
- 개선된 final 문서를 만든다
- final을 validation으로 확인한다
- 결과를 archive note로 보존한다

## 입력
- `input/brief.md`

## 출력
- `output/final/01-draft.md`
- `output/final/02-review.md`
- `output/final/03-final.md`
- `output/final/04-validation.md`
- `output/archive/40-longrun-project-note.md`
- `output/iterations/logs/run.log`
- `output/iterations/logs/run.tail.log`

## 실행
```bash
# existing outputs 검증
sandbox/14-longrun-project-mini/verify.sh

# sandbox 재실행
sandbox/14-longrun-project-mini/run.sh

# output을 비우고 재실행 후 바로 검증
sandbox/14-longrun-project-mini/verify.sh --fresh
```

## 성공 기준
- workflow가 `completed`로 끝난다
- watchdog wrapper를 통해 실행된다
- draft / review / final / validation / archive가 모두 생성된다
- validation 문서에 PASS verdict가 기록된다
- archive note가 생성된다
