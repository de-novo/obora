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
REPORT="$ROOT/output/final/01-paper-verification.md"
ARCHIVE_NOTE="$ROOT/output/archive/40-paper-verification-note.md"
WORKFLOW_RESULT_GLOB="$ROOT/output/iterations/results/longrun-paper-verification-mini-*.json"

require_file "$RUN_LOG"
require_file "$RUN_TAIL_LOG"
require_file "$REPORT"
require_file "$ARCHIVE_NOTE"
require_glob "$WORKFLOW_RESULT_GLOB"

require_contains 'Workflow "longrun-paper-verification-mini" completed.' "$RUN_LOG"
require_contains 'step_end: verify-paper-claims (completed)' "$RUN_LOG"
require_contains 'step_end: archive-paper-verification (completed)' "$RUN_LOG"
require_contains 'Workflow "longrun-paper-verification-mini" completed.' "$RUN_TAIL_LOG"

grep -Eq '^#[[:space:]]+Paper Metadata$' "$REPORT" || fail "expected top-level Paper Metadata heading in $REPORT"
grep -Eq '^#[[:space:]]+Verification Summary$' "$REPORT" || fail "expected top-level Verification Summary heading in $REPORT"
grep -Eq '^#[[:space:]]+Claim-by-Claim Assessment$' "$REPORT" || fail "expected top-level Claim-by-Claim Assessment heading in $REPORT"
grep -Eq '^#[[:space:]]+Evidence Notes$' "$REPORT" || fail "expected top-level Evidence Notes heading in $REPORT"
grep -Eq '^#[[:space:]]+Final Verdict$' "$REPORT" || fail "expected top-level Final Verdict heading in $REPORT"
grep -Eq '^# ' "$REPORT" || fail "expected H1 headings in $REPORT"
grep -Eq 'SUPPORTED|PARTIAL|UNSUPPORTED' "$REPORT" || fail "expected claim markers in $REPORT"
grep -Eq 'Claim 1|Claim 2|Claim 3|Claim 4' "$REPORT" || fail "expected numbered claims in $REPORT"
grep -Eq 'Excerpt A|Excerpt B|Excerpt C|Excerpt D|Excerpt E|Excerpt F' "$REPORT" || fail "expected excerpt references in $REPORT"
grep -Eq 'https://arxiv.org/abs/2106.09685' "$REPORT" || fail "expected stable paper URL in $REPORT"

node -e '
const fs = require("fs");
const text = fs.readFileSync(process.argv[1], "utf8");
const headings = text.match(/^# /gm) || [];
if (headings.length !== 5) process.exit(1);
' "$REPORT" || fail "expected exactly five top-level sections in $REPORT"

node -e '
const fs = require("fs");
const path = process.argv[1];
const text = fs.readFileSync(path, "utf8");
const claims = ["Claim 1", "Claim 2", "Claim 3", "Claim 4"];
for (const claim of claims) {
  if (!text.includes(claim)) process.exit(1);
}
const markers = text.match(/\b(SUPPORTED|PARTIAL|UNSUPPORTED)\b/g) || [];
if (markers.length < 4) process.exit(2);
' "$REPORT" || fail "expected four assessed claims in $REPORT"

grep -Eq '^#[[:space:]]+Summary of Verification$' "$ARCHIVE_NOTE" || fail "expected top-level Summary of Verification heading in $ARCHIVE_NOTE"
grep -Eq '^#[[:space:]]+Paper Verification Result$' "$ARCHIVE_NOTE" || fail "expected top-level Paper Verification Result heading in $ARCHIVE_NOTE"
grep -Eq '^#[[:space:]]+Reuse Notes$' "$ARCHIVE_NOTE" || fail "expected top-level Reuse Notes heading in $ARCHIVE_NOTE"

node -e '
const fs = require("fs");
const text = fs.readFileSync(process.argv[1], "utf8");
const headings = text.match(/^# /gm) || [];
if (headings.length !== 3) process.exit(1);
' "$ARCHIVE_NOTE" || fail "expected exactly three top-level sections in $ARCHIVE_NOTE"

echo 'verify.sh: PASS - canonical longrun paper verification mini artifacts and verification→archive flow verified.'
