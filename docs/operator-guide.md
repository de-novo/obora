# Obora Operator Guide

Updated: 2026-04-21

이 문서는 현재 Obora를 "운영자 관점"에서 빠르게 쓰기 위한 짧은 가이드입니다.
상세 기능 인벤토리는 `docs/current-capabilities.md`, 지원/비지원 범위 구분은 `docs/support-scope.md`, deferred 판단 기준은 `docs/deferred-surface-revival-criteria.md`를 참고하고, 이 문서는 실제 운영 흐름만 남깁니다.

---

## 1. 가장 먼저 쓰는 흐름

새 프로젝트를 바로 실행 가능한 상태까지 가져가는 최소 경로:

```bash
obora quickstart my-project
cd my-project
obora doctor
obora validate judge.yaml
obora judge --dry-run
obora judge
```

각 명령의 역할:

- `quickstart`
  - 최소 judge-mode 프로젝트 생성
- `doctor`
  - config/auth/provider/model readiness 확인
- `validate judge.yaml`
  - one-file workflow shape/field 검증
- `expand --json -- judge.yaml`
  - judge 파일을 직접 바꿨을 때 expanded workflow를 더 깊게 확인하는 optional inspection
- `judge --dry-run`
  - 실행 직전 preview
- `judge`
  - 실제 실행

---

## 2. 실무에서 자주 쓰는 명령 묶음

### 2.1 준비 상태 확인

```bash
obora doctor
obora doctor --json
obora --json doctor
obora models gpt-5.4
obora models openai
obora auth list
obora --json auth test openai
obora agents show reviewer
obora agents set reviewer --model gpt-5.4 --dry-run
```

언제 쓰나:

- 왜 실행이 안 되는지 볼 때
- 자동화/스크립트에서 machine-readable doctor payload가 필요할 때
- 어떤 provider/model ref를 써야 하는지 확인할 때
- 저장된 auth 상태를 확인할 때
- 특정 agent만 config layer에서 바꿔야 할 때

`doctor`에서 바로 보는 것:

- `Ready: ...`, `Needs auth: ...`, `Needs provider alignment: ...` 같은 현재 readiness 상태
- `judge.yaml`이 있으면 `validate judge.yaml -> judge --dry-run -> judge` 순서의 next action
- `judge.yaml`이 없으면 `run <workflow.yaml> --dry-run -> run <workflow.yaml>` 같은 generic next action
- local `obora doctor --json`과 root `obora --json doctor` 둘 다 같은 계약으로 지원되는 JSON payload
- named agent override가 있으면 `obora agents list`, `obora agents show <name>`, `obora agents reset <name> --dry-run`까지 이어지는 operator triage 힌트

### 2.1b agent override preview / apply

```bash
obora agents list
obora agents show reviewer
obora agents set reviewer --model gpt-5.4 --dry-run
obora agents set reviewer --model gpt-5.4
obora agents reset reviewer --dry-run
```

언제 쓰나:

- reviewer / critic 같은 특정 agent만 빠르게 바꿔야 할 때
- 변경 전후 diff와 changed keys를 먼저 보고 싶을 때
- drifted agent가 여러 개일 때도 doctor가 더 높은 severity drift를 먼저 골라 reset preview를 최대 2개까지 바로 제안하길 기대할 때
- provider/model뿐 아니라 agent-level `temperature` drift도 doctor warning에서 바로 확인하고 싶을 때
- drift가 있는 경우 `obora agents show <name>`가 그 drifted agent를 바로 가리키길 기대할 때
- provider/model drift와 temperature drift가 섞여 있으면 doctor가 더 중요한 drift부터 먼저 보여주길 기대할 때
- project/global `.obora/config.yaml`만 건드리고 싶을 때

주의:

- 이 명령은 config-layer override만 다룹니다.
- `agentsPath`, workflow-local `agents`, runtime registration은 mutation 대상이 아닙니다.
- model-only / provider-only partial override는 같은 target config layer에 sibling field가 이미 있을 때만 허용됩니다.

### 2.2 workflow 파일 점검

```bash
obora validate workflow.yaml
obora expand --json -- workflow.yaml
obora --json expand workflow.yaml
obora --json run workflow.yaml --dry-run --dump-expanded-workflow --show-stop-semantics
```

언제 쓰나:

- 파일 구조가 맞는지 먼저 보고 싶을 때
- one-file workflow가 내부적으로 어떻게 확장되는지 확인할 때
- 실행 직전 resolved preview를 보고 싶을 때

### 2.3 실제 실행

```bash
obora run workflow.yaml
obora judge
obora test workflow.yaml
obora chat release-readiness --session release-qa --tags release,qa
obora chat release-readiness --session release-qa --once "prepare release notes"
```

언제 쓰나:

- 일반 workflow 실행
- judge-mode 짧은 평가 실행
- workflow test surface 실행
- 같은 세션에서 여러 operator request를 채팅으로 실행하고 workflow 결과를 누적할 때

---

## 3. 운영 중 보는 명령

### 3.1 전체 상태 보기

```bash
obora status
obora status --workflow repair-workflow --limit 10 --json
obora --json status --workflow judge
```

보는 것:

- persisted runs 요약
- 최근 실행 상태
- linked DLQ indicator를 포함한 latest/recent run overview
- DLQ 요약
- local `obora status --json`과 root `obora --json status` 둘 다 같은 operator payload 계약으로 지원되는지

### 3.2 실행 이력 보기

```bash
obora runs list
obora runs list --status failed --repair-loop critical --json
obora --json runs list --workflow judge
obora inspect <runId>
obora --json inspect <runId>
obora chat --list-sessions --filter-tag release
obora chat --list-sessions --project /path/to/project --filter-project current
obora chat --list-sessions --filter-tag release --export-sessions artifacts/release-sessions.json
obora chat --show-session --session release-qa
obora chat --show-session --session release-qa --save-session artifacts/session.md
obora chat --list-runs --filter-tag release --filter-run-status completed --json
obora chat --list-runs --project /path/to/project --filter-project current --json
obora chat --show-run <executionId> --session release-qa
obora chat --show-run <executionId> --save-diff artifacts/run.diff.md
obora chat --show-run <executionId> --save-audit artifacts/run.audit.md
obora chat --session release-qa --once "/retry <executionId>"
```

보는 것:

- 최근 실행 목록
- 실패/중단 실행 필터
- repair-loop / triageCause / linked DLQ 기준으로 정렬·필터된 operator view
- `inspect`를 top-level alias로 바로 써서 특정 실행 상세 조회
- local/root `--json`으로 같은 persisted-run inspection contract를 자동화에 연결
- chat session 목록에서 project/workflow/retry/last task/tags/message count/updated time 확인
- tag/project 필터가 적용된 chat session JSON bundle을 export해 재사용 가능한 세션을 백업·이관
- `chat --show-session --session <id>` 기본 텍스트 출력으로 project, selected workflow, provider/model, retry target, retry command/options, 최근 메시지 확인
- chat session에 저장된 workflow run 목록, saved message/workflow target/source project/retry workflow/run options, step별 output/tools/artifacts/decisions/dependencies/issues 상세
- TUI 안에서는 `/runs`로 chat run 목록을 열고, `Tab`/`Shift+Tab`으로 선택을 이동하고, `Enter` 또는 `/details 1`로 번호 기반 상세를 확인하고, 변경 파일이 기록된 실행에서는 `/diff open` 또는 `/diff all`로 diff preview를 채팅 메시지에 펼치거나 `/diff save`, `/diff save <path>`로 파일에 저장하며, `Ctrl+R` 또는 `/retry 1`로 저장된 task를 재실행
- dry-run chat도 `last result completed 0/0`과 `/details dry-run-...` 링크를 남기므로, 실제 실행 전 검증 결과도 같은 세션 감사 흐름으로 확인
- 저장된 chat task를 source project와 saved provider/model/config/agents/policy/timeout 옵션을 우선 사용해 재실행하는 retry 경로

### 3.3 중단 실행 이어서 처리

```bash
obora resume <runId>
```

언제 쓰나:

- suspended run을 재개할 때

### 3.4 DLQ 처리

```bash
obora dlq list
obora dlq inspect <entryId>
obora dlq summary
obora dlq resolve <entryId> --status reviewed --actor cto --note "checked"
```

언제 쓰나:

- unrecoverable failure를 triage할 때
- 수동 검토 완료 상태를 기록할 때

### 3.5 artifact / audit 확인

```bash
obora inspect <runId>
obora artifact get <runId> <stepName> <name> --output ./artifact.out
obora audit replay <runId>
obora audit tail --execution <runId>
```

언제 쓰나:

- 결과 산출물 파일을 확인/다운로드할 때
- 실행 timeline, event, step 흐름을 볼 때

---

## 4. 운영자 기준 추천 순서

문제가 생겼을 때는 아래 순서가 가장 안전합니다.

### A. 실행 전 문제

```bash
obora doctor
obora validate workflow.yaml
obora run workflow.yaml --dry-run
```

### B. 실행 후 상태 확인

```bash
obora status
obora runs list
obora inspect <runId>
```

### C. 실패 triage

```bash
obora dlq list
obora dlq inspect <entryId>
obora audit replay <runId>
```

### D. 중단 실행 재개

```bash
obora resume <runId>
```

---

## 5. 지금 live가 아닌 것

아래는 현재 top-level live operator command로 보지 않습니다.

- `obora new`
- `obora done`
- `obora skills`
- `obora dashboard`

의미:

- 문서/코드 흔적이 있어도 현재 운영 명령으로 간주하지 않음
- `dashboard`는 package capability는 있으나 live CLI surface는 아님
- `agents`는 이제 `list/show/set/reset`이 live이고, execution-only source와 config-layer override를 분리해서 다룸

관련 문서:

- `docs/current-capabilities.md`
- `docs/support-scope.md`
- `docs/deferred-surface-revival-criteria.md`
- `docs/legacy-cli-surface-audit.md` (historical audit baseline, not a live operator surface)

---

## 6. 운영자용 짧은 치트시트

### 프로젝트 시작

```bash
obora quickstart demo
cd demo
obora doctor
obora validate judge.yaml
obora judge --dry-run
obora judge
```

### 일반 workflow 점검/실행

```bash
obora validate workflow.yaml
obora expand --json -- workflow.yaml
obora --json expand workflow.yaml
obora run workflow.yaml --dry-run
obora run workflow.yaml
```

### 운영 확인

```bash
obora status
obora runs list
obora inspect <runId>
obora dlq list
obora audit replay <runId>
```

### 복구/후처리

```bash
obora resume <runId>
obora inspect <runId>
obora artifact get <runId> <stepName> <name> --output ./artifact.out
obora dlq resolve <entryId> --status reviewed --actor cto --note "checked"
```
