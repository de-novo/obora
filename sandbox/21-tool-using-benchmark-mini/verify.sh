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
stamp_file=""
case "${1:-}" in
  "") ;;
  --fresh) run_fresh=1; shift ;;
  -h|--help) usage; exit 0 ;;
  *) usage; fail "unknown argument: $1" ;;
esac

(( $# == 0 )) || { usage; fail "unexpected extra arguments"; }

if (( run_fresh )); then
  stamp_file="$(mktemp "${TMPDIR:-/tmp}/tool-using-benchmark.XXXXXX")"
  rm -rf "$ROOT/output/final" "$ROOT/output/archive" "$ROOT/output/iterations"
  "$ROOT/run.sh"
fi

RUN_LOG="$ROOT/output/iterations/logs/run.log"
RUN_TAIL_LOG="$ROOT/output/iterations/logs/run.tail.log"
ATTEMPT="$ROOT/output/final/01-attempt.md"
VERDICT="$ROOT/output/final/02-verdict.md"
ARCHIVE_NOTE="$ROOT/output/archive/40-tool-using-benchmark-note.md"
RESULT_GLOB="$ROOT/output/iterations/results/tool-using-benchmark-mini-*.json"

require_file "$RUN_LOG"
require_file "$RUN_TAIL_LOG"
require_file "$ATTEMPT"
require_file "$VERDICT"
require_file "$ARCHIVE_NOTE"
require_glob "$RESULT_GLOB"

require_contains 'Workflow "tool-using-benchmark-mini" completed.' "$RUN_LOG"
require_contains 'step_end: solve-with-tool (completed)' "$RUN_LOG"
require_contains 'step_end: judge-tool-result (completed)' "$RUN_LOG"
require_contains 'step_end: archive-tool-benchmark (completed)' "$RUN_LOG"
require_contains 'Workflow "tool-using-benchmark-mini" completed.' "$RUN_TAIL_LOG"

node -e '
const fs = require("fs");
const text = fs.readFileSync(process.argv[1], "utf8");
for (const heading of ["Final Answer", "Short Reasoning", "Tool Used", "Observed Tool Output Summary"]) {
  if (!new RegExp(`^#+\\s+${heading}$`, "m").test(text)) process.exit(2);
}
if (!/file_list/.test(text) || !/file_read/.test(text)) process.exit(3);
if (!/report-(amber|indigo|slate)-\d+\.json/.test(text)) process.exit(4);
if (!/91/.test(text)) process.exit(5);
' "$ATTEMPT" || fail "expected stable attempt structure and tool evidence in $ATTEMPT"

node -e '
const fs = require("fs");
const text = fs.readFileSync(process.argv[1], "utf8");
for (const heading of ["Verdict", "Answer Check", "Tool Usage Check", "Evidence Check", "Feedback"]) {
  if (!new RegExp(`^#+\\s+(?:\\d+\\.\\s+)?${heading}$`, "m").test(text)) process.exit(2);
}
if (!/PASS/.test(text)) process.exit(3);
if (!/report-indigo-03\.json/.test(text)) process.exit(4);
if (!/indigo-03/.test(text)) process.exit(5);
if (!/91/.test(text)) process.exit(6);
if (!/file_list/.test(text) || !/file_read/.test(text)) process.exit(7);
' "$VERDICT" || fail "expected PASS verdict with tool-use evidence in $VERDICT"

node -e '
const fs = require("fs");
const text = fs.readFileSync(process.argv[1], "utf8");
for (const heading of ["Summary of Attempt", "Tool Evidence", "Benchmark Result", "Reuse Notes"]) {
  if (!new RegExp(`^#+\\s+${heading}$`, "m").test(text)) process.exit(2);
}
if (!/tool-discovered benchmark reports/.test(text)) process.exit(3);
if (!/report-indigo-03\.json/.test(text)) process.exit(4);
' "$ARCHIVE_NOTE" || fail "expected stable archive note structure in $ARCHIVE_NOTE"

if (( run_fresh )); then
  for path_to_check in "$RUN_LOG" "$RUN_TAIL_LOG" "$ATTEMPT" "$VERDICT" "$ARCHIVE_NOTE"; do
    [[ "$path_to_check" -nt "$stamp_file" ]] || fail "expected regenerated artifact newer than fresh-run stamp: $path_to_check"
  done
  rm -f "$stamp_file"
fi

echo 'verify.sh: PASS - canonical tool-using benchmark mini artifacts and tool-dependent benchmark flow verified.'
