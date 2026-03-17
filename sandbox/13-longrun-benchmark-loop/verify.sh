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
INITIAL_VERDICT="$ROOT/output/final/02-verdict.md"
REPAIRED="$ROOT/output/final/03-repaired-attempt.md"
FINAL_VERDICT="$ROOT/output/final/04-final-verdict.md"
ARCHIVE_NOTE="$ROOT/output/archive/40-longrun-benchmark-loop-note.md"
RESULT_GLOB="$ROOT/output/iterations/results/longrun-benchmark-loop-*.json"

require_file "$RUN_LOG"
require_file "$RUN_TAIL_LOG"
require_file "$ATTEMPT"
require_file "$INITIAL_VERDICT"
require_file "$REPAIRED"
require_file "$FINAL_VERDICT"
require_file "$ARCHIVE_NOTE"
require_glob "$RESULT_GLOB"

require_contains 'Workflow "longrun-benchmark-loop" completed.' "$RUN_LOG"
require_contains 'step_end: solve-initial (completed)' "$RUN_LOG"
require_contains 'step_end: judge-initial (completed)' "$RUN_LOG"
require_contains 'step_end: repair-attempt (completed)' "$RUN_LOG"
require_contains 'step_end: judge-repaired (completed)' "$RUN_LOG"
require_contains 'step_end: archive-longrun-benchmark-loop (completed)' "$RUN_LOG"
require_contains 'Workflow "longrun-benchmark-loop" completed.' "$RUN_TAIL_LOG"

grep -Eq '^#+[[:space:]]+Answer' "$ATTEMPT" || fail "expected Answer heading in $ATTEMPT"
grep -Eq '^#+[[:space:]]+Reasoning' "$ATTEMPT" || fail "expected Reasoning heading in $ATTEMPT"
grep -Eq '10' "$ATTEMPT" || fail "expected intentional wrong answer in $ATTEMPT"

grep -Eq '^#+[[:space:]]+Verdict' "$INITIAL_VERDICT" || fail "expected Verdict heading in $INITIAL_VERDICT"
grep -Eq 'FAIL' "$INITIAL_VERDICT" || fail "expected FAIL verdict in $INITIAL_VERDICT"
grep -Eq '12' "$INITIAL_VERDICT" || fail "expected correction detail in $INITIAL_VERDICT"

grep -Eq '^#+[[:space:]]+Answer' "$REPAIRED" || fail "expected Answer heading in $REPAIRED"
grep -Eq '^#+[[:space:]]+Reasoning' "$REPAIRED" || fail "expected Reasoning heading in $REPAIRED"
grep -Eq '12' "$REPAIRED" || fail "expected repaired answer in $REPAIRED"

grep -Eq '^#+[[:space:]]+Verdict' "$FINAL_VERDICT" || fail "expected Verdict heading in $FINAL_VERDICT"
grep -Eq 'PASS' "$FINAL_VERDICT" || fail "expected PASS verdict in $FINAL_VERDICT"
grep -Eq '12' "$FINAL_VERDICT" || fail "expected final correctness detail in $FINAL_VERDICT"

grep -Eq '^#+[[:space:]]+Summary of Attempt' "$ARCHIVE_NOTE" || fail "expected Summary of Attempt heading in $ARCHIVE_NOTE"
grep -Eq '^#+[[:space:]]+Benchmark Result' "$ARCHIVE_NOTE" || fail "expected Benchmark Result heading in $ARCHIVE_NOTE"
grep -Eq '^#+[[:space:]]+Reuse Notes' "$ARCHIVE_NOTE" || fail "expected Reuse Notes heading in $ARCHIVE_NOTE"

echo 'verify.sh: PASS - canonical longrun benchmark loop artifacts and fail→repair→pass flow verified.'
