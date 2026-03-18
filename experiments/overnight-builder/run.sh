#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"

export OBORA_TIMEOUT_MS="${OBORA_TIMEOUT_MS:-86400000}"
export OBORA_IDLE_TIMEOUT_SEC="${OBORA_IDLE_TIMEOUT_SEC:-1800}"
export OBORA_SAFETY_TIMEOUT_SEC="${OBORA_SAFETY_TIMEOUT_SEC:-43200}"
export OBORA_WATCHDOG_POLL_SEC="${OBORA_WATCHDOG_POLL_SEC:-10}"

mkdir -p "$ROOT/artifacts"
mkdir -p "$ROOT/workspace"
mkdir -p "$ROOT/data"

echo "=== overnight-builder starting ==="
echo "idea:       $ROOT/input/idea.md"
echo "workspace:  $ROOT/workspace/"
echo "timeout:    ${OBORA_TIMEOUT_MS}ms"
echo ""

cd "$ROOT"

node "$REPO_ROOT/bin/obora.js" run \
  "$ROOT/workflows/00-overnight-builder.yaml" \
  --timeout "$OBORA_TIMEOUT_MS" \
  --output "$ROOT/output" \
  2>&1 | tee "$ROOT/output/run.log"

echo ""
echo "=== overnight-builder finished ==="
