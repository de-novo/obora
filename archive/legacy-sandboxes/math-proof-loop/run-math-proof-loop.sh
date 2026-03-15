#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
RUN_HELPER="$REPO_ROOT/sandbox/_lib/run-obora-with-watchdog.sh"
WORKFLOW="$ROOT/workflows/00-math-proof-loop.yaml"
CONFIG="$ROOT/obora.config.yaml"
AGENTS="$ROOT/agents.yaml"
LOG_DIR="$ROOT/output/iterations/logs"
RESULT_DIR="$ROOT/output/iterations/results"
mkdir -p "$LOG_DIR" "$RESULT_DIR"

OBORA_TIMEOUT_MS="${OBORA_TIMEOUT_MS:-86400000}"
OBORA_IDLE_TIMEOUT_SEC="${OBORA_IDLE_TIMEOUT_SEC:-900}"
OBORA_SAFETY_TIMEOUT_SEC="${OBORA_SAFETY_TIMEOUT_SEC:-43200}"
OBORA_WATCHDOG_POLL_SEC="${OBORA_WATCHDOG_POLL_SEC:-5}"

cd "$REPO_ROOT"
"$RUN_HELPER" "$LOG_DIR/run-math-proof-loop.log" "$LOG_DIR/run-math-proof-loop.tail.log" "$OBORA_IDLE_TIMEOUT_SEC" "$OBORA_SAFETY_TIMEOUT_SEC" "$OBORA_WATCHDOG_POLL_SEC" -- \
  node bin/obora.js run "$WORKFLOW" \
    --config "$CONFIG" \
    --agents "$AGENTS" \
    --output-dir "$RESULT_DIR" \
    --timeout "$OBORA_TIMEOUT_MS" \
    --verbose --no-color
