# Obora Current Capabilities

Updated: 2026-04-18

이 문서는 현재 `obora-kit`에서 실제로 가능한 것과, 아직 live surface가 아닌 것을 빠르게 파악하기 위한 기능 정리입니다.
지원/비지원 범위 구분이 먼저 필요하면 `docs/support-scope.md`, 운영자용 짧은 사용 순서가 필요하면 `docs/operator-guide.md`를 먼저 보는 편이 좋습니다.
기준은 다음입니다.

- top-level CLI에 실제 등록된 command (`packages/cli/src/cli.ts`)
- 현재 README / `docs/cli.md` / tutorial 문서에 반영된 workflow
- 현재 publish/build/test 대상 패키지

---

## 한눈에 보기

현재 obora-kit은 크게 아래 5가지를 할 수 있습니다.

1. 빠르게 프로젝트를 생성하고 onboarding 상태를 점검할 수 있음
2. workflow YAML / one-file workflow를 검증·확장·dry-run·실행할 수 있음
3. 실행 이력, DLQ, artifact, audit 같은 운영 surface를 조회할 수 있음
4. SDK/runtime로 프로그램 방식 workflow 실행과 validation-repair loop를 구성할 수 있음
5. adapters / dashboard package까지 포함한 monorepo 기준 build/test가 성립함

---

## 1. 현재 live CLI surface

현재 `createCLI()`에 등록된 top-level command는 아래입니다.

- `obora init`
- `obora quickstart`
- `obora judge`
- `obora models`
- `obora doctor`
- `obora auth`
- `obora expand`
- `obora run`
- `obora status`
- `obora validate`
- `obora test`
- `obora plugin`
- `obora audit`
- `obora policy`
- `obora dlq`
- `obora runs`
- `obora resume`
- `obora inspect`
- `obora artifact`
- `obora knowledge`

모든 top-level command는 root-global option 체계를 따릅니다.

- `--json`
- `--verbose`
- `--no-color`
- `-q, --quiet`

---

## 2. 지금 바로 할 수 있는 것

### 2.1 시작 / 온보딩

추천 시작 경로:

```bash
obora quickstart my-project
cd my-project
obora doctor
obora validate judge.yaml
obora judge --dry-run
obora judge
```

현재 가능한 것:

- `quickstart` 또는 `init --quickstart`로 최소 judge-mode 프로젝트 생성
- `doctor`로 현재 project/global config, provider/model resolution, auth 상태, 다음 액션 확인
- `models`로 provider별 사용 가능한 model ref 확인
- `auth`로 `~/.obora/auth.json` 기반 provider auth 저장/조회/삭제/테스트

### 2.2 workflow authoring / validation / preview / execution

현재 가능한 것:

- `validate`로 graph workflow + one-file workflow 계약 검증
- `expand`로 one-file workflow를 internal expanded graph로 확인
- `run --dry-run`으로 실행 전 preview 확인
- `judge`로 judge one-file onboarding 경로를 가장 짧게 실행
- `run`으로 일반 workflow 실행
- `test`로 workflow test 실행
- `policy`로 policy validate/query 같은 정책 surface 실행

### 2.3 운영 / 관찰 / 사후 분석

현재 가능한 것:

- `status`로 persisted runs + DLQ 상태 요약 확인
- `runs`로 실행 이력 목록/상세 조회
- `inspect`로 특정 run을 top-level alias로 조회
- `resume`로 suspended run 재개
- `dlq`로 dead letter queue 목록/상세/요약/resolve
- `artifact`로 run artifact 조회/다운로드
- `audit`로 audit trail query/tail/replay
- `knowledge`로 persisted knowledge query/ingestion-related surface 사용

### 2.4 프로그램 방식 SDK 사용

현재 가능한 것:

- `OboraRuntime`로 workflow define / register / run / wait
- `Workflow`로 programmatic workflow 정의
- `StepExecutor`로 step-level execution 구성
- `@obora/sdk/testing` 유틸로 workflow test 작성
- `queryKnowledge`, `validateKnowledgeSchema` 등 knowledge API 사용
- `resolveLLMConfig`, `detectLLMConfigFromEnv`로 LLM config resolution 사용
- `CostTracker`로 비용 추적

---

## 3. 현재 지원하는 workflow authoring 스타일

### 3.1 일반 graph workflow

전통적인 step graph YAML:

- `steps`
- `depends_on`
- pattern/policy/audit/runtime 기능 조합

대표 예시:

- `examples/01-simple-pipeline`
- `examples/02-multi-agent-consensus`
- `examples/07-contract-first-evaluation`

### 3.2 one-file workflow

현재 문서상 지원 mode:

- `validation-repair`
- `research-loop`
- `proof-loop`
- `judge`

현재 가능한 것:

- `obora validate my-workflow.yaml`
- `obora expand my-workflow.yaml --json`
- `obora --json run my-workflow.yaml --dry-run --dump-expanded-workflow --show-stop-semantics`

judge mode는 현재 onboarding의 shortest path로 정리돼 있습니다.

---

## 4. 핵심 제품 기능 관점 정리

README / examples / tutorial 기준으로 현재 obora-kit이 제공하는 핵심 기능은 아래입니다.

### 4.1 제어 가능한 실행 backbone

- deterministic orchestration backbone
- multi-step workflow execution
- parallel / fan-out-fan-in / consensus / peer-review / supervisor pattern
- shell hooks
- execution lock

### 4.2 품질 수렴 / 복구

- validation-repair loop
- no-progress ceiling / repeated critical issue ceiling
- conditional routing
- recovery / resume surface
- DLQ separation and manual resolution

### 4.3 운영 / 통제 / 감사

- policy enforcement
- audit trail
- persisted runs inspection
- artifact persistence and retrieval
- execution summary / status surface

### 4.4 knowledge / observability

- persistent knowledge store
- TKG projection / review queue 관련 SDK surface
- metrics / observer / cost tracking
- health checker / alert manager 관련 runtime concepts

---

## 5. 예시로 바로 돌려볼 수 있는 것

현재 examples는 아래처럼 보는 것이 맞습니다.

### onboarding / first-success 예제

- `examples/hello-obora.yaml`
- `examples/01-simple-pipeline`
- `examples/07-contract-first-evaluation`

### supported runtime pattern 예제

- `examples/02-multi-agent-consensus`
- `examples/03-policy-gate`
- `examples/06-validation-repair-loop`

### advanced / integration-oriented 예제

- `examples/04-plugin-custom`
- `examples/05-dashboard-monitoring`
- `examples/todo-app`
- `examples/todo-app-glm47`

주의:

- `05-dashboard-monitoring`은 dashboard 맥락 예제이지만, `obora dashboard`가 live CLI라는 뜻은 아님
- `04-plugin-custom`은 runtime/plugin registration이 필요한 advanced 예제
- `todo-app*`은 compact/large end-to-end reference 예제로 보는 편이 맞음

전체 분류는 `examples/README.md`를 기준으로 봅니다.

---

## 6. 패키지 기준 현재 상태

### `@obora/cli`

현재 가장 product-facing한 surface입니다.

역할:

- onboarding
- config/auth/model discovery
- workflow validate/expand/run/judge
- operational inspection (`status`, `runs`, `inspect`, `resume`, `dlq`, `artifact`, `audit`)

### `@obora/sdk`

현재 programmatic façade입니다.

역할:

- runtime wrapping
- workflow define/run API
- testing utilities
- one-file workflow / validation-repair loop / knowledge / config resolution surface

### `@obora/runtime`

현재 core execution engine입니다.

역할:

- deterministic orchestration
- policies / audit / recovery
- multi-agent runtime backbone

### `@obora/adapters`

현재 외부 integration layer입니다.

역할:

- LLM adapters
- tool/auth adapter surface
- provider integration

### `@obora/dashboard`

패키지는 존재하고 build/test 대상이지만, 현재 top-level live CLI surface는 아닙니다.

현재 상태:

- M4 dashboard web server scaffold
- package 자체 build/test 가능
- 하지만 `obora dashboard`는 아직 live command로 복구되지 않음

---

## 7. 현재 live가 아닌 것

legacy audit 기준, 아래는 현재 top-level live CLI가 아닙니다.

- `obora new`
- `obora done`
- `obora skills`
- `obora agents`
- `obora dashboard`

현재 판단:

### legacy-only로 보는 것

- `new`
- `done`
- `skills`

사유:

- pre-pivot feature workflow UX 잔재
- `.obora/features/...` 중심 설계
- 현재 runtime-centric CLI 가족과 방향이 다름

### defer된 것

- `agents`
- `dashboard`

사유:

- modern shared contract 기준으로 재설계가 아직 안 끝남
- product UX 결정이 먼저 필요함
- `dashboard`는 현재 명시적으로 M4 concern

---

## 8. 지금 기준 추천 사용 방식

준혁님 기준으로 지금 실제 사용/정리 우선순위는 아래가 맞습니다.

1. onboarding은 `quickstart / doctor / validate / judge` 기준으로 본다
2. 일반 실행 surface는 `run / validate / expand / test` 기준으로 본다
3. 운영 surface는 `status / runs / inspect / resume / dlq / artifact / audit` 기준으로 본다
4. legacy wrapper(`new/done/skills/agents/dashboard`)는 live feature로 간주하지 않는다
5. dashboard는 package capability로만 보고 CLI capability로는 아직 제외한다

---

## 9. 다음 정리 후보

기능 정리 관점에서 다음 후보는 아래입니다.

1. support scope 문서를 README / docs 진입점에 더 촘촘히 연결하기
2. deferred surface(`agents`, `dashboard`)를 언제 revive할지 제품 판단 기준을 실제 구현 milestone과 연결하기
   - see `docs/deferred-surface-revival-criteria.md`
