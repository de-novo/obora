# 10 Longrun Mini Sandbox

> 상태: **active / canonical step 10**
>
> 이 sandbox는 long-running workflow를 위한 runner 계약( idle watchdog + large safety ceiling )을 검증하는 가장 작은 canonical sandbox입니다.

## 목적
- multi-step longrun 스타일 workflow를 실행한다
- native Obora run을 watchdog wrapper로 감싼다
- 진행이 있으면 계속 가고, 오래 idle일 때만 중단되는 runner 구조를 확인한다

## 입력
- `input/brief.md`

## 출력
- `output/final/01-plan.md`
- `output/final/02-refined-plan.md`
- `output/archive/40-longrun-note.md`
- `output/iterations/logs/run.log`
- `output/iterations/logs/run.tail.log`

## 실행
```bash
sandbox/10-longrun-mini/run.sh
```

## 성공 기준
- workflow가 `completed`로 끝난다
- watchdog wrapper를 통해 실행된다
- final + archive 문서가 생성된다
- `output/iterations/logs/run.log`와 `run.tail.log`가 남는다


## 워크플로우 그래프 (ASCII)

```text
+-------------------+
| run-with-watchdog |
+-------------------+
    |
    v
+------+
| plan |
+------+
    |
    v
+--------+
| refine |
+--------+
    |
    v
+---------+
| archive |
+---------+
```
