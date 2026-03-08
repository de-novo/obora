#!/bin/bash
# Test 12: Reddit Clone Modern Repair Loop (core runtime loop version)
# Expected: Obora uses runtime validation-repair contracts + back-edge loop to converge on a working app

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

require_provider_auth zai

APP_DIR="$SCRIPT_DIR/app"
ARTIFACT_DIR="$SCRIPT_DIR/artifacts"
OUTPUT_DIR="$SCRIPT_DIR/output"
PREVIEW_LOG="$SCRIPT_DIR/.preview.log"

echo "=== Test 12: Reddit Clone Modern Repair Loop (core runtime loop) ==="
echo "Obora will research, build, validate, repair, and re-validate using runtime back-edge control..."

rm -rf "$APP_DIR" "$ARTIFACT_DIR" "$OUTPUT_DIR" "$PREVIEW_LOG"
mkdir -p "$ARTIFACT_DIR" "$OUTPUT_DIR"

pnpm --filter @obora/sdk build >/dev/null

node "$SCRIPT_DIR/run.mjs"

node --input-type=module - "$OUTPUT_DIR/run-summary.json" <<'NODE'
import { readFile } from 'node:fs/promises';
const summary = JSON.parse(await readFile(process.argv[2], 'utf8'));
console.log('=== Summary ===');
console.log(JSON.stringify({
  status: summary.status,
  validationFailed: summary.audit.validationFailed,
  validationPassed: summary.audit.validationPassed,
  repairStarted: summary.audit.repairStarted,
  repairCompleted: summary.audit.repairCompleted,
  toolCallCounts: summary.toolCallCounts,
}, null, 2));
NODE

echo "=== Final Report ==="
cat "$ARTIFACT_DIR/FINAL-REPORT.md"
