# Deferred Surface Revival Criteria

Updated: 2026-04-18

이 문서는 현재 live CLI에 포함되지 않은 deferred surface 중 특히 `agents`와 `dashboard`를 언제, 어떤 조건에서 다시 열지 판단하기 위한 기준입니다.

대상:

- `obora agents`
- `obora dashboard`

전제:

- 둘 다 현재 top-level live CLI surface가 아닙니다.
- 둘 다 단순히 legacy wrapper를 `createCLI()`에 다시 꽂는 방식으로는 복구하지 않습니다.
- revival은 product 필요 + operator UX + shared CLI contract + 테스트/문서 정합성이 동시에 만족될 때만 진행합니다.

---

## 1. 공통 원칙

deferred surface를 다시 열기 전에 아래 5가지를 모두 만족해야 합니다.

### 1.1 product 이유가 명확해야 함

단순히 “예전에 있었으니 다시 붙인다”는 이유는 불충분합니다.
반드시 아래 중 하나가 있어야 합니다.

- 현재 live surface로 해결되지 않는 operator pain이 반복됨
- package capability가 충분히 성숙했고 top-level UX가 실제 사용 가치를 만듦
- README / onboarding / operations 문서에서 독립 명령으로 가르칠 가치가 생김

### 1.2 wrapper가 아니라 modern command여야 함

필수 조건:

- `handleCommandAction(...)`
- `getGlobalOpts(this)`
- root/local `--json` 계약
- `CLIError` + `ExitCode` 계약
- irrelevant generic hint suppression
- dedicated tests + `docs/cli.md` 반영

즉, `_legacy/*.ts`를 그대로 재등록하는 방식은 금지입니다.

### 1.3 package boundary가 먼저 정리돼야 함

CLI가 package 내부 lifecycle이나 raw config mutation 세부 구현을 직접 떠안으면 안 됩니다.

원칙:

- package는 bootstrap / core API 제공
- CLI는 operator-facing thin surface만 담당

### 1.4 live surface와 역할 충돌이 없어야 함

이미 있는 live command들과 역할이 겹치면 revival 가치가 없습니다.

예:

- `agents`가 단순 provider/model 설정 단축키라면 현재 `doctor` / `models` / `auth` / config editing과 역할 중복
- `dashboard`가 단순 dev server launcher라면 package dev command와만 겹치고 product CLI 가치가 약함

### 1.5 문서/검증 비용을 감당할 가치가 있어야 함

revival 순간부터 아래 유지 비용이 생깁니다.

- `docs/cli.md`
- `README.md`
- `docs/current-capabilities.md`
- 관련 tutorial / operations 문서
- contract tests
- workspace build/test/push gate

즉, “한 번 붙이고 잊는 명령”이면 revival 대상이 아닙니다.

---

## 2. `obora agents` revival 기준

## 현재 상태

현재 legacy wrapper는 아래 성격입니다.

- `.obora/config.yaml` / `~/.obora/config.yaml`를 raw YAML write로 직접 수정
- `list/show/set/reset` 수준의 단순 config helper
- shared CLI contract 없음
- live top-level tests 없음
- current onboarding path에서 필수 surface가 아님

현재 live 대체 수단:

- `obora doctor`
- `obora models`
- `obora auth`
- `.obora/config.yaml` 직접 편집
- `agents.yaml` / runtime `agentsPath` 기반 설정

### revival을 고려해도 되는 조건

아래 조건이 동시에 성립할 때만 revival 후보로 봅니다.

1. agent override를 CLI로 자주 조작해야 하는 실제 운영 시나리오가 반복됨
   - 예: 특정 agent만 provider/model을 빠르게 전환하는 운영 작업
2. read-only introspection 이상의 product 가치가 있음
   - 단순 YAML 편집 대체를 넘어서야 함
3. config mutation이 package/helper 레벨에서 안전하게 캡슐화됨
   - CLI가 raw YAML read/write를 직접 하지 않음
4. `doctor` / `models` / `auth`와 명확히 다른 목적이 정의됨
5. onboarding 문서에 들어가도 사용자 혼동이 줄어듦

### revival 시 목표 UX

가능한 방향은 아래 2개뿐입니다.

#### A. read-only operator surface

예:

- `obora agents list`
- `obora agents show reviewer`

이 경우 목적은 “현재 resolved agent config 관찰”입니다.
설정 변경은 여전히 config file 편집이 기준일 수 있습니다.

이 방향이 유리한 조건:

- mutation UX보다 visibility 문제가 더 큼
- `doctor`보다 더 세밀한 agent-level resolution view가 필요함

#### B. safe override surface

예:

- `obora agents set reviewer --provider openai --model gpt-5.4`
- `obora agents reset reviewer`

이 경우에도 아래 조건이 필수입니다.

- project/global scope 계약 명확화
- file mutation 안전성
- conflict/merge 정책
- invalid provider/model validation
- dry-run 또는 preview 성격의 UX 검토

### revival 불가 신호

아래 중 하나라도 보이면 아직 revival 시점이 아닙니다.

- 단순히 YAML 편집을 CLI 문법으로 감싸는 정도에 그침
- `doctor` / `models` / `auth`와 역할 구분이 안 됨
- operator가 자주 쓸 실제 케이스가 없음
- config write failure / partial write / merge failure UX가 안 정리됨
- 테스트/문서까지 유지할 가치가 없음

### 결론

현재 기준으로 `agents`는 “필요하면 나중에 read-only introspection부터 여는 후보”이지, 바로 live top-level command로 복구할 대상은 아닙니다.

즉 우선순위:

1. agent config resolution visibility 필요성 확인
2. package/helper boundary 정리
3. read-only surface부터 판단
4. mutation surface는 그 다음

---

## 3. `obora dashboard` revival 기준

## 현재 상태

현재 legacy wrapper는 아래 성격입니다.

- `@obora/dashboard` 서버를 직접 띄움
- `open(...)` 호출 포함
- signal handler 내부 `process.exit(0)` 사용
- CLI가 lifecycle 세부 구현을 직접 담당
- shared CLI contract 없음
- live top-level 등록 없음

현재 package 상태:

- `@obora/dashboard`는 build/test 대상 패키지로 존재
- server/client scaffold는 있음
- dashboard history/API와 연결되는 package capability는 있음
- 하지만 `obora dashboard`는 아직 live product surface가 아님

기존 roadmap:

- `docs/plans/2026-04-15-dashboard-cli-m4-roadmap.md`

### revival을 고려해도 되는 조건

1. product에서 dashboard launcher를 실제 사용자 surface로 다시 연다는 결정이 있음
2. package가 CLI-friendly bootstrap/start/stop contract를 제공함
3. CLI는 thin operator surface만 담당함
4. dashboard를 문서/operations path에 올릴 실사용 가치가 있음
5. local browser open 보조 기능과 server availability를 분리한 UX가 정리됨

### revival 시 필수 조건

#### package 측

- bootstrap helper 존재
- start/stop contract 테스트 가능
- host/port/url/static asset 상태를 구조적으로 반환
- browser open 실패와 server launch 성공을 분리 처리 가능

#### CLI 측

- `handleCommandAction(...)`
- `getGlobalOpts(this)`
- local/root `--json`
- invalid host/port -> exit code `2`
- bootstrap/listen failure -> exit code `3`
- browser open 실패를 fatal로 볼지 warning으로 볼지 명확화
- `docs/cli.md`, `docs/current-capabilities.md`, README 반영

### revival 시 목표 UX

최소 목표는 아래 수준입니다.

- `obora dashboard`
- `obora dashboard --port 4790`
- `obora dashboard --json --no-open`
- `obora --json dashboard --port 4790`

성공 시:

- text: host, port, url, static asset 상태, browser auto-open 여부
- json: machine-readable launch metadata
- 종료: graceful shutdown

실패 시:

- invalid option은 validation error
- launch/bootstrap 문제는 execution failure
- irrelevant hint 없음

### revival 불가 신호

아래면 아직 시기상조입니다.

- dashboard package가 아직 CLI-friendly lifecycle helper를 제공하지 않음
- launcher가 여전히 wrapper script 수준임
- product가 dashboard를 package/dev tool 이상으로 보고 있지 않음
- 문서/튜토리얼/operations에 올릴 가치가 아직 약함

### 결론

현재 기준으로 `dashboard`는 “package capability는 유지, CLI revival은 M4 이후 product decision이 있을 때만”이 맞습니다.

즉 우선순위:

1. package bootstrap 분리
2. operator contract 정리
3. product launch decision
4. 그 다음 CLI live surface 등록

---

## 4. 실제 revival 체크리스트

새 surface를 열기 직전 아래 체크리스트를 모두 만족해야 합니다.

- [ ] top-level product 이유 1문장으로 설명 가능
- [ ] existing live commands와 역할 경계가 명확함
- [ ] `_legacy/*` 재등록이 아니라 새 command 구현임
- [ ] package/helper boundary가 정리됨
- [ ] local/root `--json` 계약 있음
- [ ] exit code 계약 있음
- [ ] command tests 있음
- [ ] `docs/cli.md` 반영됨
- [ ] `docs/current-capabilities.md` 반영됨
- [ ] README / tutorial / operations 반영 가치가 확인됨

하나라도 빠지면 revival보다 defer 유지가 맞습니다.

---

## 5. 현재 판단 요약

현재 판단은 아래로 고정합니다.

- `agents`
  - 즉시 revival 대상 아님
  - 필요 시 read-only introspection부터 검토
- `dashboard`
  - 즉시 revival 대상 아님
  - M4 이후 product decision + package bootstrap 정리 이후 검토

따라서 지금은 두 명령 모두 live CLI surface에 넣지 않고, 관련 package/doc/plan만 유지하는 것이 맞습니다.
