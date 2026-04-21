# Obora Dashboard CLI M4 Roadmap

> **For Hermes:** 이 문서는 `obora dashboard`를 지금 바로 복구하라는 뜻이 아니라, M4 시점에 modern live surface로 되살릴 때 따라야 할 구현 계획입니다. 구현 시 작은 배치로 나누고, `packages/cli`의 공통 계약(`handleCommandAction`, root/local `--json`, exit code, docs/tests`)을 우선 적용하세요.
>
> Historical note: 이 문서 작성 이후 old `_legacy/dashboard.ts`와 dormant `packages/cli/src/commands/dashboard.ts` 경로는 active CLI source에서 제거되었습니다. 따라서 아래 task는 "기존 shim 수정"이 아니라, 필요 시 modern dashboard command를 새로 추가하는 계획으로 읽어야 합니다.

**Goal:** `obora dashboard`를 단순 legacy launcher가 아니라, dashboard 패키지의 서버 부트스트랩과 CLI operator UX를 분리한 modern command surface로 재도입한다.

**Architecture:** historical `_legacy/dashboard.ts`는 `@obora/dashboard` 서버를 직접 띄우고 `open(...)`과 `process.exit(0)`까지 CLI wrapper 안에서 처리했습니다. M4에서는 dashboard package가 서버 lifecycle/bootstrap API를 제공하고, CLI는 그 API를 감싼 얇은 operator surface로만 남아야 합니다.

**Tech Stack:** `packages/cli`, `packages/dashboard`, Fastify server bootstrap, `open`, shared CLI error handling, docs/cli.md, Vitest

---

## Why this is deferred to M4

현재 판단 기준:

- `docs/m3-sdk-cli-design.md`에서 dashboard UI는 M3 비목표로 명시되어 있습니다.
- 같은 문서에서 `@obora/dashboard`는 M4 중심 패키지로 남겨둡니다.
- historical `_legacy/dashboard.ts`는 CLI contract보다 launcher 스크립트에 가까웠습니다.
- 따라서 지금은 live 등록보다 “어떤 product UX로 되살릴지”를 먼저 고정하는 편이 맞습니다.

즉 이 계획은 “나중에 revive할 때 어디서부터 시작할지”를 미리 정리한 문서입니다.

---

## Current Gaps

historical legacy wrapper의 문제:

- local/root `--json` 없음
- `handleCommandAction` / `getGlobalOpts` 미사용
- invalid port가 generic `Error`
- startup/open/browser failure에 대한 명시적 exit code 계약 없음
- signal handler 내부 `process.exit(0)` 사용
- CLI가 dashboard package 내부 lifecycle까지 떠안고 있음
- top-level `createCLI()` 미등록
- CLI tests / docs/cli.md reference 부재

현재 dashboard package 상태:

- `packages/dashboard/src/server/index.ts`에 `createDashboardServer(...)`는 이미 존재
- 하지만 CLI가 쓰기 좋은 “start/stop lifecycle helper”가 따로 없어서 wrapper가 직접 listen/close/signal wiring을 담당함
- static asset 없음 / port collision / browser open 실패 같은 operator-facing failure contract가 CLI surface 기준으로 정리돼 있지 않음

---

## North Star UX

목표 UX는 아래입니다.

```bash
obora dashboard
obora dashboard --port 4790
obora dashboard --json --no-open
obora --json dashboard --port 4790
```

성공 시:

- text 모드: host, port, url, static asset 상태, browser auto-open 여부 출력
- JSON 모드: machine-readable launch metadata 출력
- 종료는 graceful shutdown으로 처리하고 CLI wrapper가 직접 `process.exit(0)` 하지 않음

실패 시:

- invalid port -> exit code `2`
- dashboard bootstrap/listen/open failure -> exit code `3`
- irrelevant `obora doctor` / dry-run hint 없음

---

## Proposed Command Contract

### Usage

```bash
obora dashboard
obora dashboard --port 4790
obora dashboard --host 127.0.0.1 --no-open
obora dashboard --json --no-open
obora --json dashboard --port 4790
```

### Options

- `--port <port>`
- `--host <host>`
- `--no-open`
- `--json`

### JSON payload draft

```json
{
  "command": "dashboard",
  "host": "127.0.0.1",
  "port": 4790,
  "url": "http://127.0.0.1:4790",
  "openedBrowser": false,
  "staticAssetsPresent": true
}
```

### Exit code draft

- `0` dashboard launched successfully
- `2` invalid host/port option
- `3` dashboard bootstrap/listen/browser-open failure

---

## Workstream A. Separate Bootstrap from CLI

### Objective

CLI wrapper가 lifecycle를 직접 구현하지 않도록 dashboard package 쪽에 bootstrap helper를 만든다.

### Task A1: Add dashboard bootstrap helper

**Files:**

- Modify: `packages/dashboard/src/server/index.ts`
- Create: `packages/dashboard/src/server/bootstrap.ts`
- Modify: `packages/dashboard/src/index.ts`
- Test: `packages/dashboard/src/server/__tests__/bootstrap.test.ts`

**Requirements:**

- `createDashboardServer(...)` 위에 얇은 bootstrap helper 제공
- helper가 아래를 반환
  - started app/server handle
  - resolved host/port/url
  - `close()`
- CLI wrapper가 signal wiring 없이도 재사용 가능해야 함

**Acceptance Criteria:**

- dashboard package만으로 start/stop contract를 테스트 가능
- CLI는 `listen()`과 signal shutdown 세부 구현을 복붙하지 않음

### Task A2: Define bootstrap failure taxonomy

**Files:**

- Modify: `packages/dashboard/src/server/bootstrap.ts`
- Modify: `packages/dashboard/src/server/index.ts`
- Test: `packages/dashboard/src/server/__tests__/bootstrap.test.ts`

**Failure families to pin:**

- invalid port/host input
- static assets missing
- listen failure (port in use)
- browser open failure는 CLI layer에서 분리 처리

**Acceptance Criteria:**

- dashboard package 레벨에서 bootstrap failure message가 operator-readable 하다
- CLI가 wrapping하기 쉬운 에러 메시지가 나온다

---

## Workstream B. Rebuild the CLI Surface

### Objective

legacy wrapper를 modern command contract로 교체한다.

### Task B1: Add modern `packages/cli/src/commands/dashboard.ts`

**Files:**

- Create: `packages/cli/src/commands/dashboard.ts`
- Modify: `packages/cli/src/cli.ts`
- Modify: `packages/cli/src/utils/error-handler.ts`
- Create/Test: `packages/cli/src/commands/__tests__/dashboard.test.ts`
- Test: `packages/cli/src/commands/__tests__/cli-commands.test.ts`
- Test: `packages/cli/src/utils/__tests__/error-handler.test.ts`

**Requirements:**

- removed legacy wrapper를 복원하지 않고 modern command를 새로 추가
- `getGlobalOpts(this)` 적용
- `handleCommandAction(...)` 적용
- local/root `--json` 지원
- explicit port parser 적용
- invalid port -> `CLIError(..., ExitCode.VALIDATION_ERROR)`
- dashboard bootstrap/listen/open failure -> `ExitCode.EXECUTION_FAILED`

**Acceptance Criteria:**

- `createCLI()`에 등록 가능
- direct subcommand와 root-global parse 둘 다 동일 계약을 가짐

### Task B2: Decide browser-open semantics explicitly

**Files:**

- Modify/Create: `packages/cli/src/commands/dashboard.ts`
- Create/Test: `packages/cli/src/commands/__tests__/dashboard.test.ts`
- Docs: `docs/cli.md`

**Decision to make:**

둘 중 하나를 명시적으로 고릅니다.

1. browser open 실패를 warning으로만 처리하고 서버는 계속 살아 있게 둘지
2. browser open 실패도 command failure(exit code `3`)로 볼지

추천 기본값:

- `--no-open`이 아닌 경우에도 browser open 실패는 warning 처리
- 서버 startup 성공 자체는 성공으로 간주
- 단, JSON payload에는 `openedBrowser: false`와 warning reason 포함

이유:

- operator 입장에서 중요한 것은 dashboard server availability이지 local browser helper 성공 여부가 아닙니다.

---

## Workstream C. Operator Docs and Regression Coverage

### Objective

dashboard가 live surface가 되면 문서/테스트/구현 드리프트를 처음부터 막는다.

### Task C1: Add CLI docs

**Files:**

- Modify: `docs/cli.md`
- Modify: `docs/legacy-cli-surface-audit.md`

**Must document:**

- usage
- options
- local/root `--json`
- exit codes
- `--no-open` semantics
- static assets missing 시 의미

### Task C2: Add regression coverage

**Files:**

- Test: `packages/cli/src/commands/__tests__/dashboard.test.ts`
- Test: `packages/cli/src/utils/__tests__/error-handler.test.ts`

**Minimum coverage:**

- local `--json`
- root `--json`
- invalid port -> exit code `2`
- bootstrap/listen failure -> exit code `3`
- browser open failure decision path pinned
- no irrelevant generic hint leak
- top-level command registration assertion

---

## Recommended Implementation Order

1. dashboard package bootstrap helper 분리
2. bootstrap test 고정
3. CLI modern command 교체
4. CLI contract tests 추가
5. docs/cli.md 추가
6. legacy audit 문서 상태 갱신

---

## Explicit Non-Goals for this roadmap

이번 roadmap에 포함하지 않는 것:

- dashboard UI 기능 추가
- API route 확장
- notification UX 재설계
- multi-tenant hosting
- remote deployment/runtime hosting

이 문서는 오직 `obora dashboard` launcher를 modern CLI surface로 되살리는 문제만 다룹니다.

---

## Go / No-Go Rule

아래 둘 중 하나가 나오기 전에는 구현 시작하지 않습니다.

- product 측에서 “M4에서 dashboard launcher를 실제 사용자 surface로 다시 열자” 결정
- 또는 dashboard package가 standalone dev/server surface로 계속 필요하다는 기술 결정

그 전까지는 legacy classification을 유지합니다.
