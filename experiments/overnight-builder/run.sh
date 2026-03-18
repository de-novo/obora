#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"

export OBORA_TIMEOUT_MS="${OBORA_TIMEOUT_MS:-86400000}"

mkdir -p "$ROOT/artifacts"
mkdir -p "$ROOT/workspace"
mkdir -p "$ROOT/data"
mkdir -p "$ROOT/output/iterations/logs"
mkdir -p "$ROOT/output/iterations/results"

echo "=== overnight-builder starting ==="
echo "idea:       $ROOT/input/idea.md"
echo "workspace:  $ROOT/workspace/"
echo "timeout:    ${OBORA_TIMEOUT_MS}ms"
echo ""

cd "$ROOT"

node "$REPO_ROOT/bin/obora.js" run \
  "$ROOT/workflows/00-overnight-builder.yaml" \
  --config "$ROOT/obora.config.yaml" \
  --agents "$ROOT/agents.yaml" \
  --output-dir "$ROOT/output/iterations/results" \
  --timeout "$OBORA_TIMEOUT_MS" \
  2>&1 | tee "$ROOT/output/iterations/logs/run.log"

echo ""
echo "=== overnight-builder finished ==="
