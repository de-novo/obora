# Obora Quickstart Onboarding Roadmap

> **For Hermes:** 이 문서는 Obora를 "아주 쉽게" 쓰게 만들기 위한 제품 실행 계획이다. 구현 시 작은 배치로 나누고, 각 배치는 사용자의 first success 시간을 줄이는 방향으로 우선순위를 둔다.

**Goal:** 신규 사용자가 문서 몇 장을 읽지 않아도 5분 안에 첫 성공 실행을 만들고, 실패 시 원인과 수정 방법을 바로 이해하게 만든다.

**Architecture:** 사용성 개선은 단일 기능이 아니라 진입 UX, 실행 전 가시성, 실패 진단, 경량 모드, contract-first authoring, 문서/예제의 결합 문제다. 따라서 CLI 진입점 + SDK 진단 카드 + one-file judge/simple mode + guided quickstart를 한 묶음의 onboarding surface로 재설계한다.

**Tech Stack:** `packages/cli`, `packages/sdk`, `docs/tutorials`, `README.md`, one-file workflow mode, diagnostics, resolution summary

---

## Product Principle

Obora의 사용성 목표는 "옵션이 많다"가 아니라 아래 4가지를 만족하는 것이다.

1. 시작이 짧아야 한다
2. 실행 전에 상태가 보여야 한다
3. 실패하면 바로 고칠 수 있어야 한다
4. 단순한 작업은 단순하게, 복잡한 작업만 workflow로 가야 한다

---

## Current Problem Statement

현재 신규 사용자는 아래에서 많이 막힌다.

- 어떤 문서부터 읽어야 하는지 모호하다
- provider/model/auth가 실제로 어떻게 선택됐는지 실행 전에 확신하기 어렵다
- simple evaluation도 workflow ceremony가 무겁다
- input/output contract는 좋아졌지만, 여전히 prompt-first authoring으로 느껴진다
- 실패 원인을 이해하려면 로그를 길게 읽어야 한다
- `obora init` 이후 바로 성공하는 path가 충분히 얇지 않다

---

## North Star UX

### 1. 가장 쉬운 시작 경로

```bash
npm install -g @obora/cli
obora doctor
obora init --quickstart
obora run judge.yaml --input @input.json
```

이 4단계 안에서 사용자는 아래를 바로 이해해야 한다.

- auth가 잡혔는지
- provider/model이 뭔지
- 어디를 수정해야 하는지
- 결과가 어디에 저장됐는지

### 2. 실행 전 카드

모든 주요 실행 전에 최소한 아래를 짧게 보여준다.

- provider
- model
- auth source
- config source
- mode (workflow / judge / simple)
- bindings preview
- output target
- fallback/stub 여부
- warnings

### 3. 짧은 오류

실패 시 오류는 기본적으로 아래 형태를 따른다.

- 무엇이 문제인지
- 왜 발생했는지
- 어디를 고치면 되는지
- 다음 명령이 뭔지

---

## Workstream A. First Success Path

### Objective

처음 설치한 사용자가 문서 탐색 없이도 성공 경험을 내게 한다.

### Deliverables

- `obora doctor`
- `obora init --quickstart`
- root README의 3분 quickstart 재작성
- one-file judge hello-world 예제 고정

### Task A1: Add `obora doctor`

**Objective:** 환경 점검을 한 번에 보여주는 진입 명령 추가

**Files:**
- Create: `packages/cli/src/commands/doctor.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `docs/cli.md`
- Modify: `README.md`
- Test: `packages/cli/src/commands/__tests__/doctor.test.ts`

**Checks:**
- Node version
- config file 존재 여부
- provider/model resolution
- auth env 존재 여부
- stub/fallback 여부
- next step 추천

**Acceptance Criteria:**
- `obora doctor` 한 번으로 실행 가능 상태를 판단 가능
- failure 대신 actionable warning 중심으로 출력

### Task A2: Add `obora init --quickstart`

**Objective:** 기본 scaffold를 더 쉬운 시작 구조로 생성

**Files:**
- Modify: `packages/cli/src/commands/init.ts`
- Modify: `packages/cli/templates/default/*`
- Create: `packages/cli/templates/easy/*`
- Test: `packages/cli/src/commands/__tests__/init.test.ts`

**Behavior:**
- 최소 judge example 생성
- `input.json`, `result.schema.json`, `judge.yaml` 생성
- 생성 후 바로 실행 명령 안내

**Acceptance Criteria:**
- `obora init --quickstart` 후 사용자는 바로 `obora run judge.yaml --input @input.json` 가능

### Task A3: Rewrite root Quick Start

**Objective:** README를 운영 설명보다 first success 중심으로 재구성

**Files:**
- Modify: `README.md`
- Modify: `docs/getting-started.md`

**Acceptance Criteria:**
- 첫 60줄 안에 설치 → doctor → init --quickstart → run 예제가 들어감
- "어떤 문서부터 읽어야 하지?"가 아니라 "일단 실행"이 먼저 됨

---

## Workstream B. Resolution Visibility

### Objective

실행 전에 실제 설정 해석 결과를 한눈에 보여준다.

### Deliverables

- resolution summary 기본 출력 강화
- binding preview / output preview 강화
- dry-run 시 summary를 더 직접적으로 노출

### Task B1: Make resolution summary unavoidable in onboarding flows

**Files:**
- Modify: `packages/cli/src/commands/run.ts`
- Modify: `packages/sdk/src/resolution-summary.ts`
- Test: `packages/sdk/src/__tests__/binding-preview.test.ts`
- Test: `packages/cli/src/commands/__tests__/run.test.ts`

**Acceptance Criteria:**
- `verbose`가 아니어도 onboarding-critical warning은 기본 출력
- provider/model/auth/fallback은 숨지 않음

### Task B2: Add output preview

**Files:**
- Modify: `packages/sdk/src/resolution-summary.ts`
- Modify: `packages/sdk/src/step-executor.ts`
- Test: `packages/sdk/src/__tests__/step-output-schema.test.ts`

**Acceptance Criteria:**
- output.path / output.schema / output mode가 실행 전 카드에 보임

### Task B3: Add explicit dry-run explanation

**Files:**
- Modify: `packages/cli/src/commands/run.ts`
- Modify: `docs/cli.md`

**Acceptance Criteria:**
- `obora run --dry-run`이 "실행 안 함" 수준이 아니라 실제 resolution/binding/output preview를 보여줌

---

## Workstream C. Failure Diagnostics

### Objective

실패를 디버그 로그 문제가 아니라 제품 UX 문제로 다룬다.

### Deliverables

- typed diagnostics taxonomy 확대
- short-path error templates
- command-specific next-step hint

### Task C1: Standardize error families

**Files:**
- Modify: `packages/sdk/src/diagnostics.ts`
- Modify: `packages/sdk/src/step-executor.ts`
- Modify: `packages/adapters/src/llm/*`
- Test: `packages/sdk/src/__tests__/step-output-schema.test.ts`
- Test: `packages/adapters/src/__tests__/llm/adapter.test.ts`

**Priority families:**
- `CONFIG_1001`
- `MODEL_1002`
- `AUTH_1003`
- `FALLBACK_1004`
- `BIND_1005`
- `SCHEMA_1006`

### Task C2: Add next-command hints

**Files:**
- Modify: `packages/cli/src/utils/error-handler.ts`
- Modify: `packages/sdk/src/diagnostics.ts`

**Examples:**
- missing auth → `Run: obora doctor`
- missing binding → `Check: artifacts/...`
- invalid model → `Fix provider/model in .obora/config.yaml`

### Task C3: Short troubleshooting surface

**Files:**
- Create: `docs/tutorials/quick-troubleshooting.md`
- Modify: `README.md`
- Modify: `docs/tutorials/README.md`

**Acceptance Criteria:**
- 흔한 실패 5개는 1페이지 안에서 해결 가능

---

## Workstream D. Judge / Simple Mode

### Objective

JSON in / JSON out 단건 작업은 workflow 엔진 전체를 몰라도 되게 만든다.

### Deliverables

- one-file judge mode를 CLI 최상단 use-case로 승격
- `obora judge` 또는 equivalent short alias 검토
- minimal evaluation path 고정

### Task D1: Promote judge mode to first-class CLI path

**Files:**
- Modify: `packages/cli/src/index.ts`
- Create or Modify: `packages/cli/src/commands/judge.ts`
- Modify: `packages/sdk/src/one-file-modes.ts`
- Test: `packages/sdk/src/__tests__/one-file-judge.test.ts`
- Test: `packages/sdk/src/__tests__/judge-e2e.test.ts`

**Acceptance Criteria:**
- 신규 사용자가 judge task를 위해 workflow DSL 전체를 배우지 않아도 됨

### Task D2: Add judge quickstart artifact pack

**Files:**
- Create: `examples/08-judge-minimal/*`
- Modify: `README.md`
- Modify: `docs/tutorials/one-file-workflows.md`

**Acceptance Criteria:**
- 최소 예제가 3개 파일 이내
- 복붙 후 실행 가능

---

## Workstream E. Contract-First Authoring DX

### Objective

prompt-first authoring을 줄이고, binding/path/schema 중심 authoring을 기본 경로로 끌어올린다.

### Deliverables

- binding contract 노출 강화
- input/output preview 개선
- init scaffold에서 contract-first 기본화

### Task E1: Make bindings visible in examples by default

**Files:**
- Modify: `README.md`
- Modify: `docs/tutorials/04-contract-first-quickstart.md`
- Modify: `docs/tutorials/05-contract-first-authoring-guide.md`

### Task E2: Add binding preview and schema preview to startup card

**Files:**
- Modify: `packages/sdk/src/resolution-summary.ts`
- Modify: `packages/sdk/src/step-executor.ts`
- Test: `packages/sdk/src/__tests__/binding-preview.test.ts`

### Task E3: Add minimal authoring linter hints

**Files:**
- Modify: `packages/cli/src/commands/validate.ts`
- Modify: `packages/sdk/src/workflow.ts`
- Test: `packages/cli/src/commands/__tests__/validate.test.ts`

**Examples:**
- task 안에서 raw path 읽기만 쓰고 bindings 미사용 시 hint
- output.schema 없이 JSON-only 요구할 때 hint

---

## Workstream F. Documentation as Product Surface

### Objective

문서를 reference가 아니라 onboarding UI로 다룬다.

### Deliverables

- 3분 quickstart
- judge quickstart
- troubleshooting quickstart
- JSON in/out recipe
- config/auth recipe

### Task F1: Reorder docs by actual user path

**Files:**
- Modify: `docs/tutorials/README.md`
- Modify: `docs/getting-started.md`
- Modify: `README.md`

**Recommended order:**
1. doctor
2. init --quickstart
3. judge quickstart
4. config/auth quickstart
5. contract-first quickstart
6. troubleshooting

### Task F2: Add "copy-paste first success" recipes

**Files:**
- Create: `docs/tutorials/01-3-minute-quickstart.md`
- Create: `docs/tutorials/02-judge-quickstart.md`
- Create: `docs/tutorials/03-quick-troubleshooting.md`

---

## Implementation Sequence

### Phase 1 — P0 first success
1. `obora doctor`
2. `obora init --quickstart`
3. README quickstart rewrite
4. dry-run / resolution summary 강화

### Phase 2 — P0 failure clarity
5. diagnostics taxonomy 확대
6. next-command hints
7. quick troubleshooting doc

### Phase 3 — P0 simple mode
8. judge mode CLI 승격
9. minimal judge example pack

### Phase 4 — P1 contract-first DX
10. binding/schema preview 강화
11. validate 힌트 추가
12. docs/tutorial ordering 재정렬

---

## Success Metrics

### Product metrics
- first success time: 5분 이내
- first failure to diagnosis time: 1분 이내
- judge task onboarding steps: 4단계 이하
- required docs to first success: 1개 이하

### Verification commands
- `obora doctor`
- `obora init --quickstart`
- `obora run judge.yaml --input @input.json`
- `obora run judge.yaml --dry-run`
- `obora validate judge.yaml`

---

## Immediate Recommended Tickets

1. `feat(cli): add obora doctor command`
2. `feat(cli): add quickstart init template for judge-mode onboarding`
3. `feat(cli/sdk): strengthen execution resolution and output preview`
4. `feat(diagnostics): add short actionable onboarding error taxonomy`
5. `feat(cli): promote judge mode as first-class quickstart path`
6. `docs: rewrite quickstart around doctor + init --quickstart + judge`

---

## Final Statement

Obora를 아주 쉽게 만들려면 "기능을 더 추가"하는 것보다,
**처음 실행하는 사람이 어디서 막히는지 제품 표면을 다시 설계**해야 한다.

핵심은 아래 3개다.

- 시작을 줄이고
- 실행 전 상태를 보여주고
- 실패를 짧게 고치게 만드는 것
