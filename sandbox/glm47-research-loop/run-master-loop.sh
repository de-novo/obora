#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
WORKFLOW="$ROOT/workflows/00-master-research-loop.yaml"
CONFIG="$ROOT/obora.config.yaml"
AGENTS="$ROOT/agents.yaml"
STATE_FILE="$ROOT/output/final/00-loop-state.md"
DECISION_FILE="$ROOT/output/final/23-loop-decision.md"
LOG_DIR="$ROOT/output/iterations/logs"
RESULT_DIR="$ROOT/output/iterations/results"
mkdir -p "$LOG_DIR" "$RESULT_DIR"

MAX_ITERATIONS="${MAX_ITERATIONS:-5}"
OBORA_TIMEOUT_MS="${OBORA_TIMEOUT_MS:-600000}"
MAX_RUN_RETRIES="${MAX_RUN_RETRIES:-4}"
INITIAL_RETRY_DELAY_SEC="${INITIAL_RETRY_DELAY_SEC:-20}"

require_file() {
  local f="$1"
  if [[ ! -f "$f" ]]; then
    echo "[loop] missing required file: $f" >&2
    exit 1
  fi
}

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
- Updated by run-master-loop.sh
- Decision file: output/final/23-loop-decision.md
EOF
}

extract_decision() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "MISSING"
    return 0
  fi

  local decision
  decision="$(grep -Eio 'decision\s*:\s*(CONTINUE|STOP)' "$file" | head -n1 | sed -E 's/.*:\s*//I' | tr '[:lower:]' '[:upper:]' || true)"
  if [[ -z "$decision" ]]; then
    decision="$(grep -Eio '\b(CONTINUE|STOP)\b' "$file" | head -n1 | tr '[:lower:]' '[:upper:]' || true)"
  fi
  if [[ -z "$decision" ]]; then
    echo "UNKNOWN"
  else
    echo "$decision"
  fi
}

is_retryable_429() {
  local log_file="$1"
  [[ -f "$log_file" ]] || return 1
  grep -qi '429 The service may be temporarily overloaded' "$log_file"
}

require_file "$WORKFLOW"
require_file "$CONFIG"
require_file "$AGENTS"

cd "$REPO_ROOT"

echo "[loop] root=$ROOT"
echo "[loop] workflow=$WORKFLOW"
echo "[loop] max_iterations=$MAX_ITERATIONS"

iteration=1
while (( iteration <= MAX_ITERATIONS )); do
  echo ""
  echo "[loop] ===== iteration $iteration / $MAX_ITERATIONS ====="
  update_state "$iteration" "RUNNING" "RUN_MASTER_WORKFLOW"

  run_log="$LOG_DIR/iteration-${iteration}.log"
  run_json="$RESULT_DIR/iteration-${iteration}.json"

  attempt=1
  retry_delay="$INITIAL_RETRY_DELAY_SEC"
  run_exit=0

  while (( attempt <= MAX_RUN_RETRIES )); do
    echo "[loop] run attempt $attempt / $MAX_RUN_RETRIES"
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

    # Best-effort snapshot of the last output for this iteration.
    tail -n 200 "$run_log" > "$run_json" || true

    if [[ $run_exit -eq 0 ]]; then
      break
    fi

    if is_retryable_429 "$run_log" && (( attempt < MAX_RUN_RETRIES )); then
      echo "[loop] retryable 429 detected; sleeping ${retry_delay}s before retry"
      sleep "$retry_delay"
      retry_delay=$(( retry_delay * 2 ))
      ((attempt++))
      continue
    fi

    break
  done

  if [[ $run_exit -ne 0 ]]; then
    echo "[loop] obora run failed at iteration $iteration (exit=$run_exit)"
    update_state "$iteration" "FAILED" "INSPECT_RUN_LOG"
    exit $run_exit
  fi

  decision="$(extract_decision "$DECISION_FILE")"
  echo "[loop] decision=$decision"

  case "$decision" in
    STOP)
      update_state "$iteration" "COMPLETED" "ARCHIVE_OR_FINISH"
      echo "[loop] stopping: conclusion reached or bounded stop triggered"
      exit 0
      ;;
    CONTINUE)
      update_state "$iteration" "RUNNING" "NEXT_ITERATION"
      echo "[loop] continuing to next iteration"
      ;;
    MISSING|UNKNOWN)
      update_state "$iteration" "BLOCKED" "CHECK_DECISION_FILE"
      echo "[loop] missing or unreadable loop decision file: $DECISION_FILE" >&2
      exit 2
      ;;
    *)
      update_state "$iteration" "BLOCKED" "CHECK_DECISION_PARSE"
      echo "[loop] unexpected decision value: $decision" >&2
      exit 3
      ;;
  esac

  ((iteration++))
done

update_state "$MAX_ITERATIONS" "STOPPED" "MAX_ITERATIONS_REACHED"
echo "[loop] reached MAX_ITERATIONS=$MAX_ITERATIONS without STOP decision"
exit 4
