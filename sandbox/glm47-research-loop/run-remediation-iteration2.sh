#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
WORKFLOW="$ROOT/workflows/01-remediation-iteration2.yaml"
CONFIG="$ROOT/obora.config.yaml"
AGENTS="$ROOT/agents.yaml"
DECISION_FILE="$REPO_ROOT/output/final/29-remediation-decision.md"
LOG_DIR="$REPO_ROOT/output/iterations/logs"
RESULT_DIR="$REPO_ROOT/output/iterations/results"
mkdir -p "$LOG_DIR" "$RESULT_DIR"

OBORA_TIMEOUT_MS="${OBORA_TIMEOUT_MS:-900000}"
MAX_RUN_RETRIES="${MAX_RUN_RETRIES:-4}"
INITIAL_RETRY_DELAY_SEC="${INITIAL_RETRY_DELAY_SEC:-20}"

extract_decision() {
  local file="$1"
  [[ -f "$file" ]] || { echo "MISSING"; return 0; }
  local decision
  decision="$(grep -Eio 'decision\s*:\s*(CONTINUE|STOP)' "$file" | head -n1 | sed -E 's/.*:\s*//I' | tr '[:lower:]' '[:upper:]' || true)"
  [[ -n "$decision" ]] && echo "$decision" || echo "UNKNOWN"
}

is_retryable_429() {
  local log_file="$1"
  [[ -f "$log_file" ]] || return 1
  grep -qi '429 The service may be temporarily overloaded' "$log_file"
}

cd "$REPO_ROOT"
run_log="$LOG_DIR/remediation-iteration2.log"
run_json="$RESULT_DIR/remediation-iteration2.json"
attempt=1
retry_delay="$INITIAL_RETRY_DELAY_SEC"
run_exit=0

while (( attempt <= MAX_RUN_RETRIES )); do
  echo "[remediation-iter2] run attempt $attempt / $MAX_RUN_RETRIES"
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
    echo "[remediation-iter2] retryable 429 detected; sleeping ${retry_delay}s"
    sleep "$retry_delay"
    retry_delay=$(( retry_delay * 2 ))
    ((attempt++))
    continue
  fi
  break
done

if [[ $run_exit -ne 0 ]]; then
  echo "[remediation-iter2] workflow failed (exit=$run_exit)"
  exit $run_exit
fi

echo "[remediation-iter2] decision=$(extract_decision "$DECISION_FILE")"
