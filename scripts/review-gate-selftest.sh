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

# 2) task script passes with valid 3-model JSON
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

# 3) auto script fails fast on invalid task-id before writing
if MODEL_IDS='opus,codex,glm' \
   MODEL_CMD_OPUS='echo {"score":9.1,"p0":0,"p1":0,"summary":"ok"}' \
   MODEL_CMD_CODEX='echo {"score":9.1,"p0":0,"p1":0,"summary":"ok"}' \
   MODEL_CMD_GLM='echo {"score":9.1,"p0":0,"p1":0,"summary":"ok"}' \
   FIX_CMD='echo fix' \
   bash scripts/review-gate-task-auto.sh --project haru --task-id '../../bad' --stage draft --target t --scope s --max-rounds 1 >/dev/null 2>&1; then
  echo "[FAIL] expected auto script invalid task-id rejection"
  exit 1
fi

echo "[PASS] review gate selftest passed"
