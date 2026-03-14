#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
WORKFLOW="$ROOT/workflows/00-master-research-loop-semifine.yaml"
CONFIG="$ROOT/obora.config.yaml"
AGENTS="$ROOT/agents.yaml"
STATE_FILE="$REPO_ROOT/output/final/00-loop-state.md"
DECISION_FILE="$REPO_ROOT/output/final/23-loop-decision.md"
LOG_DIR="$REPO_ROOT/output/iterations/logs"
RESULT_DIR="$REPO_ROOT/output/iterations/results"
mkdir -p "$LOG_DIR" "$RESULT_DIR" "$REPO_ROOT/output/archive" "$REPO_ROOT/output/final"

MAX_ITERATIONS="${MAX_ITERATIONS:-4}"
OBORA_TIMEOUT_MS="${OBORA_TIMEOUT_MS:-300000}"
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
- Updated by run-master-loop-semifine.sh
- Semifine workflow balances provider instability and long synthesis latency.
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
echo "[semifine-loop] workflow=$WORKFLOW"

iteration=1
while (( iteration <= MAX_ITERATIONS )); do
  echo "[semifine-loop] ===== iteration $iteration / $MAX_ITERATIONS ====="
  update_state "$iteration" "RUNNING" "RUN_SEMIFINE_WORKFLOW"

  run_log="$LOG_DIR/semifine-iteration-${iteration}.log"
  run_json="$RESULT_DIR/semifine-iteration-${iteration}.json"
  attempt=1
  retry_delay="$INITIAL_RETRY_DELAY_SEC"
  run_exit=0

  while (( attempt <= MAX_RUN_RETRIES )); do
    echo "[semifine-loop] run attempt $attempt / $MAX_RUN_RETRIES"
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
      echo "[semifine-loop] retryable 429 detected; sleeping ${retry_delay}s"
      sleep "$retry_delay"
      retry_delay=$(( retry_delay * 2 ))
      ((attempt++))
      continue
    fi
    break
  done

  if [[ $run_exit -ne 0 ]]; then
    update_state "$iteration" "FAILED" "INSPECT_RUN_LOG"
    echo "[semifine-loop] workflow failed (exit=$run_exit)"
    exit $run_exit
  fi

  decision="$(extract_decision "$DECISION_FILE")"
  echo "[semifine-loop] decision=$decision"
  case "$decision" in
    STOP)
      update_state "$iteration" "COMPLETED" "ARCHIVE_OR_FINISH"
      echo "[semifine-loop] stop condition reached"
      exit 0
      ;;
    CONTINUE)
      update_state "$iteration" "RUNNING" "NEXT_ITERATION"
      ;;
    *)
      update_state "$iteration" "BLOCKED" "CHECK_DECISION_FILE"
      echo "[semifine-loop] could not parse decision file"
      exit 2
      ;;
  esac

  ((iteration++))
done

update_state "$MAX_ITERATIONS" "STOPPED" "MAX_ITERATIONS_REACHED"
echo "[semifine-loop] reached MAX_ITERATIONS without STOP"
exit 4
