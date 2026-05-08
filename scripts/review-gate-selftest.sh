#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

TMP=".review-gate/selftest"
rm -rf "$TMP"
mkdir -p "$TMP"

# 1) task script rejects invalid task-id
if bash scripts/review-gate-task.sh --project haru --task-id "../../bad" --stage draft --target t --scope s >/dev/null 2>&1; then
  echo "[FAIL] expected invalid task-id to be rejected"
  exit 1
fi

# 2) review-gate shell must not depend on ripgrep
if grep -Eq '(^|[^[:alnum:]_])rg([[:space:]]|$)' scripts/review-gate.sh; then
  echo "[FAIL] review-gate.sh must not depend on rg"
  exit 1
fi

# 3) task script passes with valid 3-model JSON
mkdir -p .review-gate/tasks/SELFTEST/stage-draft/round-1
cat > .review-gate/tasks/SELFTEST/stage-draft/round-1/opus.json <<'EOF'
{"score":9.1,"p0":0,"p1":0,"summary":"ok"}
EOF
cat > .review-gate/tasks/SELFTEST/stage-draft/round-1/codex.json <<'EOF'
{"score":9.2,"p0":0,"p1":0,"summary":"ok"}
EOF
cat > .review-gate/tasks/SELFTEST/stage-draft/round-1/glm.json <<'EOF'
{"score":9.0,"p0":0,"p1":0,"summary":"ok"}
EOF

bash scripts/review-gate-task.sh --project haru --task-id SELFTEST --stage draft --target t --scope s --round 1 >/dev/null

# 4) auto script fails fast on invalid task-id before writing
if MODEL_IDS='opus,codex,glm' \
   MODEL_CMD_OPUS='echo {"score":9.1,"p0":0,"p1":0,"summary":"ok"}' \
   MODEL_CMD_CODEX='echo {"score":9.1,"p0":0,"p1":0,"summary":"ok"}' \
   MODEL_CMD_GLM='echo {"score":9.1,"p0":0,"p1":0,"summary":"ok"}' \
   FIX_CMD='echo fix' \
   bash scripts/review-gate-task-auto.sh --project haru --task-id '../../bad' --stage draft --target t --scope s --max-rounds 1 >/dev/null 2>&1; then
  echo "[FAIL] expected auto script invalid task-id rejection"
  exit 1
fi

# 5) review-gate deprecated scan respects allowlisted exact path:line matches
mkdir -p "$TMP/scan"
cat > "$TMP/scan/allowed.ts" <<'EOF'
/** @deprecated intentional compatibility shim */
export const allowed = true;
EOF
cat > "$TMP/deprecated-allowlist.txt" <<'EOF'
^\.review-gate/selftest/scan/allowed\.ts:1:
EOF
ALLOWLIST_OUTPUT=$(SCAN_PATHS='.review-gate/selftest/scan' \
  TYPECHECK_CMD='echo [skip] typecheck' \
  TEST_CMD='echo [skip] test' \
  BUILD_CMD='echo [skip] build' \
  SELFTEST_CMD='' \
  SANDBOX_SMOKE_CMD='' \
  DEPRECATED_ALLOWLIST_FILE='.review-gate/selftest/deprecated-allowlist.txt' \
  bash scripts/review-gate.sh 2>&1)
if ! grep -Fq '[OK] No deprecated signals found by pattern scan.' <<< "$ALLOWLIST_OUTPUT"; then
  echo "[FAIL] expected allowlisted deprecated match to be ignored"
  echo "$ALLOWLIST_OUTPUT"
  exit 1
fi

# 6) review-gate still warns for non-allowlisted deprecated matches in same scan scope
cat > "$TMP/scan/unlisted.ts" <<'EOF'
/** @deprecated not allowlisted */
export const unlisted = true;
EOF
WARN_OUTPUT=$(SCAN_PATHS='.review-gate/selftest/scan' \
  TYPECHECK_CMD='echo [skip] typecheck' \
  TEST_CMD='echo [skip] test' \
  BUILD_CMD='echo [skip] build' \
  SELFTEST_CMD='' \
  SANDBOX_SMOKE_CMD='' \
  DEPRECATED_ALLOWLIST_FILE='.review-gate/selftest/deprecated-allowlist.txt' \
  bash scripts/review-gate.sh 2>&1)
if ! grep -Fq '[WARN] Deprecated signals found above. Review required.' <<< "$WARN_OUTPUT"; then
  echo "[FAIL] expected non-allowlisted deprecated match to remain visible"
  echo "$WARN_OUTPUT"
  exit 1
fi
if ! grep -Fq '.review-gate/selftest/scan/unlisted.ts:1:' <<< "$WARN_OUTPUT"; then
  echo "[FAIL] expected non-allowlisted file to appear in deprecated scan output"
  echo "$WARN_OUTPUT"
  exit 1
fi

# 7) review-gate ignores generated coverage artifacts in scan roots
mkdir -p "$TMP/generated/coverage"
cat > "$TMP/generated/coverage/report.html" <<'EOF'
<span>snapshot as any</span>
EOF
COVERAGE_OUTPUT=$(SCAN_PATHS='.review-gate/selftest/generated' \
  TYPECHECK_CMD='echo [skip] typecheck' \
  TEST_CMD='echo [skip] test' \
  BUILD_CMD='echo [skip] build' \
  SELFTEST_CMD='' \
  SANDBOX_SMOKE_CMD='' \
  bash scripts/review-gate.sh 2>&1)
if ! grep -Fq '[OK] No forbidden patterns found.' <<< "$COVERAGE_OUTPUT"; then
  echo "[FAIL] expected generated coverage artifacts to be ignored"
  echo "$COVERAGE_OUTPUT"
  exit 1
fi

# 8) canonical sandbox smoke must use tracked artifacts, not ignored log files
SANDBOX_OUTPUT=$(node scripts/release/verify-canonical-sandbox-smoke.mjs 2>&1)
if ! grep -Fq '[PASS] canonical sandbox artifact smoke verified 21 sandboxes.' <<< "$SANDBOX_OUTPUT"; then
  echo "[FAIL] expected canonical sandbox artifact smoke to pass from tracked artifacts"
  echo "$SANDBOX_OUTPUT"
  exit 1
fi

echo "[PASS] review gate selftest passed"
