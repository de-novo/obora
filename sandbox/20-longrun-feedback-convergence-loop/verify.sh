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
  stamp_file="$(mktemp "${TMPDIR:-/tmp}/longrun-feedback-loop.XXXXXX")"
  rm -rf "$ROOT/output/final" "$ROOT/output/archive" "$ROOT/output/iterations"
  "$ROOT/run.sh"
fi

RUN_LOG="$ROOT/output/iterations/logs/run.log"
RUN_TAIL_LOG="$ROOT/output/iterations/logs/run.tail.log"
ARCHIVE_NOTE="$ROOT/output/archive/40-feedback-convergence-note.md"
CURRENT_CANDIDATE="$ROOT/output/final/01-current.md"
LATEST_VALIDATION="$ROOT/output/final/02-validation.md"
VALIDATION_HISTORY="$ROOT/output/iterations/30-validation-history.md"
WORKFLOW_RESULT_GLOB="$ROOT/output/iterations/results/longrun-feedback-convergence-loop-*.json"

require_file "$RUN_LOG"
require_file "$RUN_TAIL_LOG"
require_file "$ARCHIVE_NOTE"
require_file "$CURRENT_CANDIDATE"
require_file "$LATEST_VALIDATION"
require_file "$VALIDATION_HISTORY"
require_glob "$WORKFLOW_RESULT_GLOB"

require_contains 'Workflow "longrun-feedback-convergence-loop" completed.' "$RUN_LOG"
require_contains 'step_end: build_or_repair (completed)' "$RUN_LOG"
require_contains 'step_end: validate (completed)' "$RUN_LOG"
require_contains 'step_end: archive-convergence (completed)' "$RUN_LOG"
require_contains 'Workflow "longrun-feedback-convergence-loop" completed.' "$RUN_TAIL_LOG"

node -e '
const fs = require("fs");
const text = fs.readFileSync(process.argv[1], "utf8");
for (const heading of ["Objective", "Constraints", "Proposed Approach", "Risks", "Success Check"]) {
  if (!new RegExp(`^# ${heading}$`, "m").test(text)) process.exit(2);
}
const headings = text.match(/^# /gm) || [];
if (headings.length !== 5) process.exit(1);
' "$CURRENT_CANDIDATE" || fail "expected stable candidate heading structure in $CURRENT_CANDIDATE"

node -e '
const fs = require("fs");
const text = fs.readFileSync(process.argv[1], "utf8");
for (const heading of ["Score", "Verdict", "Passed Checks", "Failed Checks", "Next Action"]) {
  if (!new RegExp(`^# ${heading}$`, "m").test(text)) process.exit(4);
}
const headings = text.match(/^# /gm) || [];
if (headings.length !== 5) process.exit(1);
const match = text.match(/^# Score\n\nScore:\s*(\d+)\/10/m);
if (!match) process.exit(2);
const score = Number(match[1]);
if (!Number.isInteger(score) || score < 0 || score > 10) process.exit(3);
' "$LATEST_VALIDATION" || fail "expected stable validation report structure in $LATEST_VALIDATION"

node -e '
const fs = require("fs");
const log = fs.readFileSync(process.argv[1], "utf8");
const buildCount = (log.match(/step_end: build_or_repair \(completed\)/g) || []).length;
const validateCount = (log.match(/^.*→ validate$/gm) || []).length;
const archiveCount = (log.match(/step_end: archive-convergence \(completed\)/g) || []).length;
if (buildCount < 2) throw new Error(`expected repeated build_or_repair executions, saw ${buildCount}`);
if (validateCount < 2) throw new Error(`expected repeated validate executions, saw ${validateCount}`);
if (validateCount < buildCount) throw new Error(`expected validate to run at least as often as build_or_repair, saw ${buildCount}/${validateCount}`);
if (archiveCount !== 1) throw new Error(`expected exactly one archive step, saw ${archiveCount}`);
' "$RUN_LOG" || fail "expected repeated runtime-native loop execution in $RUN_LOG"

node -e '
const fs = require("fs");
const text = fs.readFileSync(process.argv[1], "utf8");
const rows = [...text.matchAll(/^\|\s*(\d+)\s*\|\s*(\d+)(?:\/10)?\s*\|\s*(PASS|FAIL)\s*\|\s*(.*?)\s*\|$/gm)];
if (rows.length < 2) throw new Error(`expected at least two validation history rows, saw ${rows.length}`);
const scores = rows.map((match) => Number(match[2]));
const verdicts = rows.map((match) => match[3]);
let improved = false;
for (let i = 1; i < scores.length; i += 1) {
  if (scores[i] < scores[i - 1]) {
    throw new Error(`scores regressed: ${scores.join(" -> ")}`);
  }
  if (scores[i] > scores[i - 1]) improved = true;
}
if (!improved) throw new Error(`expected at least one strict improvement: ${scores.join(" -> ")}`);
if (scores[scores.length - 1] < 9) throw new Error(`final score below threshold: ${scores[scores.length - 1]}`);
if (verdicts[verdicts.length - 1] !== "PASS") throw new Error(`final verdict is not PASS: ${verdicts[verdicts.length - 1]}`);
' "$VALIDATION_HISTORY" || fail "expected non-regressing convergence history ending in PASS"

require_contains 'Feedback applied from latest validation:' "$CURRENT_CANDIDATE"
require_contains '9/10' "$CURRENT_CANDIDATE"
require_contains 'runtime-native cyclic feedback loop' "$ARCHIVE_NOTE"
require_contains '9/10' "$ARCHIVE_NOTE"
node -e '
const fs = require("fs");
const text = fs.readFileSync(process.argv[1], "utf8");
if (!/build_or_repair\s*(?:->|→)\s*validate/.test(text)) process.exit(1);
' "$ARCHIVE_NOTE" || fail "expected archive note to describe the build_or_repair back-edge loop"

grep -Eq '^#[[:space:]]+Summary of Convergence$' "$ARCHIVE_NOTE" || fail "expected top-level Summary of Convergence heading in $ARCHIVE_NOTE"
grep -Eq '^#[[:space:]]+Score Trajectory$' "$ARCHIVE_NOTE" || fail "expected top-level Score Trajectory heading in $ARCHIVE_NOTE"
grep -Eq '^#[[:space:]]+Reuse Notes$' "$ARCHIVE_NOTE" || fail "expected top-level Reuse Notes heading in $ARCHIVE_NOTE"
node -e '
const fs = require("fs");
const [archivePath, historyPath] = process.argv.slice(1);
const text = fs.readFileSync(archivePath, "utf8");
const history = fs.readFileSync(historyPath, "utf8");
const headings = text.match(/^# /gm) || [];
if (headings.length !== 3) process.exit(1);
const scores = [...history.matchAll(/^\|\s*\d+\s*\|\s*(\d+)(?:\/10)?\s*\|/gm)].map((match) => match[1]);
if (scores.length < 2) process.exit(2);
if (!scores.every((score) => text.includes(`${score}/10`) || text.includes(score))) process.exit(3);
' "$ARCHIVE_NOTE" "$VALIDATION_HISTORY" || fail "expected stable archive headings and honest score trajectory in $ARCHIVE_NOTE"

if (( run_fresh )); then
  for path_to_check in "$RUN_LOG" "$RUN_TAIL_LOG" "$ARCHIVE_NOTE" "$CURRENT_CANDIDATE" "$LATEST_VALIDATION" "$VALIDATION_HISTORY"; do
    [[ "$path_to_check" -nt "$stamp_file" ]] || fail "expected regenerated artifact newer than fresh-run stamp: $path_to_check"
  done
  rm -f "$stamp_file"
fi

echo 'verify.sh: PASS - canonical longrun feedback convergence loop artifacts and runtime-native cyclic convergence verified.'
