# Metadata, Legacy Baseline, and Operator UX Cleanup Plan

> **For Hermes:** Use this as the execution order for the current Obora cleanup push. Keep changes small, verify each slice, and commit frequently.

**Goal:** 일주일 안에 Obora repo의 이름/메타데이터 mismatch를 걷어내고, deferred/live baseline 문서를 더 단단히 묶은 뒤, `doctor` / `status` / `runs` 주변 operator UX contract drift를 순차 정리합니다.

**Architecture:** 두 트랙으로 나눕니다. Track A는 product-facing metadata/docs/legacy baseline 정리, Track B는 live operator command(`doctor`, `status`, `runs`) contract 재감사입니다. Track A가 support boundary를 고정해 주고, Track B가 실제 operator UX를 안정화합니다.

**Tech Stack:** `package.json`, markdown docs, `packages/cli`, Vitest, turbo build, pre-push review gate

---

## Current findings snapshot

### A. metadata / naming / repo URL

이미 정리한 것:
- root/package/dashboard repo metadata를 `de-novo/obora` 기준으로 정리
- root stale actor scripts 제거
- `CONTRIBUTING.md`의 Node 18 -> 20 정리
- `docs/getting-started.md`의 `cd obora` 정리
- active docs의 `obora-kit` product naming을 `Obora` 기준으로 정리 시작

아직 남아 있는 것:
- historical plan / queue / archive 문서에는 old repo / old package naming 흔적이 남아 있음
- 이 영역은 product-facing docs와 분리해서 "historical baseline"으로 다뤄야 함

### B. deferred/live baseline docs

현재 baseline 문서:
- `docs/current-capabilities.md`
- `docs/support-scope.md`
- `docs/operator-guide.md`
- `docs/legacy-cli-surface-audit.md`
- `docs/deferred-surface-revival-criteria.md`

이미 존재하는 가드:
- `packages/cli/src/commands/__tests__/cli-commands.test.ts`
  - `new` / `done` / `skills` / `dashboard` 미등록 가드
- `packages/cli/src/commands/__tests__/legacy-shim-boundary.test.ts`
  - deferred command shim 유지 가드

추가로 필요한 것:
- 문서 간 cross-link를 더 명시적으로 유지
- historical 문서에 "current baseline 아님" 표시를 필요한 곳에만 최소 보강

### C. operator UX drift 후보

현재 상태 확인 결과:
- `status.ts`는 modern contract (`handleCommandAction`, `getGlobalOpts`, root/local json`)를 이미 따름
- `runs.ts`도 modern contract를 따르며 `list` / `inspect`에 JSON propagation이 있음
- `doctor`는 최근 drift guidance work가 많이 들어가 있어, 다음 점검은 bugfix보다 "contract completeness / docs / hint quality" 재감사가 맞음

즉 다음 UX 작업은 신규 구현보다 재감사 성격으로 접근해야 함.

---

## Execution order

1. Track A1 — product-facing metadata/docs 마무리
2. Track A2 — historical docs 최소 분류 정리
3. Track A3 — deferred/live baseline 문서 cross-link 고정
4. Track B1 — `doctor` contract/doc/test 재감사
5. Track B2 — `status` contract/doc/test 재감사
6. Track B3 — `runs` / `inspect` contract/doc/test 재감사
7. push

---

## Track A — Metadata / legacy cleanup

### Task A1: active docs and package metadata finish pass

**Objective:** 현재 사용자에게 직접 보이는 surface에서 이름/repo/Node mismatch를 모두 제거합니다.

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/getting-started.md`
- Modify: `docs/current-capabilities.md`
- Modify: `docs/support-scope.md`
- Modify: `docs/operator-guide.md`
- Modify: `docs/positioning.md`
- Modify: `package.json`
- Modify: `packages/dashboard/package.json`
- Check: `packages/cli/README.md`
- Check: `packages/sdk/README.md`
- Check: `packages/cli/templates/quickstart/README.md`

**Verification:**
```bash
python - <<'PY'
from pathlib import Path
root = Path('/Users/denovo/workspace/github/obora-kit')
needles = ['obora-labs/obora-kit', 'Node.js 18+', 'Contributing to Obora Kit', 'cd obora-kit']
for needle in needles:
    print('\n##', needle)
    for path in root.rglob('*.md'):
        if 'archive/' in str(path) or 'queue/' in str(path):
            continue
        text = path.read_text(errors='ignore')
        if needle in text:
            print(path)
PY
pnpm build
git diff --check
```

### Task A2: historical docs classification pass

**Objective:** historical plan/queue/archive 문서는 현재 기준이 아님을 드러내되, 과거 기록 자체는 지우지 않습니다.

**Files:**
- Modify: `docs/plans/2026-04-08-legacy-cleanup-plan.md`
- Optional modify: currently referenced historical docs only

**Rule:**
- old `origin/upstream` 기록은 historical note로 유지 가능
- product-facing truth와 충돌하면 문서 상단에 한 줄 note 추가
  - example: `This document records historical cleanup context and is not the current product/support baseline.`

**Verification:**
- affected historical docs only
- no mass rewrite of `queue/` or `archive/`

### Task A3: baseline doc cross-link hardening

**Objective:** deferred/live boundary 문서들이 서로를 기준 문서로 명시하게 만듭니다.

**Files:**
- Modify: `docs/current-capabilities.md`
- Modify: `docs/support-scope.md`
- Modify: `docs/operator-guide.md`
- Modify: `docs/legacy-cli-surface-audit.md`
- Modify: `docs/deferred-surface-revival-criteria.md`

**Must ensure:**
- `current-capabilities` -> `support-scope`, `operator-guide`, `legacy audit`, `deferred criteria`
- `support-scope` -> `current-capabilities`, `operator-guide`, `legacy audit`, `deferred criteria`
- `operator-guide` -> `support-scope`, `current-capabilities`, `legacy audit`, `deferred criteria`
- `legacy audit` -> `current-capabilities`, `support-scope`, `operator-guide`, `deferred criteria`
- `deferred criteria` -> at least `support-scope` or `legacy audit` from summary section

**Verification:**
```bash
rg -n "current-capabilities|support-scope|operator-guide|legacy-cli-surface-audit|deferred-surface-revival-criteria" docs/*.md
```

---

## Track B — Operator UX contract drift audit

### Task B1: doctor audit

**Objective:** `doctor`의 현재 behavior, docs, tests가 완전히 같은 계약을 설명하는지 다시 고정합니다.

**Files:**
- Inspect: `packages/cli/src/commands/doctor.ts`
- Inspect: `packages/cli/src/commands/doctor-shared.ts`
- Inspect: `packages/cli/src/commands/__tests__/doctor.test.ts`
- Inspect: `packages/cli/src/commands/__tests__/doctor-contract.test.ts`
- Inspect: `packages/cli/src/commands/__tests__/quickstart-e2e.test.ts`
- Inspect: `docs/cli.md`
- Inspect: `docs/operator-guide.md`
- Inspect: `packages/cli/README.md`

**Audit checklist:**
- root/local `--json` examples both documented
- quickstart project guidance order matches reality
- generic project guidance stays `run <workflow.yaml>` when no `judge.yaml`
- drift warnings / next actions in docs match actual output contract
- no stale mention that `doctor` only checks auth/config

**Potential output:**
- docs-only patch or missing regression test patch

### Task B2: status audit

**Objective:** `status`가 "persisted runs + DLQ overview"라는 현재 UX를 docs/tests에서 정확히 고정하는지 확인합니다.

**Files:**
- Inspect: `packages/cli/src/commands/status.ts`
- Inspect: `packages/cli/src/commands/__tests__/status.test.ts`
- Inspect: `docs/cli.md`
- Inspect: `docs/current-capabilities.md`
- Inspect: `docs/operator-guide.md`

**Audit checklist:**
- root/local `--json` examples documented
- `--workflow`, `--limit` validation/exit-code tests 충분한지 확인
- docs가 old feature-status 의미로 말하지 않는지 확인
- operator guide examples와 text output semantics가 어긋나지 않는지 확인

### Task B3: runs + inspect audit

**Objective:** `runs`와 top-level alias `inspect`가 operator entry point로서 docs/tests contract가 일관적인지 확인합니다.

**Files:**
- Inspect: `packages/cli/src/commands/runs.ts`
- Inspect: `packages/cli/src/commands/__tests__/runs.test.ts`
- Inspect: `packages/cli/src/commands/__tests__/inspect-alias.test.ts`
- Inspect: `packages/cli/src/commands/__tests__/cli-commands.test.ts`
- Inspect: `docs/cli.md`
- Inspect: `docs/operator-guide.md`

**Audit checklist:**
- `runs list` / `inspect` root/local json examples documented
- invalid filter / invalid numeric option coverage sufficient
- `inspect` alias docs are discoverable from operator docs
- persisted run / repair-loop / linked DLQ semantics in docs match output

---

## Commit strategy

1. `docs: finish active metadata cleanup`
2. `docs: mark historical cleanup baselines`
3. `docs: tighten deferred baseline cross-links`
4. `docs(cli): audit doctor operator docs` or `test(cli): pin doctor contract docs`
5. `docs(cli): audit status operator docs`
6. `docs(cli): audit runs operator docs`

---

## Recommended immediate next move

바로 다음은 Track A2 + A3를 짧게 끝내는 것이 가장 효율적입니다.
그 다음에 Track B를 `doctor -> status -> runs` 순서로 들어가면 됩니다.

이 순서가 좋은 이유:
- legacy/deferred boundary를 먼저 고정하면 이후 UX audit에서 scope ambiguity가 줄어듭니다.
- `doctor`는 onboarding 영향이 커서 먼저 보는 편이 리스크가 낮습니다.
- `status`와 `runs`는 operator-facing persisted surface라 그 다음으로 묶기 좋습니다.
