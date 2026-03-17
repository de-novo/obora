#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
RUN_HELPER="$ROOT/run-with-watchdog.sh"
LOG_DIR="$ROOT/output/iterations/logs"
RESULT_DIR="$ROOT/output/iterations/results"
mkdir -p "$ROOT/output/final" "$ROOT/output/archive" "$LOG_DIR" "$RESULT_DIR"

OBORA_TIMEOUT_MS="${OBORA_TIMEOUT_MS:-86400000}"
OBORA_IDLE_TIMEOUT_SEC="${OBORA_IDLE_TIMEOUT_SEC:-900}"
OBORA_SAFETY_TIMEOUT_SEC="${OBORA_SAFETY_TIMEOUT_SEC:-43200}"
OBORA_WATCHDOG_POLL_SEC="${OBORA_WATCHDOG_POLL_SEC:-5}"

cd "$REPO_ROOT"
"$RUN_HELPER" "$LOG_DIR/run.log" "$LOG_DIR/run.tail.log" "$OBORA_IDLE_TIMEOUT_SEC" "$OBORA_SAFETY_TIMEOUT_SEC" "$OBORA_WATCHDOG_POLL_SEC" -- \
  node bin/obora.js run \
    "$ROOT/workflows/00-longrun-benchmark-mini.yaml" \
    --config "$ROOT/obora.config.yaml" \
    --agents "$ROOT/agents.yaml" \
    --output-dir "$RESULT_DIR" \
    --timeout "$OBORA_TIMEOUT_MS" \
    --verbose --no-color
