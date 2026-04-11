# Tutorial Numbering Alignment Plan

> **For Hermes:** Use this plan if you decide to remove the current tutorial filename numbering conflict in `docs/tutorials`.

**Goal:** onboarding quickstart tutorials와 기존 deep walkthrough 튜토리얼의 번호 충돌을 제거하고, 문서 링크를 더 예측 가능하게 만든다.

**Architecture:** 현재 `docs/tutorials`에는 onboarding용 `01-3-minute-quickstart.md` / `02-judge-quickstart.md` / `03-quick-troubleshooting.md`와 기존 deep walkthrough용 `01-first-workflow.md` / `02-policy-and-consensus.md` / `03-custom-plugin.md`가 함께 존재한다. 가장 안전한 정리는 onboarding 번호 체계는 유지하고, 기존 deep walkthrough 문서는 숫자 prefix를 제거한 descriptive filename으로 바꾸는 것이다.

**Tech Stack:** markdown docs, repo-wide link updates, `git mv`, link verification with Python/path checks

---

## Current Conflict Summary

현재 충돌은 아래 두 축입니다.

### Onboarding path
- `docs/tutorials/01-3-minute-quickstart.md`
- `docs/tutorials/02-judge-quickstart.md`
- `docs/tutorials/03-quick-troubleshooting.md`
- `docs/tutorials/06-llm-config-auth-quickstart.md`

### Legacy deep walkthrough path
- `docs/tutorials/01-first-workflow.md`
- `docs/tutorials/02-policy-and-consensus.md`
- `docs/tutorials/03-custom-plugin.md`

문제는 아래와 같습니다.
- 파일 목록만 보면 `01/02/03`가 두 벌이라 처음 보는 사용자가 혼동하기 쉽다.
- 문서 제목 안의 "Tutorial 01/02/03"와 onboarding 숫자 순서가 섞여 인지 부하가 생긴다.
- quickstart를 기준으로 새 링크를 추가할수록 legacy 번호와 의미가 더 약해진다.

---

## Recommended Direction

onboarding 문서의 번호는 유지합니다.

이유:
- 현재 README / getting-started / tutorials index / quickstart template가 이미 이 순서를 기준으로 연결되어 있음
- first-success path가 제품 진입 표면이므로 가장 직관적인 번호를 가져가는 편이 맞음
- 새 사용자 기준으로 `01/02/03`은 quickstart 흐름에 붙어 있어야 함

legacy deep walkthrough 문서는 descriptive filename으로 정리합니다.

### Proposed rename map
- `docs/tutorials/01-first-workflow.md` -> `docs/tutorials/first-workflow.md`
- `docs/tutorials/02-policy-and-consensus.md` -> `docs/tutorials/policy-and-consensus.md`
- `docs/tutorials/03-custom-plugin.md` -> `docs/tutorials/custom-plugin.md`

제목도 함께 정리합니다.

### Proposed title adjustments
- `Tutorial 01: Your First Workflow` -> `Tutorial: First Workflow`
- `Tutorial 02: Adding Policies and Consensus` -> `Tutorial: Policy and Consensus`
- `Tutorial 03: Building a Custom Plugin` -> `Tutorial: Custom Plugin`

이렇게 하면 onboarding 숫자는 onboarding 전용, deep walkthrough는 descriptive route로 분리됩니다.

---

## Files to Update

### Rename targets
- `docs/tutorials/01-first-workflow.md`
- `docs/tutorials/02-policy-and-consensus.md`
- `docs/tutorials/03-custom-plugin.md`

### Known reference updates
- `docs/tutorials/README.md`
- `docs/tutorials/02-policy-and-consensus.md`
- `docs/tutorials/03-custom-plugin.md`
- `docs/tutorials/04-contract-first-quickstart.md`
- `docs/tutorials/01-first-workflow.md`

### Repo-level verification targets
- `README.md`
- `docs/getting-started.md`
- `packages/cli/templates/quickstart/README.md`
- `docs/plans/2026-04-09-quickstart-onboarding-roadmap.md`

주의:
- 계획 문서나 회고 문서 안의 historical reference는 꼭 rename 대상일 필요는 없음
- 하지만 broken link는 남기지 않아야 함

---

## Implementation Tasks

### Task 1: Rename legacy tutorial files

**Objective:** onboarding 문서와 충돌하는 legacy `01/02/03` 파일명을 descriptive name으로 바꾼다.

**Files:**
- Rename: `docs/tutorials/01-first-workflow.md`
- Rename: `docs/tutorials/02-policy-and-consensus.md`
- Rename: `docs/tutorials/03-custom-plugin.md`

**Steps:**
1. Run:
   `git mv docs/tutorials/01-first-workflow.md docs/tutorials/first-workflow.md`
2. Run:
   `git mv docs/tutorials/02-policy-and-consensus.md docs/tutorials/policy-and-consensus.md`
3. Run:
   `git mv docs/tutorials/03-custom-plugin.md docs/tutorials/custom-plugin.md`
4. Confirm with:
   `git status --short`

### Task 2: Update internal tutorial cross-links

**Objective:** renamed legacy docs끼리의 상호 링크를 새 경로로 맞춘다.

**Files:**
- Modify: `docs/tutorials/first-workflow.md`
- Modify: `docs/tutorials/policy-and-consensus.md`
- Modify: `docs/tutorials/custom-plugin.md`
- Modify: `docs/tutorials/04-contract-first-quickstart.md`

**Expected edits:**
- `./01-first-workflow.md` -> `./first-workflow.md`
- `./02-policy-and-consensus.md` -> `./policy-and-consensus.md`
- `./03-custom-plugin.md` -> `./custom-plugin.md`
- 문서 제목의 `Tutorial 01/02/03` 제거 또는 descriptive title로 축소

### Task 3: Update tutorials index and surrounding docs

**Objective:** tutorials index와 상위 진입 문서가 새 descriptive filename을 가리키게 한다.

**Files:**
- Modify: `docs/tutorials/README.md`
- Inspect: `README.md`
- Inspect: `docs/getting-started.md`
- Inspect: `packages/cli/templates/quickstart/README.md`

**Expected outcome:**
- onboarding start-here 영역은 그대로 유지
- deeper walkthrough 목록에서 legacy docs는 descriptive filename으로 연결
- onboarding 문서 링크는 변경 없음

### Task 4: Run repo-wide link verification

**Objective:** rename으로 인한 broken link가 없음을 확인한다.

**Commands:**
1. search references
   `search_files("01-first-workflow\.md|02-policy-and-consensus\.md|03-custom-plugin\.md", path=<repo>, file_glob="*.md")`
2. verify links with a path-check script
3. run:
   `git diff --check`

**Expected outcome:**
- old numbered legacy filenames reference가 0개이거나, historical notes 안의 plain text만 남음
- markdown link breakage 없음

### Task 5: Commit separately from onboarding content

**Objective:** numbering cleanup은 onboarding content commit과 분리된 독립 commit으로 남긴다.

**Commit message suggestion:**
- `docs: rename legacy tutorial files for clearer onboarding`

---

## Verification Checklist

- [ ] `docs/tutorials`에 `01/02/03` 충돌 쌍이 사라짐
- [ ] onboarding 문서 링크는 그대로 동작함
- [ ] legacy walkthrough 링크는 새 descriptive filename으로 이동됨
- [ ] tutorials index가 start-here vs deeper walkthrough 구분을 유지함
- [ ] `git diff --check` 통과
- [ ] link verification script 통과

---

## Non-Goals

이번 정리에서 하지 않을 것:
- validation-repair 계열 문서명 개편
- 문서 내용 전면 재작성
- README onboarding 흐름 재설계
- tutorial numbering을 전 repo에서 다시 새로 매기기

즉, 이번 작업은 numbering conflict 제거와 링크 안정화까지만 다룹니다.

---

## Final Recommendation

가장 안전한 다음 단계는 onboarding 문서 번호를 유지한 채, 기존 legacy `01/02/03` walkthrough 파일만 descriptive filename으로 바꾸는 것입니다.

이 방식이:
- 현재 onboarding 흐름을 깨지 않고
- 링크 수정 범위가 작고
- 사용자가 폴더를 볼 때 즉시 이해하기 쉬운 구조를 만듭니다.
