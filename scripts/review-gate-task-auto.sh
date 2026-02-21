#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  review-gate-task-auto.sh --project <name> --task-id <id> --stage <draft|done> --target <text> --scope <text> [--max-rounds 10] [--models <comma-list>]

Required env commands (from .review-gate.local.sh or shell):
  MODEL_IDS               - comma list (default: opus,codex,glm)
  MODEL_CMD_<ID_UPPER>    - command per model id, prints ONLY JSON {score,p0,p1,summary}
  Example: MODEL_CMD_OPUS, MODEL_CMD_CODEX, MODEL_CMD_GLM

Behavior:
  - Runs up to max rounds
  - Generates opus/codex/glm json each round (parallel)
  - Executes review-gate-task.sh each round
  - On FAIL, runs FIX_CMD automatically before next round
  - Stops on PASS, exits 1 if all rounds fail
EOF
}

PROJECT=""
TASK_ID=""
STAGE=""
TARGET=""
SCOPE=""
MAX_ROUNDS="10"
MODEL_IDS="${MODEL_IDS:-opus,codex,glm}"

need_value() {
  local flag="$1"; local value="${2-}"
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
    --max-rounds) need_value "$1" "${2-}"; MAX_ROUNDS="$2"; shift 2 ;;
    --models) need_value "$1" "${2-}"; MODEL_IDS="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1"; usage; exit 2 ;;
  esac
done

[[ -n "$PROJECT" && -n "$TASK_ID" && -n "$STAGE" && -n "$TARGET" && -n "$SCOPE" ]] || { usage; exit 2; }
[[ "$MAX_ROUNDS" =~ ^[1-9][0-9]*$ ]] || { echo "--max-rounds must be positive integer"; exit 2; }

if [[ -f .review-gate.local.sh ]]; then
  # shellcheck disable=SC1091
  source .review-gate.local.sh
fi

[[ "$STAGE" == "draft" || "$STAGE" == "done" ]] || { echo "--stage must be draft or done"; exit 2; }
[[ "$TASK_ID" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "--task-id must match ^[A-Za-z0-9._-]+$"; exit 2; }
[[ "$PROJECT" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "--project must match ^[A-Za-z0-9._-]+$"; exit 2; }

IFS=',' read -r -a MODELS <<< "$MODEL_IDS"
for m in "${MODELS[@]}"; do
  key="MODEL_CMD_$(echo "$m" | tr '[:lower:]-' '[:upper:]_')"
  if [[ -z "${!key:-}" ]]; then
    echo "${key} is required" >&2
    exit 2
  fi
done
: "${FIX_CMD:?FIX_CMD is required for full-auto fix loop}"

for ((round=1; round<=MAX_ROUNDS; round++)); do
  base=".review-gate/tasks/${TASK_ID}/stage-${STAGE}/round-${round}"
  mkdir -p "$base"

  echo "[Round ${round}] running model reviews (parallel)..."
  pids=()
  for m in "${MODELS[@]}"; do
    key="MODEL_CMD_$(echo "$m" | tr '[:lower:]-' '[:upper:]_')"
    cmd="${!key}"
    bash -lc "$cmd" > "$base/${m}.json" &
    pids+=("$!")
  done
  for pid in "${pids[@]}"; do
    wait "$pid"
  done

  echo "[Round ${round}] evaluating gate..."
  if bash scripts/review-gate-task.sh \
      --project "$PROJECT" \
      --task-id "$TASK_ID" \
      --stage "$STAGE" \
      --target "$TARGET" \
      --scope "$SCOPE" \
      --round "$round" \
      --models "$MODEL_IDS"; then
    echo "[PASS] task gate passed at round ${round}"
    exit 0
  fi

  echo "[FAIL] round ${round} did not pass"
  if (( round < MAX_ROUNDS )); then
    echo "[Round ${round}] applying automatic fix command..."
    if ! bash -lc "$FIX_CMD"; then
      echo "[FAIL] FIX_CMD failed at round ${round}"
      exit 1
    fi
  fi
done

echo "[FAIL] task gate failed after ${MAX_ROUNDS} rounds"
exit 1
