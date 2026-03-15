#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../.." && pwd)"

mkdir -p "$ROOT/output/final" "$ROOT/output/archive" "$ROOT/output/iterations/results"

cd "$REPO_ROOT"
node bin/obora.js run \
  "$ROOT/workflows/00-benchmark-loop.yaml" \
  --config "$ROOT/obora.config.yaml" \
  --agents "$ROOT/agents.yaml" \
  --output-dir "$ROOT/output/iterations/results" \
  --verbose --no-color
