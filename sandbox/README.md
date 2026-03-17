# Active Sandboxes

이 디렉터리에는 현재 **활성 canonical sandbox만** 둔다.

## Canonical ladder
- `01-simple-native` — single native step
- `02-simple-review` — draft → review handoff
- `03-simple-validation` — draft → validation report
- `04-simple-loop` — validation fail → repair → pass
- `05-simple-archive` — final → archive
- `06-project-mini` — small project lifecycle
- `07-project-loop` — project lifecycle + repair loop
- `08-benchmark-mini` — solve → judge → archive
- `09-benchmark-loop` — fail → repair → re-judge → archive
- `10-longrun-mini` — watchdog-wrapped long-running workflow
- `11-longrun-loop` — long-running runner + validation-repair loop contract

## Draft / future sandbox
- `canonical-simple` — 초기 기준 초안 메모용 폴더

## 원칙
- 기존 레거시 sandbox는 여기서 관리하지 않는다.
- 레거시 sandbox는 `archive/legacy-sandboxes/`에 분리 보관한다.
- 새로운 sandbox는 가장 작은 native workflow부터 시작해 점진적으로 확장한다.
- active sandbox는 `docs/operations/canonical-sandbox-spec.md` 규격을 따른다.
