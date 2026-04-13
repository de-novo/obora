# Obora Repository Legacy Cleanup Plan

> For Hermes: execute only after preserving intended changes and confirming deletion scope. Do not push or delete remote branches without approval.

Goal: obora-kit 저장소에서 실험 부산물, 로컬 아티팩트, 병합 완료 브랜치 잔재, 추적되면 안 되는 배포 산출물을 분리해 워킹트리를 다시 예측 가능하게 만든다.

Architecture: 먼저 GitHub 상태와 로컬 변경을 분리해서 본다. 그 다음 "보존할 의도된 변경"과 "삭제할 생성물/레거시"를 분류한다. 마지막으로 ignore 규칙, 정리 스크립트, 브랜치 정책을 적용해 재오염을 막는다.

Tech Stack: git, gh CLI, pnpm, Node.js, TypeScript, shell cleanup, .gitignore 관리

---

## Current Observations

- 기준 저장소: `/Users/denovo/workspace/github/obora-kit`
- origin: `git@github.com:de-novo/obora.git`
- upstream: `git@github.com:obora-labs/obora-kit.git`
- open issue: `#3 Runtime: resolve judgment-gate TypeScript errors in recovery/policy/plugin/storage`
- open PR: 없음
- merged PR:
  - `#5 cleanup(runtime): remove legacy duckdb database module`
  - `#1 feat: improve contract-first judge runtime DX`
- 현재 checkout 브랜치: `cleanup/remove-runtime-legacy-surface`
- `origin/main`은 두 merge commit을 포함하고 있고, 현재 로컬 `main`은 뒤처져 있음
- typecheck: 통과 (`pnpm typecheck`)
- `scripts/ci/judgment-gate.sh`는 현재 `set -e`와 `((PASS++))` 조합 때문에 첫 성공 단계 후 조기 종료되는 스크립트 버그가 있음

### Dirty State Summary

- tracked modified: 11개
  - `experiments/*`: 9개
  - `packages/*`: 2개
- untracked: 78개
  - `experiments/*`: 35개
  - root 파일: 23개
  - `output/*`: 14개
  - `.obora*`, `.bench-workspaces`, `.sandbox/*` 다수
- 큰 로컬 산출물:
  - `.bench-workspaces/` ≈ 306M
  - `.sandbox/` ≈ 207M
  - `output/` ≈ 244K
  - `experiments/swe-bench-harness/results-*` 다수

### Likely Cleanup Buckets

1. 완전 생성물
- `.bench-workspaces/`
- `.obora-debug/`
- `output/`
- `experiments/swe-bench-harness/results-*/`
- `experiments/swe-bench-harness/pytest-eval/`
- `experiments/swe-bench-harness/.obora/`
- `.sandbox/01-hello-world/.obora-debug/`

2. 일회성 로컬 분석/패치 파일
- 루트의 `*.patch`, `tmp_*.py`, `count_*.py`, `show_*.py`, `run_validation.mjs`, `solution.js`, `hello.txt` 등

3. 당시 검토 필요 tracked 파일
- `packages/adapters/src/llm/pi-ai-adapter.ts`
- `packages/cli/obora-cli-0.1.3.tgz` (현재는 제거 완료)
- `experiments/obora-harnesses/*` (현재는 별도 harness repo bootstrap 초안으로 제거 완료)
- `experiments/swe-bench-harness/run_repair_experiment.sh`
- `experiments/swe-bench-harness/samples/*.json`

4. 정책/구조 개선 필요 항목
- `.gitignore`에 swe-bench 결과물과 루트 scratch 파일 패턴이 충분히 반영되지 않음
- 배포 tarball(`packages/cli/obora-cli-0.1.3.tgz`)이 추적 중이라 재오염 위험이 높았음 → 현재 제거 및 `.gitignore` 반영 완료
- 병합 완료 브랜치에서 계속 작업 중이라 상태 인지가 흐려짐

---

## Phase 1: Freeze and Classify

### Task 1: 로컬 변경을 보존 후보와 삭제 후보로 분리

Objective: 의도된 코드/문서 수정이 삭제 대상과 섞이지 않게 한다.

Files:
- Review only: `git status --short`
- Review only: `git diff --stat`

Steps:
1. tracked modified 11개를 파일별로 `keep / discard / decide`로 표기한다.
2. 특히 아래는 우선 수동 판정한다.
   - `packages/adapters/src/llm/pi-ai-adapter.ts`
   - `packages/cli/obora-cli-0.1.3.tgz` (정책 확정으로 제거 완료)
   - `experiments/obora-harnesses/**/*.md` (정책 확정으로 제거 완료)
   - `experiments/swe-bench-harness/samples/*.json`
3. untracked 78개는 경로 prefix 기준으로 일괄 후보를 만든다.

Verification:
- 삭제 전에 "보존 대상 목록"과 "즉시 삭제 가능 목록"이 분리돼 있어야 한다.

### Task 2: 현재 브랜치 기준선 정리

Objective: 병합 완료 브랜치에서 계속 정리 작업하는 혼선을 제거한다.

Steps:
1. `origin/main` 기준 최신 커밋 상태를 재확인한다.
2. 정리 작업은 새 브랜치 `cleanup/repo-hygiene` 또는 `chore/repo-cleanup`에서 수행한다.
3. 현재 `cleanup/remove-runtime-legacy-surface` 브랜치는 병합 완료 브랜치로 간주하고 작업 기준선에서 제외한다.

Verification:
- 새 정리 브랜치가 `origin/main`에서 분기되어야 한다.

---

## Phase 2: Remove Generated Artifacts

### Task 3: 즉시 삭제 가능한 생성물 제거

Objective: 재생성 가능한 아티팩트를 먼저 제거해 노이즈를 크게 줄인다.

Files to remove:
- `.bench-workspaces/`
- `.obora-debug/`
- `output/`
- `experiments/swe-bench-harness/results-fair/`
- `experiments/swe-bench-harness/results-obora-repair/`
- `experiments/swe-bench-harness/results-repair/`
- `experiments/swe-bench-harness/results-sandbox/`
- `experiments/swe-bench-harness/results-with-repair/`
- `experiments/swe-bench-harness/pytest-eval/`
- `experiments/swe-bench-harness/.obora/`
- `.sandbox/01-hello-world/.obora-debug/`

Steps:
1. 각 경로가 generated artifact인지 최종 확인한다.
2. 삭제 후 `git status --short`로 diff 감소를 확인한다.
3. 대용량 경로(`.bench-workspaces`, `.sandbox`)는 삭제 전 사용자 승인 범위에 포함한다.

Verification:
- untracked 대다수가 사라져야 한다.
- 필요한 실행 입력 파일은 남아 있어야 한다.

### Task 4: 루트 scratch 파일 정리

Objective: 루트 폴더를 저장소 파일만 남도록 복원한다.

Delete candidates:
- `.corrected.patch`
- `.final_separability.patch`
- `.patch`
- `.repaired.patch`
- `.get_lines.py`, `.get_rst_lines.py`
- `count_lines.py`, `count_rst_lines.py`
- `find_lines.py`, `get_line_numbers.py`
- `show_rst.py`, `show_rst_sections.py`
- `tmp_count_lines.py`, `tmp_find_django.py`, `tmp_test_issue.py`
- `.test_issue.py`, `.test_runner.sh`, `.test_separability.py`
- `run_validation.mjs`, `validate.mjs`, `solution.js`, `hello.txt`

Steps:
1. 파일이 docs/examples/scripts 어느 곳에서도 참조되지 않는지 확인한다.
2. 모두 untracked 임을 확인한 뒤 일괄 제거한다.

Verification:
- 루트에는 프로젝트 고정 파일만 남아야 한다.

---

## Phase 3: Decide What Should Be Versioned

### Task 5: `packages/cli/obora-cli-0.1.3.tgz` 정책 결정

Objective: publish tarball을 repo에 계속 둘지 제거할지 결정한다.

Status:
- 결정 완료: `packages/cli/*.tgz`는 repo에서 추적하지 않는다.
- 조치 완료: tracked tarball 제거, `.gitignore`에 `packages/cli/*.tgz` 추가.
- release 검증은 temp `pnpm pack --pack-destination` 기반 selftest로 대체되었다.

Decision rule:
- 릴리즈 검증 산출물일 뿐이면 git tracking에서 제거하고 `.gitignore` 또는 release artifact 경로로 이동한다.
- 실제 제품 배포 체인에서 반드시 버전 고정 파일로 써야 하는 특별한 이유가 없으면 repo 추적 대상에서 제외한다.

Verification:
- tarball 정책이 release script와 `.gitignore`에 일관되게 반영되어야 한다.

### Task 6: `experiments/swe-bench-harness`의 versioned asset 범위 확정

Objective: harness 입력/워크플로/스크립트와 결과물의 경계를 명확히 한다.

Status:
- 결정 완료: `experiments/swe-bench-harness/samples/*.json`는 실험 부산물이 아니라 versioned fixture로 유지한다.
- 결정 완료: `experiments/swe-bench-harness/results*`와 `pytest-results/`는 tracked benchmark evidence가 아니라 generated output으로 취급한다.
- 조치 완료: tracked `results/`, `results-lite/`, `results-lite-full/` 제거 + `.gitignore`에 results/pytest 패턴 추가.
- 근거:
  - `run_pytest.sh`, `run_pytest_all.sh`, `run_pytest_full.sh`가 `samples/*.json`를 직접 입력으로 읽는다.
  - `workflows/sample-*.yaml`, `workflows/swe-bench-universal.yaml`가 특정 sample JSON 경로를 고정 참조한다.
  - `samples/metadata.json`가 현재 검증 대상인 verified 10-sample subset을 고정한다.
  - 반면 `results*`는 `run_lite.sh`, `run_300_patches.sh`, `run_repair_experiment.sh` 등이 생성하는 출력 경로이며, `patch.diff`/로그/obora JSON은 재실행으로 다시 만들 수 있다.
  - `run_pytest_full.sh` 등은 기존 결과를 입력으로 소비하지만, 그것은 "체크인된 정적 fixture"가 아니라 직전 benchmark run의 산출물을 대상으로 한 후속 검증 단계다.

Keep likely:
- `workflows/*.yaml`
- `agents-anthropic.yaml`
- `compare_*.py`
- `prepare_samples.sh`
- `run_*.sh`, `run_*.ts`, `run_*.mjs` 중 재사용 스크립트
- `samples/*.json` + `samples/metadata.json` (verified fixture)
- `samples-no-answer/`가 fixture면 유지

Discard likely:
- `results-*/`
- `results/`
- `pytest-results/`
- `pytest-eval/`
- 로컬 `.obora/`
- 실행 로그/patch 산출물

Verification:
- 재현 가능한 입력만 추적되고, 실행 결과는 추적되지 않아야 한다.
- `samples/*.json`는 스크립트/워크플로가 직접 소비하는 fixture로 남아 있어야 한다.
- `results*`와 `pytest-results/`는 rerun 시 생성되지만 git tracking 대상은 아니어야 한다.

### Task 7: `experiments/obora-harnesses` 문서 드리프트 판단

Objective: 실험 문서 갱신인지 임시 메모인지 구분한다.

Status:
- 결정 완료: `experiments/obora-harnesses/`는 obora-kit 안에 유지할 문서 자산이 아니라, 별도 harness repository bootstrap 초안으로 보고 제거한다.
- 조치 완료: placeholder/초안 성격의 `experiments/obora-harnesses/` 전체 삭제.
- 근거:
  - 현재 repo 내부 참조가 사실상 없고 cleanup plan 외에는 소비처가 없다.
  - `repository-scope.md`, `artifact-governance.md`, `evaluation-methodology.md`, `failure-buckets.md`, `runtime-stability.md`는 3줄 placeholder 수준의 스텁이다.
  - `README.md`, `operating-defaults.md`, `harnesses/swe-bench/README.md`도 "dedicated harness repository"를 전제로 한 bootstrap draft로, obora-kit product docs라기보다 별도 레포 설계 메모에 가깝다.
  - 현재 운영 원칙상 harness 작업은 별도 레포에서 진행하고, obora-kit에는 core runtime/SDK/CLI와 직접 연결된 문서만 남긴다.

Verification:
- `experiments/obora-harnesses/`가 repo에서 제거되고, 같은 내용의 중복 문서가 남지 않아야 한다.

---

## Phase 4: Prevent Recontamination

### Task 8: `.gitignore` 강화

Objective: 동일한 generated artifact가 다시 쌓여도 워킹트리를 오염시키지 않게 한다.

Files:
- Modify: `.gitignore`

Add candidate patterns:
- `.bench-workspaces/`
- `.obora-debug/`
- `output/`
- `*.patch` (단, 저장소 루트 scratch 용도일 때만)
- `tmp_*.py`
- `count_*.py`
- `show_*.py`
- `experiments/swe-bench-harness/results-*/`
- `experiments/swe-bench-harness/pytest-eval/`
- `experiments/swe-bench-harness/.obora/`
- `packages/cli/*.tgz` (완료)

Verification:
- 동일 실험을 다시 실행해도 generated artifact가 기본적으로 untracked 노이즈를 만들지 않아야 한다.

### Task 9: 실험 출력 위치 표준화

Objective: 실험 결과가 repo root나 tracked 디렉토리에 흩어지지 않게 한다.

Approach:
- 결과물은 `.temp/`, `.bench-workspaces/`, 또는 repo 밖 경로로 통일한다.
- harness script 인자에 output dir를 강제한다.
- 필요 시 `scripts/cleanup-experiment-artifacts.sh` 추가.

Verification:
- swe-bench 관련 스크립트가 고정된 artifact 경로 정책을 따르게 된다.

---

## Phase 5: Validate and Normalize Git State

### Task 10: 정리 후 검증

Objective: 저장소가 다시 작업 가능한 기준선으로 돌아왔는지 확인한다.

Run:
- `git status --short`
- `pnpm typecheck`
- 필요 시 `pnpm test` 또는 관련 package 단위 검증

Expected:
- 의도된 변경만 남는다.
- 불필요한 untracked/generated artifact가 제거된다.
- typecheck가 계속 통과한다.

### Task 11: 브랜치/PR 후속 조치

Objective: GitHub 상태를 로컬과 다시 일치시킨다.

Steps:
1. 로컬 `main`을 `origin/main`에 맞춘다.
2. 정리 작업을 별도 cleanup 브랜치에 커밋한다.
3. 필요 시 새 PR을 열어 "repo hygiene / artifact cleanup" 범위로 제출한다.
4. 병합 완료된 오래된 로컬 브랜치는 승인 후 정리한다.

Verification:
- `main`이 최신 origin 기준선과 맞아야 한다.
- cleanup 작업 범위가 독립된 PR로 설명 가능해야 한다.

---

## Recommended Execution Order

1. 보존/삭제 분류
2. `origin/main` 기반 새 cleanup 브랜치 생성
3. generated artifact 삭제
4. 루트 scratch 파일 삭제
5. tracked 경계 파일(`.tgz`, harness docs/scripts, samples`) 정책 확정 (`packages/cli/*.tgz`, `experiments/swe-bench-harness/samples/*.json`는 완료)
6. `.gitignore` 보강
7. typecheck 재검증
8. 필요 시 cleanup PR 생성

## Immediate Decisions Needed

1. `packages/cli/obora-cli-0.1.3.tgz`를 repo에서 계속 추적할지 (완료: 추적 안 함)
2. `experiments/swe-bench-harness/samples/*.json` 수정은 fixture 개선인지 실험 부산물인지 (완료: versioned fixture로 유지)
3. `experiments/swe-bench-harness/results*`와 `pytest-results/`를 repo에서 계속 추적할지 (완료: generated output으로 제거)
4. `experiments/obora-harnesses-*.md` 5개는 문서 분리본으로 승격할지 임시 export로 삭제할지 (완료: 별도 harness repo bootstrap 초안으로 제거)
5. `.bench-workspaces/`와 `.sandbox/` 전체 삭제를 지금 바로 해도 되는지
