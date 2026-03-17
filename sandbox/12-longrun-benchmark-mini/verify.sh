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
ATTEMPT="$ROOT/output/final/01-attempt.md"
VERDICT="$ROOT/output/final/02-verdict.md"
ARCHIVE_NOTE="$ROOT/output/archive/40-longrun-benchmark-note.md"
RESULT_GLOB="$ROOT/output/iterations/results/longrun-benchmark-mini-*.json"

require_file "$RUN_LOG"
require_file "$RUN_TAIL_LOG"
require_file "$ATTEMPT"
require_file "$VERDICT"
require_file "$ARCHIVE_NOTE"
require_glob "$RESULT_GLOB"

require_contains 'Workflow "longrun-benchmark-mini" completed.' "$RUN_LOG"
require_contains 'step_end: solve-problem (completed)' "$RUN_LOG"
require_contains 'step_end: judge-attempt (completed)' "$RUN_LOG"
require_contains 'step_end: archive-longrun-benchmark (completed)' "$RUN_LOG"
require_contains 'Workflow "longrun-benchmark-mini" completed.' "$RUN_TAIL_LOG"

grep -Eq '^#+[[:space:]]+Answer' "$ATTEMPT" || fail "expected Answer heading in $ATTEMPT"
grep -Eq '^#+[[:space:]]+Reasoning' "$ATTEMPT" || fail "expected Reasoning heading in $ATTEMPT"

grep -Eq '^#+[[:space:]]+Verdict' "$VERDICT" || fail "expected Verdict heading in $VERDICT"
grep -Eq '^#+[[:space:]]+Score' "$VERDICT" || fail "expected Score heading in $VERDICT"
grep -Eq '^#+[[:space:]]+Correctness' "$VERDICT" || fail "expected Correctness heading in $VERDICT"
grep -Eq '^#+[[:space:]]+Feedback' "$VERDICT" || fail "expected Feedback heading in $VERDICT"
grep -Eq 'PASS' "$VERDICT" || fail "expected PASS verdict in $VERDICT"

grep -Eq '^#+[[:space:]]+Summary of Attempt' "$ARCHIVE_NOTE" || fail "expected Summary of Attempt heading in $ARCHIVE_NOTE"
grep -Eq '^#+[[:space:]]+Benchmark Result' "$ARCHIVE_NOTE" || fail "expected Benchmark Result heading in $ARCHIVE_NOTE"
grep -Eq '^#+[[:space:]]+Reuse Notes' "$ARCHIVE_NOTE" || fail "expected Reuse Notes heading in $ARCHIVE_NOTE"

echo 'verify.sh: PASS - canonical longrun benchmark mini artifacts and solver→judge→archive flow verified.'
