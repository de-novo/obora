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
REVIEW="$ROOT/output/final/02-review.md"
FINAL="$ROOT/output/final/03-final.md"
VALIDATION="$ROOT/output/final/04-validation.md"
ARCHIVE_NOTE="$ROOT/output/archive/40-longrun-project-note.md"
RESULT_GLOB="$ROOT/output/iterations/results/longrun-project-mini-*.json"

require_file "$RUN_LOG"
require_file "$RUN_TAIL_LOG"
require_file "$DRAFT"
require_file "$REVIEW"
require_file "$FINAL"
require_file "$VALIDATION"
require_file "$ARCHIVE_NOTE"
require_glob "$RESULT_GLOB"

require_contains 'Workflow "longrun-project-mini" completed.' "$RUN_LOG"
require_contains 'step_end: draft-project (completed)' "$RUN_LOG"
require_contains 'step_end: review-project (completed)' "$RUN_LOG"
require_contains 'step_end: validate-project (completed)' "$RUN_LOG"
require_contains 'step_end: archive-project (completed)' "$RUN_LOG"
require_contains 'Workflow "longrun-project-mini" completed.' "$RUN_TAIL_LOG"

grep -Eq '^#+[[:space:]]+Project Summary' "$DRAFT" || fail "expected Project Summary heading in $DRAFT"
grep -Eq '^#+[[:space:]]+Scope' "$DRAFT" || fail "expected Scope heading in $DRAFT"
grep -Eq '^#+[[:space:]]+Next Action' "$DRAFT" || fail "expected Next Action heading in $DRAFT"

grep -Eq '^#+[[:space:]]+Strengths' "$REVIEW" || fail "expected Strengths heading in $REVIEW"
grep -Eq '^#+[[:space:]]+Issues' "$REVIEW" || fail "expected Issues heading in $REVIEW"
grep -Eq '^#+[[:space:]]+Suggested Revisions' "$REVIEW" || fail "expected Suggested Revisions heading in $REVIEW"

grep -Eq '^#+[[:space:]]+Final Summary' "$FINAL" || fail "expected Final Summary heading in $FINAL"
grep -Eq '^#+[[:space:]]+Final Scope' "$FINAL" || fail "expected Final Scope heading in $FINAL"
grep -Eq '^#+[[:space:]]+Changes Applied' "$FINAL" || fail "expected Changes Applied heading in $FINAL"
grep -Eq '^#+[[:space:]]+Next Action' "$FINAL" || fail "expected Next Action heading in $FINAL"

grep -Eq '^#+[[:space:]]+Verdict' "$VALIDATION" || fail "expected Verdict heading in $VALIDATION"
grep -Eq '^#+[[:space:]]+Passed Checks' "$VALIDATION" || fail "expected Passed Checks heading in $VALIDATION"
grep -Eq '^#+[[:space:]]+Failed Checks' "$VALIDATION" || fail "expected Failed Checks heading in $VALIDATION"
grep -Eq '^#+[[:space:]]+Next Action' "$VALIDATION" || fail "expected Next Action heading in $VALIDATION"
grep -Eq 'PASS' "$VALIDATION" || fail "expected PASS verdict in $VALIDATION"

grep -Eq '^#+[[:space:]]+Summary of Project' "$ARCHIVE_NOTE" || fail "expected Summary of Project heading in $ARCHIVE_NOTE"
grep -Eq '^#+[[:space:]]+Why Archived' "$ARCHIVE_NOTE" || fail "expected Why Archived heading in $ARCHIVE_NOTE"
grep -Eq '^#+[[:space:]]+Reuse Notes' "$ARCHIVE_NOTE" || fail "expected Reuse Notes heading in $ARCHIVE_NOTE"

echo 'verify.sh: PASS - canonical longrun project mini artifacts and draft→review→final→validation→archive flow verified.'
