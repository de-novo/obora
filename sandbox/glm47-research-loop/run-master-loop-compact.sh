#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
WORKFLOW="$ROOT/workflows/00-master-research-loop-compact.yaml"
CONFIG="$ROOT/obora.config.yaml"
AGENTS="$ROOT/agents.yaml"
STATE_FILE="$ROOT/output/final/00-loop-state.md"
DECISION_FILE="$ROOT/output/final/23-loop-decision.md"
LOG_DIR="$ROOT/output/iterations/logs"
RESULT_DIR="$ROOT/output/iterations/results"
mkdir -p "$LOG_DIR" "$RESULT_DIR"

MAX_ITERATIONS="${MAX_ITERATIONS:-4}"
OBORA_TIMEOUT_MS="${OBORA_TIMEOUT_MS:-180000}"
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
EOF
}

extract_decision() {
  local file="$1"
  [[ -f "$file" ]] || { echo "MISSING"; return 0; }
  local decision
  decision="$(grep -Eio 'decision\s*:\s*(CONTINUE|STOP)' "$file" | head -n1 | sed -E 's/.*:\s*//I' | tr '[:lower:]' '[:upper:]' || true)"
  if [[ -z "$decision" ]]; then
    decision="$(grep -Eio '\b(CONTINUE|STOP)\b' "$file" | head -n1 | tr '[:lower:]' '[:upper:]' || true)"
  fi
  [[ -n "$decision" ]] && echo "$decision" || echo "UNKNOWN"
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
    node "$REPO_ROOT/bin/obora.js" run "$WORKFLOW" \
      --config "$CONFIG" \
      --agents "$AGENTS" \
      --output-dir "$RESULT_DIR" \
      --timeout "$OBORA_TIMEOUT_MS" \
      --verbose --no-color 2>&1 | tee "$run_log"
    run_exit=${PIPESTATUS[0]}
    set -e
    tail -n 200 "$run_log" > "$run_json" || true

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
