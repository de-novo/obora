# Active Sandboxes

이 디렉터리에는 현재 **활성 canonical sandbox만** 둔다.

빠른 workflow 흐름 요약은 `docs/operations/canonical-sandbox-ascii-flows.md`를 참고한다.

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
- `12-longrun-benchmark-mini` — long-running runner + benchmark mini contract
- `13-longrun-benchmark-loop` — long-running runner + benchmark remediation loop contract
- `14-longrun-project-mini` — long-running runner + project mini lifecycle contract
- `15-longrun-project-loop` — long-running runner + project remediation loop contract
- `16-multi-run-comparison-mini` — multi-run comparison with normalized per-run results (solve×3 → compare → archive)
- `17-multi-run-comparison-loop` — multi-run comparison remediation loop (solve×3 → compare → validate → repair → re-compare → archive)
- `18-longrun-paper-verification-mini` — long-running paper claim verification against vendored real-paper excerpts (verify → archive)
- `19-longrun-paper-verification-loop` — long-running paper verification remediation loop against the same vendored real-paper fixture (verify → validate → repair → re-validate → archive)
- `20-longrun-feedback-convergence-loop` — long-running feedback convergence loop with a runtime-native `build_or_repair -> validate -> on_fail.goto build_or_repair` cycle until a threshold is reached

## Draft / future sandbox

- `canonical-simple` — 초기 기준 초안 메모용 폴더

## 원칙

- 기존 레거시 sandbox는 여기서 관리하지 않는다.
- 레거시 sandbox는 `archive/legacy-sandboxes/`에 분리 보관한다.
- 새로운 sandbox는 가장 작은 native workflow부터 시작해 점진적으로 확장한다.
- active sandbox는 `docs/operations/canonical-sandbox-spec.md` 규격을 따른다.
