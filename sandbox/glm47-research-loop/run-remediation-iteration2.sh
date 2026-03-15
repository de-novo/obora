#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
RUN_HELPER="$REPO_ROOT/sandbox/_lib/run-obora-with-watchdog.sh"
WORKFLOW="$ROOT/workflows/01-remediation-iteration2.yaml"
CONFIG="$ROOT/obora.config.yaml"
AGENTS="$ROOT/agents.yaml"
DECISION_FILE="$ROOT/output/final/29-remediation-decision.md"
LOG_DIR="$ROOT/output/iterations/logs"
RESULT_DIR="$ROOT/output/iterations/results"
mkdir -p "$LOG_DIR" "$RESULT_DIR"

OBORA_TIMEOUT_MS="${OBORA_TIMEOUT_MS:-86400000}"
OBORA_IDLE_TIMEOUT_SEC="${OBORA_IDLE_TIMEOUT_SEC:-900}"
OBORA_SAFETY_TIMEOUT_SEC="${OBORA_SAFETY_TIMEOUT_SEC:-43200}"
OBORA_WATCHDOG_POLL_SEC="${OBORA_WATCHDOG_POLL_SEC:-5}"
MAX_RUN_RETRIES="${MAX_RUN_RETRIES:-4}"
INITIAL_RETRY_DELAY_SEC="${INITIAL_RETRY_DELAY_SEC:-20}"

extract_decision_from_text() {
  local text="$1"
  local decision
  decision="$(printf '%s' "$text" | grep -Eio 'decision\s*:\s*(CONTINUE|STOP)' | head -n1 | sed -E 's/.*:\s*//I' | tr '[:lower:]' '[:upper:]' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//' || true)"
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
text = obj.get('outputs', {}).get('remediation-review', '')
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
run_log="$LOG_DIR/remediation-iteration2.log"
run_json="$RESULT_DIR/remediation-iteration2.json"
attempt=1
retry_delay="$INITIAL_RETRY_DELAY_SEC"
run_exit=0

while (( attempt <= MAX_RUN_RETRIES )); do
  echo "[remediation-iter2] run attempt $attempt / $MAX_RUN_RETRIES"
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
  LAST_RESULT_JSON="$(ls -1t "$RESULT_DIR"/glm47-remediation-iteration2-*.json 2>/dev/null | head -n1 || true)"

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
