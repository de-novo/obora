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
RUN2_REPAIRED="$ROOT/output/iterations/results/04-run-2-repaired-result.json"
INITIAL_SUMMARY="$ROOT/output/final/01-initial-comparison-summary.md"
INITIAL_VALIDATION="$ROOT/output/final/02-comparison-validation.md"
FINAL_SUMMARY="$ROOT/output/final/03-final-comparison-summary.md"
FINAL_VALIDATION="$ROOT/output/final/04-final-comparison-validation.md"
ARCHIVE_NOTE="$ROOT/output/archive/40-multi-run-comparison-loop-note.md"
WORKFLOW_RESULT_GLOB="$ROOT/output/iterations/results/multi-run-comparison-loop-*.json"

require_file "$RUN_LOG"
require_file "$RUN_TAIL_LOG"
require_file "$RUN1"
require_file "$RUN2"
require_file "$RUN3"
require_file "$RUN2_REPAIRED"
require_file "$INITIAL_SUMMARY"
require_file "$INITIAL_VALIDATION"
require_file "$FINAL_SUMMARY"
require_file "$FINAL_VALIDATION"
require_file "$ARCHIVE_NOTE"
require_glob "$WORKFLOW_RESULT_GLOB"

require_contains 'Workflow "multi-run-comparison-loop" completed.' "$RUN_LOG"
require_contains 'step_end: solve-run-1 (completed)' "$RUN_LOG"
require_contains 'step_end: solve-run-2 (completed)' "$RUN_LOG"
require_contains 'step_end: solve-run-3 (completed)' "$RUN_LOG"
require_contains 'step_end: compare-initial-runs (completed)' "$RUN_LOG"
require_contains 'step_end: validate-comparison (completed)' "$RUN_LOG"
require_contains 'step_end: repair-run-2 (completed)' "$RUN_LOG"
require_contains 'step_end: compare-repaired-runs (completed)' "$RUN_LOG"
require_contains 'step_end: validate-final-comparison (completed)' "$RUN_LOG"
require_contains 'step_end: archive-comparison (completed)' "$RUN_LOG"
require_contains 'Workflow "multi-run-comparison-loop" completed.' "$RUN_TAIL_LOG"

for RUN_FILE in "$RUN1" "$RUN2" "$RUN3" "$RUN2_REPAIRED"; do
  node -e '
const fs = require("fs");
const path = process.argv[1];
const data = JSON.parse(fs.readFileSync(path, "utf8"));
if (typeof data.run_id !== "string" || data.run_id.length === 0) process.exit(1);
if (typeof data.answer !== "number") process.exit(2);
if (typeof data.reasoning !== "string" || data.reasoning.length === 0) process.exit(3);
' "$RUN_FILE" || fail "invalid per-run JSON structure: $RUN_FILE"
done

node -e '
const fs = require("fs");
const wrong = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const fixed = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (wrong.answer === 15) process.exit(1);
if (fixed.answer !== 15) process.exit(2);
' "$RUN2" "$RUN2_REPAIRED" || fail "expected run-2 to fail initially and pass after repair"

grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Overall Result' "$INITIAL_SUMMARY" || fail "expected Overall Result heading in $INITIAL_SUMMARY"
grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Per-Run Snapshot' "$INITIAL_SUMMARY" || fail "expected Per-Run Snapshot heading in $INITIAL_SUMMARY"
grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Best Run' "$INITIAL_SUMMARY" || fail "expected Best Run heading in $INITIAL_SUMMARY"
grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Worst Run' "$INITIAL_SUMMARY" || fail "expected Worst Run heading in $INITIAL_SUMMARY"
grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Pass Rate' "$INITIAL_SUMMARY" || fail "expected Pass Rate heading in $INITIAL_SUMMARY"
grep -Eq 'PARTIAL|FAIL' "$INITIAL_SUMMARY" || fail "expected partial or fail verdict in $INITIAL_SUMMARY"

grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Verdict' "$INITIAL_VALIDATION" || fail "expected Verdict heading in $INITIAL_VALIDATION"
grep -Eq 'FAIL' "$INITIAL_VALIDATION" || fail "expected FAIL verdict in $INITIAL_VALIDATION"

grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Overall Result' "$FINAL_SUMMARY" || fail "expected Overall Result heading in $FINAL_SUMMARY"
grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Per-Run Snapshot' "$FINAL_SUMMARY" || fail "expected Per-Run Snapshot heading in $FINAL_SUMMARY"
grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Best Run' "$FINAL_SUMMARY" || fail "expected Best Run heading in $FINAL_SUMMARY"
grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Worst Run' "$FINAL_SUMMARY" || fail "expected Worst Run heading in $FINAL_SUMMARY"
grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Pass Rate' "$FINAL_SUMMARY" || fail "expected Pass Rate heading in $FINAL_SUMMARY"
grep -Eq 'run-1' "$FINAL_SUMMARY" || fail "expected run-1 snapshot in $FINAL_SUMMARY"
grep -Eq 'run-2-repaired' "$FINAL_SUMMARY" || fail "expected repaired run snapshot in $FINAL_SUMMARY"
grep -Eq 'run-3' "$FINAL_SUMMARY" || fail "expected run-3 snapshot in $FINAL_SUMMARY"
grep -Eq 'PASS' "$FINAL_SUMMARY" || fail "expected PASS verdict in $FINAL_SUMMARY"

grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Verdict' "$FINAL_VALIDATION" || fail "expected Verdict heading in $FINAL_VALIDATION"
grep -Eq 'PASS' "$FINAL_VALIDATION" || fail "expected PASS verdict in $FINAL_VALIDATION"

grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Summary of Loop' "$ARCHIVE_NOTE" || fail "expected Summary of Loop heading in $ARCHIVE_NOTE"
grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Final Comparison Result' "$ARCHIVE_NOTE" || fail "expected Final Comparison Result heading in $ARCHIVE_NOTE"
grep -Eq '^#+[[:space:]]+([0-9]+\.[[:space:]]+)?Reuse Notes' "$ARCHIVE_NOTE" || fail "expected Reuse Notes heading in $ARCHIVE_NOTE"

echo 'verify.sh: PASS - canonical multi-run comparison loop artifacts and compare->validate->repair->compare flow verified.'
