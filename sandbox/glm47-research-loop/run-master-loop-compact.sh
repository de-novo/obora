#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
RUN_HELPER="$REPO_ROOT/sandbox/_lib/run-obora-with-watchdog.sh"
WORKFLOW="$ROOT/workflows/00-master-research-loop-compact.yaml"
CONFIG="$ROOT/obora.config.yaml"
AGENTS="$ROOT/agents.yaml"
STATE_FILE="$ROOT/output/final/00-loop-state.md"
DECISION_FILE="$ROOT/output/final/23-loop-decision.md"
LOG_DIR="$ROOT/output/iterations/logs"
RESULT_DIR="$ROOT/output/iterations/results"
mkdir -p "$LOG_DIR" "$RESULT_DIR"

MAX_ITERATIONS="${MAX_ITERATIONS:-4}"
OBORA_TIMEOUT_MS="${OBORA_TIMEOUT_MS:-86400000}"
OBORA_IDLE_TIMEOUT_SEC="${OBORA_IDLE_TIMEOUT_SEC:-900}"
OBORA_SAFETY_TIMEOUT_SEC="${OBORA_SAFETY_TIMEOUT_SEC:-43200}"
OBORA_WATCHDOG_POLL_SEC="${OBORA_WATCHDOG_POLL_SEC:-5}"
MAX_RUN_RETRIES="${MAX_RUN_RETRIES:-6}"
INITIAL_RETRY_DELAY_SEC="${INITIAL_RETRY_DELAY_SEC:-30}"

update_state() {
  local iteration="$1"
  local status="$2"
  local next_action="$3"
  cat > "$STATE_FILE" <<EOF
# Loop State

- current_iteration: $iteration
- max_iterations: $MAX_ITERATIONS
- no_progress_count: UNKNOWN
- repeated_critical_issue_count: UNKNOWN
- status: $status
- next_action: $next_action

## Notes
- Updated by run-master-loop-compact.sh
- Compact workflow optimized for provider instability / 429 conditions.
- Runner uses idle watchdog + large safety ceiling instead of a short wall-clock timeout.
EOF
}

extract_decision_from_text() {
  local text="$1"
  local decision
  decision="$(printf '%s' "$text" | grep -Eio 'decision\s*:\s*(CONTINUE|STOP)' | head -n1 | sed -E 's/.*:\s*//I' | tr '[:lower:]' '[:upper:]' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' || true)"
  if [[ -z "$decision" ]]; then
    decision="$(printf '%s' "$text" | grep -Eio '\b(CONTINUE|STOP)\b' | head -n1 | tr '[:lower:]' '[:upper:]' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' || true)"
  fi
  [[ -n "$decision" ]] && echo "$decision" || echo "UNKNOWN"
}

extract_decision() {
  local file="$1"
  if [[ -f "$file" ]]; then
    extract_decision_from_text "$(cat "$file")"
    return 0
  fi
  if [[ -n "${LAST_RESULT_JSON:-}" && -f "$LAST_RESULT_JSON" ]]; then
    local extracted
    extracted="$(python3 - <<'PY' "$LAST_RESULT_JSON"
import json, sys
p = sys.argv[1]
obj = json.load(open(p))
text = obj.get('outputs', {}).get('review-and-finalize', '')
print(text)
PY
)"
    extract_decision_from_text "$extracted"
    return 0
  fi
  echo "MISSING"
}

is_retryable_429() {
  local log_file="$1"
  [[ -f "$log_file" ]] || return 1
  grep -qi '429 The service may be temporarily overloaded' "$log_file"
}

cd "$REPO_ROOT"
echo "[compact-loop] workflow=$WORKFLOW"

iteration=1
while (( iteration <= MAX_ITERATIONS )); do
  echo "[compact-loop] ===== iteration $iteration / $MAX_ITERATIONS ====="
  update_state "$iteration" "RUNNING" "RUN_COMPACT_WORKFLOW"

  run_log="$LOG_DIR/compact-iteration-${iteration}.log"
  run_json="$RESULT_DIR/compact-iteration-${iteration}.json"
  attempt=1
  retry_delay="$INITIAL_RETRY_DELAY_SEC"
  run_exit=0

  while (( attempt <= MAX_RUN_RETRIES )); do
    echo "[compact-loop] run attempt $attempt / $MAX_RUN_RETRIES"
    : > "$run_log"
    set +e
    "$RUN_HELPER" "$run_log" "$run_json" "$OBORA_IDLE_TIMEOUT_SEC" "$OBORA_SAFETY_TIMEOUT_SEC" "$OBORA_WATCHDOG_POLL_SEC" -- \
      node "$REPO_ROOT/bin/obora.js" run "$WORKFLOW" \
        --config "$CONFIG" \
        --agents "$AGENTS" \
        --output-dir "$RESULT_DIR" \
        --timeout "$OBORA_TIMEOUT_MS" \
        --verbose --no-color
    run_exit=$?
    set -e
    LAST_RESULT_JSON="$(ls -1t "$RESULT_DIR"/glm47-master-research-loop-compact-*.json 2>/dev/null | head -n1 || true)"

    [[ $run_exit -eq 0 ]] && break

    if is_retryable_429 "$run_log" && (( attempt < MAX_RUN_RETRIES )); then
      echo "[compact-loop] retryable 429 detected; sleeping ${retry_delay}s"
      sleep "$retry_delay"
      retry_delay=$(( retry_delay * 2 ))
      ((attempt++))
      continue
    fi
    break
  done

  if [[ $run_exit -ne 0 ]]; then
    update_state "$iteration" "FAILED" "INSPECT_RUN_LOG"
    echo "[compact-loop] workflow failed (exit=$run_exit)"
    exit $run_exit
  fi

  decision="$(extract_decision "$DECISION_FILE")"
  echo "[compact-loop] decision=$decision"
  case "$decision" in
    STOP)
      update_state "$iteration" "COMPLETED" "ARCHIVE_OR_FINISH"
      echo "[compact-loop] stop condition reached"
      exit 0
      ;;
    CONTINUE)
      update_state "$iteration" "RUNNING" "NEXT_ITERATION"
      ;;
    *)
      update_state "$iteration" "BLOCKED" "CHECK_DECISION_FILE"
      echo "[compact-loop] could not parse decision file"
      exit 2
      ;;
  esac

  ((iteration++))
done

update_state "$MAX_ITERATIONS" "STOPPED" "MAX_ITERATIONS_REACHED"
echo "[compact-loop] reached MAX_ITERATIONS without STOP"
exit 4
