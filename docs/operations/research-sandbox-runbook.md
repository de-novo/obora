# Research Sandbox Runbook

> Last updated: 2026-03-15

## Scope

This runbook covers the two research-loop sandboxes that are currently treated as supported execution targets:

- `sandbox/glm47-research-loop`
- `sandbox/math-proof-loop`

Despite the historical name, `glm47-research-loop` is now operated with **GLM-5**.

---

## What this runbook fixes

The recent failures were not primarily model-quality issues. They came from execution contracts drifting in four places:

1. workflow paths writing outside the sandbox
2. review gates being stricter/heavier than the loop needed
3. runner scripts expecting a local decision file only
4. runtime warning noise hiding the real failure signal

This runbook records the operating rules that kept both sandboxes running successfully end-to-end.

---

## Current known-good state

### GLM research loop
- model family: `glm-5`
- runner: `sandbox/glm47-research-loop/run-master-loop-compact.sh`
- successful termination pattern:
  - `review-and-finalize` completes
  - `archive-or-deferral` completes
  - loop decision resolves to `STOP`
  - `output/final/00-loop-state.md` ends in `status: COMPLETED`

### Math proof loop
- model family: `glm-5`
- runner: `sandbox/math-proof-loop/run-math-proof-loop.sh`
- successful termination pattern:
  - `problem-frame` → `known-results-audit` → `lemma-and-proof-attempt` → `counterexample-check` → `review-and-finalize` → `archive-packaging`
  - sandbox-local archive bundle `40~45` is generated under `sandbox/math-proof-loop/output/archive/`

---

## Operating rules

### 1. All workflow I/O must stay inside the sandbox

**Rule:** workflow `Read` / `Write` paths must point to sandbox-local paths only.

Good:
- `/Users/denovo/workspace/github/obora-kit/sandbox/glm47-research-loop/input/...`
- `/Users/denovo/workspace/github/obora-kit/sandbox/glm47-research-loop/output/...`
- `/Users/denovo/workspace/github/obora-kit/sandbox/math-proof-loop/output/...`

Bad:
- `output/...` when that resolves to repo top-level output
- mixed use of sandbox output + repo top-level output in one workflow

**Why:** relative paths previously leaked into repo top-level `output/` and produced misleading success/failure signals.

---

### 2. Top-level `output/` is not a sandbox runtime target

Top-level `output/` is treated as archive/curation space, not as live runtime workspace for these sandboxes.

If a sandbox run writes there, treat it as a routing bug and clean it up.

---

### 3. Research review should default to bounded-stop, not perfection gating

For research/proof loops, the final review should not require a perfect result before allowing stop.

Preferred policy:
- allow `PASS_WITH_LIMITATIONS`
- allow `unresolved` / `partially_supported` when the result is coherent and archiveable
- continue only when a real `P0` blocker prevents even a bounded conclusion

This is especially important for:
- open-ended research loops
- proof exploration loops
- archive-oriented synthesis workflows

---

### 4. Use single-reviewer finalization unless consensus is clearly needed

`review-and-finalize` should default to a single reviewer unless there is a strong reason to require consensus.

**Why:** the repeated production failures came from:
- consensus timeout
- consensus rejection
- consensus cost/runtime expansion

Single-reviewer finalization with explicit blocker classification was more reliable and still produced usable archive outputs.

---

### 5. Runner scripts must support decision fallback from result JSON

For decision-driven loops, the runner must not depend only on a local markdown file like:
- `output/final/23-loop-decision.md`

Required behavior:
1. read the decision file if present
2. otherwise read the latest `results/*.json`
3. extract the `review-and-finalize` output
4. parse `decision: STOP|CONTINUE`
5. trim leading/trailing whitespace before case matching

**Why:** a completed workflow can still appear blocked if the decision contract lives only inside the result artifact.

---

### 6. Timeout policy must match the loop shape

Recommended baseline:

#### GLM research loop
- review step timeout: up to `600000ms`
- consensus timeout: only if consensus exists; otherwise remove it
- whole runner timeout: large enough to survive review + archive packaging

#### Math proof loop
- whole runner timeout must cover archive packaging, not just proof generation
- current known-good runner default is larger than the prior `900000ms` ceiling used during failures

If the last step is `archive-packaging`, budget for it explicitly.

---

### 7. Separate durable artifacts from volatile execution noise

Keep in git when useful:
- workflow YAML
- runner scripts
- `agents.yaml`
- `obora.config.yaml`
- curated `output/final/*.md`
- curated `output/archive/*.md`

Usually ignore:
- raw logs
- transient iteration result caches
- loop state files that change every run unless they are intentionally versioned

---

## Known-good execution commands

Run from repo root:

```bash
./sandbox/glm47-research-loop/run-master-loop-compact.sh
./sandbox/math-proof-loop/run-math-proof-loop.sh
```

After a run, check:

```bash
# GLM loop
cat sandbox/glm47-research-loop/output/final/00-loop-state.md

# Math proof archive
find sandbox/math-proof-loop/output/archive -maxdepth 1 -type f | sort
```

---

## Recovery checklist when a run fails

### A. If outputs appear under repo top-level `output/`
1. stop the run
2. inspect workflow paths for relative `output/...` or `input/...`
3. rewrite them to sandbox-local absolute paths
4. clean top-level pollution before re-running

### B. If review times out
1. inspect whether final step is consensus-based
2. reduce participants or remove consensus
3. allow bounded-stop review outcomes
4. increase step/runner timeout only after step design is sane

### C. If runner says decision file missing
1. inspect latest `output/iterations/results/*.json`
2. verify `review-and-finalize` output contains `decision: STOP|CONTINUE`
3. verify runner fallback is enabled
4. verify parser trims whitespace before matching

### D. If math proof reaches review but dies before archive
1. inspect total runner timeout
2. confirm `archive-packaging` writes only to `sandbox/math-proof-loop/output/archive/`
3. re-run with full timeout budget that includes packaging

---

## Regression tests to add next

### P1 — runner/workflow contract
1. **GLM decision fallback test**
   - if `23-loop-decision.md` is missing
   - runner must parse `decision: STOP` from latest result JSON
   - whitespace around `STOP` must not break matching

2. **Sandbox path confinement test (GLM)**
   - running the workflow must not create or overwrite repo top-level `output/final` or `output/iterations`

3. **Sandbox path confinement test (math-proof)**
   - all final/archive outputs must land under `sandbox/math-proof-loop/output/**`

### P1 — review semantics
4. **bounded-stop review test**
   - review may return archiveable unresolved/partial output
   - runner must still stop when no P0 blocker exists

5. **single-reviewer finalization test**
   - final review should succeed without consensus wiring
   - regression guard against reintroducing mandatory consensus by accident

### P2 — runtime noise control
6. **pricing warning warn-once test**
   - repeated calls with the same unknown model should emit at most one warning per tracker instance

7. **blackboard direct-write warn suppression test**
   - test environment should not spam deprecation warnings
   - runtime/cli integration suites should remain green

---

## Verification checklist before pushing sandbox changes

- [ ] both sandboxes still resolve to `glm-5`
- [ ] workflow paths are sandbox-local only
- [ ] no new top-level `output/final` or `output/iterations` pollution exists
- [ ] GLM runner reaches `decision: STOP|CONTINUE`
- [ ] math-proof archive `40~45` is regenerated successfully if the workflow was touched
- [ ] `git status` does not include accidental root-level output pollution
- [ ] review gate / tests / build still pass

---

## Notes

- The sandbox names are historical; execution policy matters more than directory name.
- If a future loop really needs consensus, add it back intentionally and budget for it explicitly.
- Prefer debuggable contracts over implicit conventions: explicit paths, explicit stop semantics, explicit archive outputs.
