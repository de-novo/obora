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
DRAFT="$ROOT/output/final/01-draft.md"
FIRST_VALIDATION="$ROOT/output/final/02-validation.md"
REPAIRED="$ROOT/output/final/03-repaired.md"
FINAL_VALIDATION="$ROOT/output/final/04-final-validation.md"
ARCHIVE_NOTE="$ROOT/output/archive/40-longrun-loop-note.md"
RESULT_GLOB="$ROOT/output/iterations/results/longrun-loop-*.json"

require_file "$RUN_LOG"
require_file "$RUN_TAIL_LOG"
require_file "$DRAFT"
require_file "$FIRST_VALIDATION"
require_file "$REPAIRED"
require_file "$FINAL_VALIDATION"
require_file "$ARCHIVE_NOTE"
require_glob "$RESULT_GLOB"

require_contains 'Workflow "longrun-loop" completed.' "$RUN_LOG"
require_contains 'validation failed [validate]' "$RUN_LOG"
require_contains 'repair attempt' "$RUN_LOG"
require_contains 'validation passed [validate]' "$RUN_LOG"
require_contains 'repair loop summary: validation failed=1, validation passed=1, repairs started=1, repairs completed=1' "$RUN_LOG"
require_contains 'Workflow "longrun-loop" completed.' "$RUN_TAIL_LOG"

require_contains '## Goal' "$REPAIRED"
require_contains '## Plan' "$REPAIRED"
require_contains '## Next Action' "$REPAIRED"

grep -Eq 'FAIL|FAILED' "$FIRST_VALIDATION" || fail "expected failure signal in $FIRST_VALIDATION"
grep -Eq 'Next Action' "$FIRST_VALIDATION" || fail "expected Next Action validation detail in $FIRST_VALIDATION"
grep -Eq 'PASS|PASSED' "$FINAL_VALIDATION" || fail "expected pass signal in $FINAL_VALIDATION"

require_contains '## Summary of Run' "$ARCHIVE_NOTE"
require_contains '## Why Preserved' "$ARCHIVE_NOTE"
require_contains '## Reuse Notes' "$ARCHIVE_NOTE"

echo 'verify.sh: PASS - canonical longrun loop artifacts and fail→repair→pass flow verified.'
