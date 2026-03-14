#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"
WORKFLOW="$ROOT/workflows/00-math-proof-loop.yaml"
CONFIG="$ROOT/obora.config.yaml"
AGENTS="$ROOT/agents.yaml"

cd "$REPO_ROOT"
node bin/obora.js run "$WORKFLOW" \
  --config "$CONFIG" \
  --agents "$AGENTS" \
  --output-dir output/iterations/results \
  --timeout "${OBORA_TIMEOUT_MS:-900000}" \
  --verbose --no-color
