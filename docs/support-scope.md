# Obora Support Scope

Updated: 2026-04-18

이 문서는 현재 Obora repo에서 무엇을 “지원 범위”로 보고, 무엇을 “비지원 / 비-live / deferred”로 보는지 빠르게 구분하기 위한 문서입니다.
기능 인벤토리 전체는 `docs/current-capabilities.md`, 운영 흐름은 `docs/operator-guide.md`, deferred revival 기준은 `docs/deferred-surface-revival-criteria.md`를 참고하세요.

기준은 아래 4가지입니다.

- 현재 top-level CLI에 실제 등록돼 있는가
- 현재 README / `docs/cli.md` / tutorials에서 product-facing flow로 가르치는가
- monorepo package로 build/test/publish 대상인가
- legacy wrapper / historical 흔적이 아니라 현재 contract로 유지되는가

---

## 1. 한눈에 보는 판단 기준

현재 Obora의 surface는 아래 4가지로 나누어 보는 것이 가장 안전합니다.

1. live CLI support
2. supported package capability
3. package-only capability
4. deferred / legacy-only / non-live surface

의미는 아래와 같습니다.

### 1.1 live CLI support

지금 바로 product-facing command로 사용해도 되는 surface입니다.

조건:

- `createCLI()`에 실제 등록됨
- `docs/cli.md`와 README 흐름에 반영됨
- 테스트/문서/gate 기준으로 유지됨

### 1.2 supported package capability

top-level CLI가 아니라도 현재 코드/패키지 기준으로 사용 가능한 capability입니다.

조건:

- workspace package로 존재
- build/test/publish surface가 성립
- SDK/runtime API 또는 package-level capability로 설명 가능

### 1.3 package-only capability

패키지는 존재하지만 아직 product-facing CLI command로 간주하지 않는 영역입니다.

조건:

- package capability는 있음
- 하지만 top-level CLI / onboarding / operator guide에 올리지는 않음

### 1.4 deferred / legacy-only / non-live surface

코드나 문서 흔적이 있어도 현재 기준 product support로 간주하지 않는 영역입니다.

---

## 2. 현재 지원 범위

### 2.1 live CLI support

현재 live top-level CLI support는 아래입니다.

#### 시작 / 온보딩

- `obora init`
- `obora quickstart`
- `obora doctor`
- `obora models`
- `obora agents`
- `obora auth`

#### workflow 검증 / 실행

- `obora validate`
- `obora expand`
- `obora judge`
- `obora run`
- `obora test`
- `obora policy`
- `obora plugin`

#### 운영 / 관찰 / 복구

- `obora status`
- `obora runs`
- `obora inspect`
- `obora resume`
- `obora dlq`
- `obora artifact`
- `obora audit`
- `obora knowledge`

운영자 관점 기본 경로:

```bash
obora quickstart my-project
cd my-project
obora doctor
obora validate judge.yaml
obora judge --dry-run
obora judge
```

운영 중 기본 조회 경로:

```bash
obora status
obora runs list
obora inspect <runId>
obora dlq list
obora audit query <runId>
```

### 2.2 supported package capability

현재 package 기준으로는 아래가 지원 범위입니다.

#### `@obora/cli`

역할:

- onboarding surface
- config/auth/model discovery
- agent resolution inspection plus safe config-layer override (`list/show/set/reset`)
- workflow validate/expand/run/judge
- operational inspection and recovery

#### `@obora/sdk`

역할:

- programmatic runtime façade
- workflow define/run API
- testing utilities
- knowledge/config resolution helpers
- one-file workflow related higher-level SDK surface

#### `@obora/runtime`

역할:

- deterministic orchestration core
- policy / audit / recovery backbone
- workflow execution engine

#### `@obora/adapters`

역할:

- provider adapters
- tool/auth integration layer
- model/provider connection surface

이 4개는 현재 “지원되는 제품/패키지 범위”로 보는 것이 맞습니다.

---

## 3. 조건부 지원 범위

### 3.1 package-only capability: `@obora/dashboard`

`@obora/dashboard`는 현재 아래 의미로만 보는 것이 안전합니다.

- package는 존재함
- workspace build/test 대상임
- dashboard server/client scaffold capability는 있음
- 하지만 `obora dashboard`는 현재 live CLI support가 아님

즉 현재 판단은 아래와 같습니다.

- package capability: 예
- top-level CLI capability: 아니오
- onboarding/operator default path 포함: 아니오

운영 문서에서 dashboard를 기본 경로로 안내하지 않는 이유는 아래와 같습니다.

- live CLI contract가 아직 정리되지 않음
- operator command로 복구할지 product 판단이 남아 있음
- 현재는 package/dev-tool 성격이 더 강함

---

## 4. 현재 비지원 범위

### 4.1 deferred surface

아래는 “완전히 삭제된 것”은 아니지만 현재 live support로 보지 않습니다.

- `obora dashboard`

#### `dashboard`

- package capability는 있으나 live CLI는 아님
- M4 이후 product decision + bootstrap contract 정리 전까지 defer
- roadmap 문서: `docs/plans/2026-04-15-dashboard-cli-m4-roadmap.md`

추가 메모:

- `obora agents`는 이제 `list/show/set/reset` 범위로 live support에 포함됩니다.
- `set/reset`은 project/global `.obora/config.yaml`의 config-layer override만 다룹니다.
- execution-only source(`agentsPath`, workflow-local `agents`, runtime registration`)는 여전히 mutation 대상이 아닙니다.

상세 기준:

- `docs/deferred-surface-revival-criteria.md`

### 4.2 legacy-only surface

아래는 현재 product support로 간주하지 않습니다.

- `obora new`
- `obora done`
- `obora skills`

사유:

- pre-pivot feature workflow UX 흔적
- 현재 runtime-centric CLI family와 방향이 다름
- live top-level command registration에 포함되지 않음
- operator/onboarding path에서 가르치지 않음

### 4.3 historical / compatibility-only 흔적

아래는 repo 안에 남아 있어도 product 기본 경로로 오해하면 안 됩니다.

- historical plan/docs에 남아 있는 옛 `_legacy/*` command 경로 언급
- historical review / cleanup plan 문서 속 옛 command 표현
- schema compatibility 설명용 field 예시
- 과거 feature-local audit DB / DuckDB 기준 설명

즉 “repo에 흔적이 있다”와 “현재 지원된다”는 같은 뜻이 아닙니다.

---

## 5. 실무 판단 규칙

헷갈릴 때는 아래 순서로 판단하면 됩니다.

1. `packages/cli/src/cli.ts`에 top-level 등록이 있는가?
2. `docs/cli.md`와 README quickstart path에 올라와 있는가?
3. `docs/current-capabilities.md`와 `docs/operator-guide.md`에서 현재 경로로 소개되는가?
4. package capability인지, operator-facing live command인지 구분했는가?
5. deferred/legacy 문서를 support 문서로 오해하고 있지 않은가?

짧게 정리하면:

- live CLI에 있고 문서 흐름에 있으면 지원 범위
- package는 있으나 live CLI가 아니면 package-only capability일 수 있음
- legacy/deferred는 현재 기본 사용 경로가 아님

---

## 6. 지금 기준 권장 해석

현재 준혁님 기준으로는 아래처럼 보면 가장 안전합니다.

1. 처음 쓰거나 운영할 때는 `quickstart / doctor / validate / judge / run / status / runs / inspect / dlq / audit`만 중심으로 본다
2. SDK 통합이 필요할 때만 `@obora/sdk` / `@obora/runtime` / `@obora/adapters`를 본다
3. `dashboard`는 패키지 capability로만 보고 CLI 명령으로 기대하지 않는다
4. `agents`는 live지만 `new / done / skills / dashboard`는 top-level live feature처럼 다루지 않는다

---

## 7. 관련 문서

- `docs/current-capabilities.md`
- `docs/operator-guide.md`
- `docs/cli.md`
- `docs/deferred-surface-revival-criteria.md`
- `docs/legacy-cli-surface-audit.md`
