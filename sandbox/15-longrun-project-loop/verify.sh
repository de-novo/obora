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
VALIDATION="$ROOT/output/final/03-validation.md"
REPAIRED="$ROOT/output/final/04-repaired.md"
FINAL_VALIDATION="$ROOT/output/final/05-final-validation.md"
ARCHIVE_NOTE="$ROOT/output/archive/40-longrun-project-loop-note.md"
RESULT_GLOB="$ROOT/output/iterations/results/longrun-project-loop-*.json"

require_file "$RUN_LOG"
require_file "$RUN_TAIL_LOG"
require_file "$DRAFT"
require_file "$REVIEW"
require_file "$VALIDATION"
require_file "$REPAIRED"
require_file "$FINAL_VALIDATION"
require_file "$ARCHIVE_NOTE"
require_glob "$RESULT_GLOB"

require_contains 'Workflow "longrun-project-loop" completed.' "$RUN_LOG"
require_contains 'step_end: draft-project (completed)' "$RUN_LOG"
require_contains 'step_end: review-project (completed)' "$RUN_LOG"
require_contains 'step_end: validate-project (completed)' "$RUN_LOG"
require_contains 'step_end: repair-project (completed)' "$RUN_LOG"
require_contains 'step_end: validate-repaired-project (completed)' "$RUN_LOG"
require_contains 'step_end: archive-project (completed)' "$RUN_LOG"
require_contains 'Workflow "longrun-project-loop" completed.' "$RUN_TAIL_LOG"

grep -Eq '^#+[[:space:]]+Project Summary' "$DRAFT" || fail "expected Project Summary heading in $DRAFT"
grep -Eq '^#+[[:space:]]+Scope' "$DRAFT" || fail "expected Scope heading in $DRAFT"
if grep -Eq '^#+[[:space:]]+Next Action' "$DRAFT"; then fail "draft should omit Next Action in $DRAFT"; fi

grep -Eq '^#+[[:space:]]+Strengths' "$REVIEW" || fail "expected Strengths heading in $REVIEW"
grep -Eq '^#+[[:space:]]+Issues' "$REVIEW" || fail "expected Issues heading in $REVIEW"
grep -Eq '^#+[[:space:]]+Suggested Revisions' "$REVIEW" || fail "expected Suggested Revisions heading in $REVIEW"
grep -Eq 'Next Action' "$REVIEW" || fail "expected missing Next Action note in $REVIEW"

grep -Eq '^#+[[:space:]]+Verdict' "$VALIDATION" || fail "expected Verdict heading in $VALIDATION"
grep -Eq 'FAIL' "$VALIDATION" || fail "expected FAIL verdict in $VALIDATION"
grep -Eq 'Next Action' "$VALIDATION" || fail "expected Next Action remediation in $VALIDATION"

grep -Eq '^#+[[:space:]]+Project Summary' "$REPAIRED" || fail "expected Project Summary heading in $REPAIRED"
grep -Eq '^#+[[:space:]]+Scope' "$REPAIRED" || fail "expected Scope heading in $REPAIRED"
grep -Eq '^#+[[:space:]]+Next Action' "$REPAIRED" || fail "expected Next Action heading in $REPAIRED"

grep -Eq '^#+[[:space:]]+Verdict' "$FINAL_VALIDATION" || fail "expected Verdict heading in $FINAL_VALIDATION"
grep -Eq 'PASS' "$FINAL_VALIDATION" || fail "expected PASS verdict in $FINAL_VALIDATION"

grep -Eq '^#+[[:space:]]+Summary of Project' "$ARCHIVE_NOTE" || fail "expected Summary of Project heading in $ARCHIVE_NOTE"
grep -Eq '^#+[[:space:]]+Why Archived' "$ARCHIVE_NOTE" || fail "expected Why Archived heading in $ARCHIVE_NOTE"
grep -Eq '^#+[[:space:]]+Reuse Notes' "$ARCHIVE_NOTE" || fail "expected Reuse Notes heading in $ARCHIVE_NOTE"

echo 'verify.sh: PASS - canonical longrun project loop artifacts and fail→repair→pass flow verified.'
