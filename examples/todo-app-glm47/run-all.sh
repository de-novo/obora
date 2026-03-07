#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
CLI="/Users/denovo/workspace/github/obora-kit/packages/cli/bin/obora.js"
OUT="$ROOT/output"
mkdir -p "$OUT"

run_wf() {
  local wf="$1"
  echo "\n==> Running $wf"
  "$CLI" run "$wf" \
    --config "$ROOT/obora.config.yaml" \
    --agents "$ROOT/agents.yaml" \
    --output-dir "$OUT" \
    --json
}

run_wf "$ROOT/workflows/01-planning-pipeline.yaml"
run_wf "$ROOT/workflows/complex/02-architecture-complex.yaml"
run_wf "$ROOT/workflows/complex/03b-uiux-pencilskill-design-system.yaml"
run_wf "$ROOT/workflows/complex/04-development-complex.yaml"
run_wf "$ROOT/workflows/complex/05-validation-complex.yaml"

echo "\nDone. Output JSON files in: $OUT"
