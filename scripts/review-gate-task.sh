#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  review-gate-task.sh --project <name> --task-id <id> --stage <draft|done> --target <text> --scope <text> [--round <n>] [--models <comma-list>]

Behavior:
  - Creates/uses .review-gate/tasks/<task-id>/stage-<stage>/round-<n>/
  - Requires model result files:
    - opus.json
    - codex.json
    - glm.json
  - Validates PASS rule:
    score >= 9.0 && p0 == 0 && p1 == 0 for all 3 models
EOF
}

PROJECT=""
TASK_ID=""
STAGE=""
TARGET=""
SCOPE=""
ROUND="1"
MODELS="opus,codex,glm"

need_value() {
  local flag="$1"
  local value="${2-}"
  if [[ -z "$value" || "$value" == --* ]]; then
    echo "Missing value for ${flag}" >&2
    exit 2
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --project) need_value "$1" "${2-}"; PROJECT="$2"; shift 2 ;;
    --task-id) need_value "$1" "${2-}"; TASK_ID="$2"; shift 2 ;;
    --stage) need_value "$1" "${2-}"; STAGE="$2"; shift 2 ;;
    --target) need_value "$1" "${2-}"; TARGET="$2"; shift 2 ;;
    --scope) need_value "$1" "${2-}"; SCOPE="$2"; shift 2 ;;
    --round) need_value "$1" "${2-}"; ROUND="$2"; shift 2 ;;
    --models) need_value "$1" "${2-}"; MODELS="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 2 ;;
  esac
done

[[ -n "$PROJECT" && -n "$TASK_ID" && -n "$STAGE" && -n "$TARGET" && -n "$SCOPE" ]] || { usage; exit 2; }
[[ "$STAGE" == "draft" || "$STAGE" == "done" ]] || { echo "--stage must be draft or done"; exit 2; }
[[ "$TASK_ID" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "--task-id must match ^[A-Za-z0-9._-]+$"; exit 2; }
[[ "$PROJECT" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "--project must match ^[A-Za-z0-9._-]+$"; exit 2; }
[[ "$ROUND" =~ ^[1-9][0-9]*$ ]] || { echo "--round must be positive integer"; exit 2; }

BASE_DIR=".review-gate/tasks/${TASK_ID}/stage-${STAGE}/round-${ROUND}"
mkdir -p "$BASE_DIR"

META_FILE="$BASE_DIR/meta.md"
cat > "$META_FILE" <<EOF
# 3MODEL REVIEW META
- project: ${PROJECT}
- task_id: ${TASK_ID}
- stage: ${STAGE}
- target: ${TARGET}
- scope: ${SCOPE}
- round: ${ROUND}
EOF

IFS=',' read -r -a required <<< "$MODELS"
for m in "${required[@]}"; do
  f="$BASE_DIR/$m.json"
  if [[ ! -f "$f" ]]; then
    echo "[FAIL] Missing model review file: $f"
    echo "Create JSON: {\"score\":9.1,\"p0\":0,\"p1\":0,\"summary\":\"...\"}"
    exit 1
  fi
done

BASE_DIR_ENV="$BASE_DIR" MODELS_ENV="$MODELS" python3 - <<'PY'
import json, pathlib, sys, os, math
base = pathlib.Path(os.environ["BASE_DIR_ENV"])
models = [m.strip() for m in os.environ["MODELS_ENV"].split(",") if m.strip()]
fail = []
rows = []
for m in models:
    try:
        raw = (base / f"{m}.json").read_text()
        data = json.loads(raw)
    except Exception as e:
        print(f"[FAIL] invalid JSON for {m}: {e}")
        sys.exit(1)

    if not all(k in data for k in ("score", "p0", "p1")):
        print(f"[FAIL] missing required fields in {m}.json (need: score,p0,p1)")
        sys.exit(1)

    score_raw = data.get("score")
    p0_raw = data.get("p0")
    p1_raw = data.get("p1")

    if not isinstance(score_raw, (int, float)):
        print(f"[FAIL] score must be numeric in {m}.json")
        sys.exit(1)
    if not isinstance(p0_raw, int) or not isinstance(p1_raw, int):
        print(f"[FAIL] p0/p1 must be integers in {m}.json")
        sys.exit(1)

    score = float(score_raw)
    p0 = int(p0_raw)
    p1 = int(p1_raw)

    if not math.isfinite(score) or score < 0 or score > 10:
        print(f"[FAIL] score must be finite and between 0..10 in {m}.json")
        sys.exit(1)
    if p0 < 0 or p1 < 0:
        print(f"[FAIL] p0/p1 must be >= 0 in {m}.json")
        sys.exit(1)

    ok = score >= 9.0 and p0 == 0 and p1 == 0
    rows.append((m, score, p0, p1, ok))
    if not ok:
        fail.append(m)

out = ["# MODEL REVIEW RESULT", "| model | score | p0 | p1 | pass |", "|---|---:|---:|---:|---|"]
for m,s,p0,p1,ok in rows:
    out.append(f"| {m} | {s:.2f} | {p0} | {p1} | {'PASS' if ok else 'FAIL'} |")

status = "PASS" if not fail else "FAIL"
out.append("")
out.append(f"- decision: {status}")
(base / "result.md").write_text("\n".join(out))

print("\n".join(out))
if fail:
    sys.exit(1)
PY

echo "[PASS] model task gate passed: $BASE_DIR/result.md"
