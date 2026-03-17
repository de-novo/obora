#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
LOG_DIR="$ROOT/output/iterations/logs"
RUN_LOG="$LOG_DIR/run.log"
RUN_TAIL_LOG="$LOG_DIR/run.tail.log"

mkdir -p "$ROOT/output/final" "$ROOT/output/archive" "$ROOT/output/iterations/results" "$LOG_DIR"

cd "$REPO_ROOT"
node bin/obora.js run \
  "$ROOT/workflows/00-project-loop.yaml" \
  --config "$ROOT/obora.config.yaml" \
  --agents "$ROOT/agents.yaml" \
  --output-dir "$ROOT/output/iterations/results" \
  --verbose --no-color \
  2>&1 | tee "$RUN_LOG" | tee "$RUN_TAIL_LOG"
