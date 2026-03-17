#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

usage() {
  cat >&2 <<'EOF'
usage: verify.sh [--fresh]

  --fresh   remove previous outputs, run the sandbox again, then verify artifacts/logs
EOF
}

fail() {
  echo "verify.sh: $*" >&2
  exit 1
}

require_file() {
  local path="$1"
  [[ -f "$path" ]] || fail "missing file: $path"
}

require_glob() {
  local pattern="$1"
  compgen -G "$pattern" > /dev/null || fail "missing files matching: $pattern"
}

require_contains() {
  local needle="$1"
  local path="$2"
  grep -Fq "$needle" "$path" || fail "expected '$needle' in $path"
}

run_fresh=0
case "${1:-}" in
  "") ;;
  --fresh) run_fresh=1; shift ;;
  -h|--help) usage; exit 0 ;;
  *) usage; fail "unknown argument: $1" ;;
esac

(( $# == 0 )) || { usage; fail "unexpected extra arguments"; }

if (( run_fresh )); then
  rm -rf "$ROOT/output/final" "$ROOT/output/archive" "$ROOT/output/iterations"
  "$ROOT/run.sh"
fi

RUN_LOG="$ROOT/output/iterations/logs/run.log"
RUN_TAIL_LOG="$ROOT/output/iterations/logs/run.tail.log"
RUN1="$ROOT/output/iterations/results/01-run-1-result.json"
RUN2="$ROOT/output/iterations/results/02-run-2-result.json"
RUN3="$ROOT/output/iterations/results/03-run-3-result.json"
SUMMARY="$ROOT/output/final/01-comparison-summary.md"
ARCHIVE_NOTE="$ROOT/output/archive/40-multi-run-comparison-note.md"
WORKFLOW_RESULT_GLOB="$ROOT/output/iterations/results/multi-run-comparison-mini-*.json"

# --- file existence ---
require_file "$RUN_LOG"
require_file "$RUN_TAIL_LOG"
require_file "$RUN1"
require_file "$RUN2"
require_file "$RUN3"
require_file "$SUMMARY"
require_file "$ARCHIVE_NOTE"
require_glob "$WORKFLOW_RESULT_GLOB"

# --- log assertions ---
require_contains 'Workflow "multi-run-comparison-mini" completed.' "$RUN_LOG"
require_contains 'step_end: solve-run-1 (completed)' "$RUN_LOG"
require_contains 'step_end: solve-run-2 (completed)' "$RUN_LOG"
require_contains 'step_end: solve-run-3 (completed)' "$RUN_LOG"
require_contains 'step_end: compare-runs (completed)' "$RUN_LOG"
require_contains 'step_end: archive-comparison (completed)' "$RUN_LOG"
require_contains 'Workflow "multi-run-comparison-mini" completed.' "$RUN_TAIL_LOG"

# --- per-run result structure ---
RUN_RESULT_COUNT=0
for RUN_FILE in "$RUN1" "$RUN2" "$RUN3"; do
  [[ -f "$RUN_FILE" ]] || fail "missing per-run result: $RUN_FILE"
  RUN_RESULT_COUNT=$((RUN_RESULT_COUNT + 1))
  node -e '
const fs = require("fs");
const path = process.argv[1];
const data = JSON.parse(fs.readFileSync(path, "utf8"));
if (typeof data.run_id !== "string" || data.run_id.length === 0) process.exit(1);
if (typeof data.answer !== "number") process.exit(2);
if (typeof data.reasoning !== "string" || data.reasoning.length === 0) process.exit(3);
' "$RUN_FILE" || fail "invalid per-run JSON structure: $RUN_FILE"
done

(( RUN_RESULT_COUNT >= 3 )) || fail "expected at least 3 per-run result files"

# --- comparison summary structure ---
grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Overall Result' "$SUMMARY" || fail "expected Overall Result heading in $SUMMARY"
grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Per-Run Snapshot' "$SUMMARY" || fail "expected Per-Run Snapshot heading in $SUMMARY"
grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Best Run' "$SUMMARY" || fail "expected Best Run heading in $SUMMARY"
grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Worst Run' "$SUMMARY" || fail "expected Worst Run heading in $SUMMARY"
grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Pass Rate' "$SUMMARY" || fail "expected Pass Rate heading in $SUMMARY"
grep -Eq 'Run[[:space:]]+1|run-1' "$SUMMARY" || fail "expected run 1 snapshot in $SUMMARY"
grep -Eq 'Run[[:space:]]+2|run-2' "$SUMMARY" || fail "expected run 2 snapshot in $SUMMARY"
grep -Eq 'Run[[:space:]]+3|run-3' "$SUMMARY" || fail "expected run 3 snapshot in $SUMMARY"
grep -Eq 'PASS|PARTIAL|FAIL' "$SUMMARY" || fail "expected comparison verdict in $SUMMARY"

# --- archive note structure ---
grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Summary of Comparison' "$ARCHIVE_NOTE" || fail "expected Summary of Comparison heading in $ARCHIVE_NOTE"
grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Comparison Result' "$ARCHIVE_NOTE" || fail "expected Comparison Result heading in $ARCHIVE_NOTE"
grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Reuse Notes' "$ARCHIVE_NOTE" || fail "expected Reuse Notes heading in $ARCHIVE_NOTE"

echo 'verify.sh: PASS - canonical multi-run comparison mini artifacts and solve×3→compare→archive flow verified.'
