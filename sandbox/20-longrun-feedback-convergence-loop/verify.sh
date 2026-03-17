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
WORKFLOW_RESULT_GLOB="$ROOT/output/iterations/results/longrun-feedback-convergence-loop-*.json"

CANDIDATES=(
  "$ROOT/output/final/01-v1.md"
  "$ROOT/output/final/03-v2.md"
  "$ROOT/output/final/05-v3.md"
  "$ROOT/output/final/07-v4.md"
)

EVALUATIONS=(
  "$ROOT/output/final/02-eval-v1.md"
  "$ROOT/output/final/04-eval-v2.md"
  "$ROOT/output/final/06-eval-v3.md"
  "$ROOT/output/final/08-eval-v4.md"
)

require_file "$RUN_LOG"
require_file "$RUN_TAIL_LOG"
require_file "$ARCHIVE_NOTE"
require_glob "$WORKFLOW_RESULT_GLOB"

for path in "${CANDIDATES[@]}" "${EVALUATIONS[@]}"; do
  require_file "$path"
done

require_contains 'Workflow "longrun-feedback-convergence-loop" completed.' "$RUN_LOG"
require_contains 'step_end: produce-v1 (completed)' "$RUN_LOG"
require_contains 'step_end: evaluate-v1 (completed)' "$RUN_LOG"
require_contains 'step_end: revise-v2 (completed)' "$RUN_LOG"
require_contains 'step_end: evaluate-v2 (completed)' "$RUN_LOG"
require_contains 'step_end: revise-v3 (completed)' "$RUN_LOG"
require_contains 'step_end: evaluate-v3 (completed)' "$RUN_LOG"
require_contains 'step_end: revise-v4 (completed)' "$RUN_LOG"
require_contains 'step_end: evaluate-v4 (completed)' "$RUN_LOG"
require_contains 'step_end: archive-convergence (completed)' "$RUN_LOG"
require_contains 'Workflow "longrun-feedback-convergence-loop" completed.' "$RUN_TAIL_LOG"

for candidate in "${CANDIDATES[@]}"; do
  grep -Eq '^#[[:space:]]+Objective$' "$candidate" || fail "expected top-level Objective heading in $candidate"
  grep -Eq '^#[[:space:]]+Constraints$' "$candidate" || fail "expected top-level Constraints heading in $candidate"
  grep -Eq '^#[[:space:]]+Proposed Approach$' "$candidate" || fail "expected top-level Proposed Approach heading in $candidate"
  grep -Eq '^#[[:space:]]+Risks$' "$candidate" || fail "expected top-level Risks heading in $candidate"
  grep -Eq '^#[[:space:]]+Success Check$' "$candidate" || fail "expected top-level Success Check heading in $candidate"
  node -e '
const fs = require("fs");
const text = fs.readFileSync(process.argv[1], "utf8");
const headings = text.match(/^# /gm) || [];
if (headings.length !== 5) process.exit(1);
' "$candidate" || fail "expected exactly five top-level sections in $candidate"
done

for evaluation in "${EVALUATIONS[@]}"; do
  grep -Eq '^#[[:space:]]+Score$' "$evaluation" || fail "expected top-level Score heading in $evaluation"
  grep -Eq '^#[[:space:]]+Passed Checks$' "$evaluation" || fail "expected top-level Passed Checks heading in $evaluation"
  grep -Eq '^#[[:space:]]+Failed Checks$' "$evaluation" || fail "expected top-level Failed Checks heading in $evaluation"
  grep -Eq '^#[[:space:]]+Next Action$' "$evaluation" || fail "expected top-level Next Action heading in $evaluation"
  node -e '
const fs = require("fs");
const text = fs.readFileSync(process.argv[1], "utf8");
const headings = text.match(/^# /gm) || [];
if (headings.length !== 4) process.exit(1);
const match = text.match(/^# Score\n\n(?:Score:\s*)?(\d+)\/10/m);
if (!match) process.exit(2);
const score = Number(match[1]);
if (!Number.isInteger(score) || score < 0 || score > 10) process.exit(3);
' "$evaluation" || fail "expected integer /10 score in $evaluation"
done

grep -Fq 'Feedback applied from 02-eval-v1' "$ROOT/output/final/03-v2.md" || fail "expected v2 to reference prior evaluation feedback"
grep -Fq 'Feedback applied from 04-eval-v2' "$ROOT/output/final/05-v3.md" || fail "expected v3 to reference prior evaluation feedback"
grep -Fq 'Feedback applied from 06-eval-v3' "$ROOT/output/final/07-v4.md" || fail "expected v4 to reference prior evaluation feedback"

node -e '
const fs = require("fs");
const paths = process.argv.slice(1);
const scores = paths.map((file) => {
  const text = fs.readFileSync(file, "utf8");
  const match = text.match(/^# Score\n\n(?:Score:\s*)?(\d+)\/10/m);
  if (!match) throw new Error(`missing score in ${file}`);
  return Number(match[1]);
});
for (let i = 1; i < scores.length; i += 1) {
  if (scores[i] <= scores[i - 1]) {
    throw new Error(`scores are not strictly increasing: ${scores.join(" -> ")}`);
  }
}
if (scores[scores.length - 1] < 9) {
  throw new Error(`final score below threshold: ${scores[scores.length - 1]}`);
}
' "${EVALUATIONS[@]}" || fail "expected strictly increasing scores ending at >= 9/10"

grep -Eq '^#[[:space:]]+Summary of Convergence$' "$ARCHIVE_NOTE" || fail "expected top-level Summary of Convergence heading in $ARCHIVE_NOTE"
grep -Eq '^#[[:space:]]+Score Trajectory$' "$ARCHIVE_NOTE" || fail "expected top-level Score Trajectory heading in $ARCHIVE_NOTE"
grep -Eq '^#[[:space:]]+Reuse Notes$' "$ARCHIVE_NOTE" || fail "expected top-level Reuse Notes heading in $ARCHIVE_NOTE"
node -e '
const fs = require("fs");
const text = fs.readFileSync(process.argv[1], "utf8");
const headings = text.match(/^# /gm) || [];
if (headings.length !== 3) process.exit(1);
  if (!/4\s*(?:->|→)\s*6\s*(?:->|→)\s*8\s*(?:->|→)\s*(9|10)/.test(text)) process.exit(2);
' "$ARCHIVE_NOTE" || fail "expected stable archive headings and explicit score trajectory in $ARCHIVE_NOTE"

if (( run_fresh )); then
  for path_to_check in "$RUN_LOG" "$RUN_TAIL_LOG" "$ARCHIVE_NOTE" "${CANDIDATES[@]}" "${EVALUATIONS[@]}"; do
    [[ "$path_to_check" -nt "$stamp_file" ]] || fail "expected regenerated artifact newer than fresh-run stamp: $path_to_check"
  done
  rm -f "$stamp_file"
fi

echo 'verify.sh: PASS - canonical longrun feedback convergence loop artifacts and repeated evaluate->revise convergence flow verified.'
