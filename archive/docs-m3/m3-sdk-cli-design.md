---
status: draft
owner: denovo
project: obora-kit
created: "2026-02-17"
updated: "2026-02-17"
links:
  - "[[projects/obora-kit/INDEX]]"
  - "[[projects/obora-kit/ROADMAP]]"
  - "[[projects/obora-kit/ARCHITECTURE]]"
  - "[[projects/obora-kit/SCHEMAS]]"
---

# M3 SDK + CLI Design (Obora AI Control Runtime)

## 문서 정합성 노트 (SSOT)

- 본 문서(M3)가 `@obora/sdk`/`@obora/cli` API 계약의 SSOT입니다.
- `ARCHITECTURE.md` §6(API 설계)은 M0 단계 초안으로 간주합니다.
- **M3 확정 후 `ARCHITECTURE.md` §6 업데이트 예정**입니다.

## 1. M3 Overview

### 목표

M3의 목표는 `@obora/runtime`(M1+M2 완료)을 **직접 임베딩 가능한 플랫폼**으로 전환하는 것입니다.

- `@obora/sdk`: 런타임 기능을 안정적인 프로그래머블 API로 노출
- `@obora/cli`: SDK thin wrapper로 재정렬
- npm 기반 플러그인 로더: 설치-발견-등록 경로 표준화
- 워크플로우 테스트 프레임워크: mock 기반 deterministic 테스트 체계 제공

### 범위 (In Scope)

- SDK public contract 확정 (`OboraRuntime`, `Policy`, `Agent`, `Workflow`, `Plugin`, `TestKit`)
- CLI 명령 체계 재설계 (init/run/test/plugin/audit 중심)
- PluginLoader/Registry의 npm discovery 확장
- fixture(YAML) 기반 workflow 테스트 러너 설계
- 패키지 통합 계획 수립 (legacy 11개 → target 5개)

### 비목표 (Out of Scope)

- dashboard UI 구현
- 분산 실행/멀티테넌시 구현
- 런타임 내부 알고리즘 재작성 (M2에서 확정된 cell/policy/state/consensus/gates/audit/recovery/orchestrator 계약 유지)
- 코드 생성 도메인 특화 기능 강화

---

## 2. 현재 상태 분석

### 2.1 runtime exports 현황 (`packages/runtime/src/index.ts`)

현재 runtime은 다음 모듈을 단일 엔트리에서 export 중입니다.

- `cell`
- `policy`
- `state`
- `consensus`
- `gates`
- `audit`
- `errors`
- `recovery`
- `orchestrator`
- `patterns`
- `plugins`

해석:

- M2까지 필요한 통제 컴포넌트는 구현 완료 상태
- SDK는 신규 기능을 추가하기보다, 위 모듈을 **사용자 친화 계약으로 구성/조합하는 상위 계층**이 되어야 함

### 2.2 CLI 문제점 (`packages/cli`)

현재 CLI는 pre-pivot 구조의 잔재가 큽니다.

- `@obora/core`, `@obora/database`, `@obora/dashboard` 등 구 구조 의존
- 명령군이 런타임 중심이 아닌 과거 워크플로우 UX 중심(`new/plan/done/skills`)으로 설계됨
- SDK 추상화 없이 직접 의존 조합으로 테스트/유지보수 비용 증가
- 요구사항 기준 70+ 테스트 실패 상태로 신뢰 가능한 릴리즈 경로 부재

### 2.3 레거시 패키지 상태

정리 대상: `actor`, `blackboard`, `board`, `agents`, `core`, `database`, `preset-engine`, `project-templates`, `adapters`, `workflow`, `dashboard`

현 상태 판단:

- 일부는 runtime에 이미 흡수됨 (`actor`, `blackboard` 성격)
- 일부는 M3 목표와 직접 무관 (`project-templates`, `preset-engine`)
- 일부는 구조상 필요하나 경계 재설정 필요 (`adapters`, `workflow`, `dashboard`)

결론:

- M3는 새 기능 추가보다 **패키지 경계/의존 방향을 런타임 중심으로 재정렬**하는 단계

---

## 3. SDK 설계 (`@obora/sdk`)

### 3.1 설계 원칙

1. SDK는 runtime의 상위 레이어이며, Orchestrator 결정성을 훼손하지 않는다.
2. SDK는 선언적 계약(YAML/코드)을 동일 모델로 취급한다.
3. SDK 기본 API는 SCHEMAS.md의 타입/에러/이벤트 SSOT와 정합해야 한다.
4. M2 기능(패턴, Policy DSL, HITL, re-execution)을 1급 API로 노출한다.

### 3.2 runtime와의 관계

- `@obora/runtime`: 실행 엔진(결정적 뼈대)
- `@obora/sdk`: 구성/실행/관찰을 묶는 façade + builder + client API

즉, SDK는 별도 엔진이 아니라 **runtime contract-preserving wrapper**입니다.

### 3.3 Public API surface (초안)

```ts
import type {
  WorkflowDefinition,
  OboraAuditEvent,
  OboraErrorCode,
  ReExecutionOptions,
  ReExecutionResult,
} from "@obora-kit/runtime";

export interface OboraRuntimeOptions {
  policy?: string | PolicyDefinition;
  audit?: AuditConfig;
  plugins?: PluginInstallSpec[];
}

export interface RunOptions {
  input?: unknown;
  variables?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface RunHandle {
  executionId: string;
  status: "queued" | "running" | "waiting" | "completed" | "failed" | "aborted";
  wait(): Promise<ExecutionResult>;
  cancel(reason?: string): Promise<void>;
}

export class OboraRuntime {
  constructor(options?: OboraRuntimeOptions);

  define(name: string, workflow: WorkflowDefinition): this;
  loadWorkflow(path: string): Promise<this>;

  registerAgent(name: string, factory: AgentFactory): this;
  registerTool(name: string, tool: ToolHandler): this;
  registerPattern(pattern: PatternPlugin | CustomPatternDefinition): this;
  registerPlugin(plugin: OboraPlugin): this; // registerPattern 경로로도 pattern 등록 가능

  run(name: string, options?: RunOptions): Promise<RunHandle>;
  replay(executionId: string, options?: ReExecutionOptions): Promise<ReExecutionResult>;

  on<T extends OboraAuditEvent["type"]>(type: T, handler: EventHandler<T>): Unsubscribe;
  onError(handler: (error: OboraError) => void): Unsubscribe;
}
```

### 3.4 핵심 보조 API

```ts
export class Policy {
  static fromYaml(path: string): Promise<PolicyDefinition>;
  static create(input: PolicyDefinition): PolicyDefinition;
}

export abstract class Agent {
  abstract execute(ctx: AgentContext): Promise<AgentResult>;
}

export class Workflow {
  static create(def: WorkflowDefinition): WorkflowDefinition;
  static fromYaml(path: string): Promise<WorkflowDefinition>;
}
```

### 3.5 에러 핸들링 계약

- SDK 에러는 runtime `OboraErrorCode`를 그대로 보존한다.
- SDK는 코드 재매핑을 하지 않고, 사용자 경험을 위해 컨텍스트만 부가한다.

```ts
export interface OboraError extends Error {
  code: OboraErrorCode;
  executionId?: string;
  stepName?: string;
  cause?: unknown;
}
```

원칙:

- `throw` vs `success:false` 채널 규약은 SCHEMAS.md 패턴 런타임 계약을 그대로 따른다.
- **throw 채널**: timeout/정책 위반/인프라 실패 등 예외 흐름은 `try/catch`로 처리하고 `error.code`로 분기한다.
- **result 채널**: 비즈니스 실패(예: quorum 미달, score 미달)는 `result.success === false`로 처리한다.
- CLI 포함 모든 상위 레이어는 코드 문자열 비교가 아니라 `code` 기반 처리.

### 3.6 이벤트 구독 계약

SDK 이벤트는 Audit 이벤트 카탈로그를 그대로 expose한다.

- `execution_start/end`, `step_start/end`
- `policy_check/deny`, `gate_wait/resolve`
- `consensus_vote/result`
- `recovery_start/end`
- `plugin_load/unload`
- `error`

추가로 `events()` async iterator 제공:

```ts
const stream = runtime.events({ executionId });
for await (const evt of stream) {
  // UI/CLI/log sink 연결
}
```

---

## 4. CLI 재설계 (`@obora/cli`)

### 4.1 원칙: SDK thin wrapper

CLI는 비즈니스 로직을 소유하지 않고 SDK를 호출하는 조립 계층으로 한정한다.

- CLI 책임: 입출력 파싱, 사용자 피드백, 프로세스 종료코드
- SDK 책임: 실행/정책/이벤트/플러그인/테스트 동작

### 4.2 제안 명령 구조

- `obora init` — 프로젝트 scaffold + 기본 workflow/policy 생성
- `obora run <workflow>` — 워크플로우 실행
- `obora test <workflow|suite>` — mock 기반 테스트 실행
- `obora plugin list|install|remove|inspect` — 플러그인 관리
- `obora audit query|tail|replay` — 감사 조회/추적/재실행
- `obora policy validate` — policy/workflow 정적 검증

### 4.3 기존 CLI 대비 변화

- 과거 `new/plan/done/skills` 중심에서 runtime 운영 중심으로 전환
- core/database/dashboard 직접 의존 제거
- 명령 처리 공통 실행 경로를 SDK 하나로 통합
- 테스트 전략: CLI 단위 테스트 + SDK 통합 테스트로 분리

### 4.4 종료 코드 표준

- `0`: success
- `2`: validation error (schema/policy)
- `3`: execution failed (`OboraError`)
- `4`: gate waiting timeout/user abort
- `10+`: CLI runtime/system error

#### 4.4.1 CLI 종료 코드 ↔ `OboraErrorCode` 카테고리 매핑 규칙

- `0`: 정상 완료 (`result.success === true`)
- `2`: 입력/스키마/정책 검증 실패 (`POLICY_*`, workflow/schema validation)
- `3`: 실행 실패 (`CELL_*`, `CONSENSUS_*`, `RECOVERY_*`, `ORCH_*`, `AUDIT_*`, `ADAPTER_*`)
- `4`: 게이트 대기 타임아웃 또는 사용자 중단 (`POLICY_GATE_TIMEOUT`, `CELL_ABORTED`)
- `10+`: CLI 자체 런타임 오류(인자 파싱, I/O, 내부 예외)

규칙:

1. SDK throw 채널에서 `OboraError.code`가 있으면 위 카테고리 우선 매핑
2. `result.success === false`는 기본적으로 3을 사용하되, validation 성격이면 2로 승격
3. 코드 미식별 예외는 10으로 처리하고 원본 에러를 stderr/audit에 기록

---

## 5. 플러그인 로더 (npm 기반)

### 5.1 목표

npm 설치 후 별도 코드 변경 없이 플러그인이 발견/등록/우선순위 적용되어야 한다.

### 5.2 메타데이터 계약

`package.json`에 `obora` 필드 사용:

```json
{
  "name": "obora-plugin-my-policy",
  "version": "0.1.0",
  "main": "dist/index.js",
  "obora": {
    "type": "policy-rule",
    "exports": "./dist/index.js",
    "name": "my-policy-rule"
  }
}
```

### 5.3 discovery → register 플로우

1. `PluginLoader.scan()`이 `node_modules`/workspace plugins 경로 탐색
2. `package.json.obora` 메타데이터 검증
3. 동적 import 후 플러그인 객체 로드
4. `PluginRegistry.register()` 호출
5. `plugin_load` 이벤트 기록

### 5.4 타입별 로딩 모델

M3 표준 타입:

- `pattern`
- `policy`
- `tool`
- `agent`
- `audit`
- `recovery`
- `gate`
- `state`

#### M3 표준 타입 ↔ SCHEMAS.md `PluginType` 매핑

| M3 표준 타입 | SCHEMAS.md PluginType | 비고                                                          |
| ------------ | --------------------- | ------------------------------------------------------------- |
| `pattern`    | `pattern`             | 동일                                                          |
| `policy`     | `policy-rule`         | 정책 규칙 플러그인                                            |
| `tool`       | `tool`                | 동일                                                          |
| `agent`      | `agent`               | 동일                                                          |
| `audit`      | `audit-store`         | 감사 저장소 플러그인                                          |
| `recovery`   | `recovery-strategy`   | 복구 전략 플러그인                                            |
| `gate`       | `consensus-rule`      | 합의/게이트 커스텀 규칙으로 매핑(필요 시 전용 타입 신설 검토) |
| `state`      | `state-transform`     | 상태 변환 플러그인                                            |

`package.json` 메타데이터의 `obora.type`은 **반드시 SCHEMAS.md의 `PluginType` 문자열**을 사용한다.

예:

- 사용 가능: `pattern`, `policy-rule`, `tool`, `agent`, `audit-store`, `recovery-strategy`, `consensus-rule`, `state-transform`
- 사용 금지: `policy`, `audit`, `recovery`, `gate`, `state` (표준 타입 별칭이므로 메타데이터에는 직접 사용하지 않음)

### 5.5 override 정책

- 기본: same-type same-name 충돌 시 reject
- `--override` 또는 workflow/plugin policy에서 명시 시 교체 허용
- 교체 시 `plugin_unload` + `plugin_load` 이벤트를 연속 기록

---

## 6. 워크플로우 테스트 프레임워크

### 6.1 설계 목표

- 런타임을 실제 LLM/외부도구 없이 deterministic하게 검증
- 협업 패턴/정책/HITL/re-execution 시나리오를 fixture로 재현

### 6.2 MockAgent / MockTool API

```ts
export interface MockAgentSpec {
  name: string;
  onStep(
    stepName: string,
    handler: (ctx: AgentContext) => AgentResult | Promise<AgentResult>
  ): void;
}

export interface MockToolSpec {
  name: string;
  execute: (params: unknown, ctx: ToolContext) => unknown | Promise<unknown>;
}
```

`MockAgent`는 SDK/runtime의 `Agent` 인터페이스(또는 `Agent` 추상 클래스 계약)를 준수하는 테스트 대역으로 취급한다.
즉, Mock은 별도 모델이 아니라 production runtime과 동일한 호출 시그니처(`execute(ctx)`)를 가진다.

### 6.3 Test Runner 계약

```ts
export interface WorkflowTestCase {
  name: string;
  workflow: string; // yaml path
  input?: unknown;
  mocks?: { agents?: MockAgentSpec[]; tools?: MockToolSpec[] };
  expect: {
    status: "completed" | "failed" | "waiting";
    events?: Array<{ type: string; contains?: Record<string, unknown> }>;
    errors?: Array<{ code: string }>;
  };
}

export function runWorkflowTest(caseDef: WorkflowTestCase): Promise<TestResult>;
```

### 6.4 fixture 기반 YAML

`tests/fixtures/*.yaml`로 테스트 케이스를 선언:

```yaml
name: peer-review-pass
workflow: ./workflows/doc-review.yaml
input:
  topic: "M3 설계"
expect:
  status: completed
  events:
    - type: consensus_result
      contains:
        payload.status: pass
```

### 6.5 범위

설계 문서에서는 테스트 전략/계약만 정의하고, 케이스 세부 목록은 구현 단계에서 관리한다.

---

## 7. 패키지 정리 계획

### 7.1 목표 구조 (11 → 5)

목표 핵심 패키지:

1. `@obora/runtime`
2. `@obora/sdk`
3. `@obora/cli`
4. `@obora/adapters`
5. `@obora/dashboard` (M4 중심)
   - CLI revive roadmap reference: `docs/plans/2026-04-15-dashboard-cli-m4-roadmap.md`

### 7.2 삭제/이동/통합 매핑

| Legacy            | 액션                    | Target                          |
| ----------------- | ----------------------- | ------------------------------- |
| actor             | 통합                    | runtime (cell/recovery)         |
| blackboard        | 통합                    | runtime (state/consensus/audit) |
| board             | 삭제(중복)              | runtime/state                   |
| agents            | 분리/통합               | runtime(cell 역할) + adapters   |
| core              | 통합                    | runtime/orchestrator + sdk      |
| database          | 통합                    | runtime/audit                   |
| preset-engine     | 삭제 또는 examples 이동 | examples                        |
| project-templates | 삭제                    | cli init templates로 흡수       |
| adapters          | 유지(경계 재정의)       | adapters                        |
| workflow          | 통합                    | runtime/schemas + sdk/workflow  |
| dashboard         | 유지(M4)                | dashboard                       |

`agents`는 package/runtime 경계 재정렬 대상이며, 현재는 `list/show/set/reset`이 live surface로 복구된 상태입니다.
config-layer override mutation은 `docs/plans/2026-04-20-agents-safe-override-a3-roadmap.md`를 기준으로 구현되었고, execution-only source는 여전히 별도 visibility 범위로 유지합니다.

M4에서 CLI launcher를 다시 열 경우에는 `docs/plans/2026-04-15-dashboard-cli-m4-roadmap.md`를 기준 구현 계획으로 사용합니다.

### 7.3 전환 원칙

- 피봇 전 코드는 비전 정합 시에만 재사용
- 중복 패키지 병존 금지
- 의존 방향은 `cli -> sdk -> runtime` 단방향 고정

---

## 8. 태스크 분해 (M3-01 ~ M3-17)

### Track A: SDK Core

- **M3-01** SDK package bootstrap
  - 설명: `packages/sdk` 생성, 빌드/타입/테스트 파이프라인 구성
  - 의존성: 없음
  - 난이도: M
- **M3-02** Runtime façade API (`OboraRuntime`) 구현
  - 의존성: M3-01
  - 난이도: L
- **M3-03** Workflow/Policy builder API 정렬
  - 의존성: M3-02
  - 난이도: M
- **M3-04** Error/Event API 정렬 (OboraErrorCode pass-through)
  - 의존성: M3-02
  - 난이도: M
- **M3-05** Replay/Re-execution SDK API 노출
  - 의존성: M3-02
  - 난이도: M

### Track B: CLI

- **M3-06** CLI command IA 재구성 (init/run/test/plugin/audit/policy)
  - 의존성: M3-02
  - 난이도: M
- **M3-07** CLI thin-wrapper migration (legacy command 제거)
  - 의존성: M3-06
  - 난이도: L
- **M3-08** CLI exit code/UX 표준화
  - 의존성: M3-07
  - 난이도: S

### Track C: Plugin

- **M3-09** Plugin metadata schema 정의 (`package.json.obora`)
  - 의존성: M3-01
  - 난이도: S
- **M3-10** npm discovery loader 구현
  - 의존성: M3-09
  - 난이도: L
- **M3-11** 타입 매핑/override 정책 구현
  - 의존성: M3-10
  - 난이도: M
- **M3-12** plugin install/register/override E2E
  - 의존성: M3-11
  - 난이도: M

### Track D: Test Framework

- **M3-13** MockAgent/MockTool API 구현
  - 의존성: M3-02
  - 난이도: M
- **M3-14** Workflow test runner 구현
  - 의존성: M3-13
  - 난이도: M
- **M3-15** YAML fixture schema + validator
  - 의존성: M3-14
  - 난이도: S
- **M3-16** 대표 시나리오 회귀 테스트 세트 구축
  - 의존성: M3-15
  - 난이도: M

### Track E: Package Consolidation

- **M3-17** 레거시 패키지 삭제/통합 실행
  - 설명: `actor/blackboard/board/agents/core/database/preset-engine/project-templates/workflow`의 삭제·이관·통합을 단계별 수행하고 import 경로를 정리
  - 의존성: M3-05, M3-08, M3-12
  - 난이도: L

---

## 9. 성공 기준

### 9.1 E2E 시나리오

1. SDK로 workflow define → run → event subscribe → result 획득
2. CLI `run`과 SDK `run`이 동일 execution trace를 생성
3. npm plugin install 후 `plugin list`에서 자동 발견/로드
4. policy 위반 시 동일 `OboraErrorCode`가 SDK/CLI에서 일관되게 노출
5. mock 기반 workflow test가 외부 LLM 없이 deterministic pass/fail 재현

### 9.2 검증 방법

- contract test: SDK 타입/시그니처 + 에러코드 일치 검증
- parity test: CLI vs SDK trace diff 0 보장
- plugin integration test: install/register/override/unload 이벤트 검증
- regression test: M2 주요 패턴(Discussion/Consensus/PeerReview/RedBlue/HITL/Re-exec) 유지 확인

---

## 10. Direction Guard Rails 체크리스트

- [x] 이것이 AI 통제를 강화하는가? **YES**
- [x] 이것이 선언적/플러그인 구조인가? **YES**
- [x] 이것이 Orchestrator의 결정성을 유지하는가? **YES**
- [x] 이것이 코드 생성기 특화 기능은 아닌가? **YES**
- [x] 이것이 피봇 전 관성을 답습하지 않는가? **YES**

근거:

- SDK/CLI/Plugin/Test 모두 runtime 통제 계약을 확장/표준화하는 작업이며, Orchestrator 의사결정에 AI를 주입하지 않는다.
- 기존 CLI의 레거시 의존을 제거하고 `cli -> sdk -> runtime` 단일 경로로 수렴한다.
