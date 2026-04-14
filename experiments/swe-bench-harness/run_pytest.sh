#!/bin/bash
set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_env.sh
source "$SCRIPT_DIR/_env.sh"

cd "$REPO_ROOT" || exit 1

SAMPLE_ID="${1:-}"
if [ -z "$SAMPLE_ID" ]; then
  echo "Usage: $0 <sample-id>"
  exit 1
fi

WORK_DIR="${TMPDIR:-/tmp}/swebench_${SAMPLE_ID}"
SAMPLE_FILE="$HARNESS_DIR/samples/${SAMPLE_ID}.json"
GENERATED_PATCH="${GENERATED_PATCH:-$SWE_BENCH_RESULTS_DIR/${SAMPLE_ID}/patch.diff}"

echo "=== Running pytest for ${SAMPLE_ID} ==="

if [ ! -f "$SAMPLE_FILE" ]; then
  echo "ERROR: Sample file not found: $SAMPLE_FILE"
  exit 1
fi

if [ ! -f "$GENERATED_PATCH" ]; then
  echo "ERROR: Generated patch not found: $GENERATED_PATCH"
  exit 1
fi

REPO="$(jq -r '.repo' "$SAMPLE_FILE")"
BASE_COMMIT="$(jq -r '.base_commit' "$SAMPLE_FILE")"

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

echo "Cloning ${REPO}..."
(
  cd "$WORK_DIR" || exit 1
  git clone --depth 1 "https://github.com/${REPO}.git" repo 2>&1 | tail -3
  cd repo || exit 1
  git fetch --depth 1 origin "$BASE_COMMIT" 2>&1 | tail -3
  git checkout "$BASE_COMMIT" 2>&1 | tail -3

  echo "Applying generated patch..."
  if patch -p1 < "$GENERATED_PATCH" 2>&1 | tail -5; then
    echo "✅ Patch applied successfully"
    echo "PASS" > "$WORK_DIR/result.txt"
  else
    echo "❌ Patch failed to apply"
    echo "FAIL" > "$WORK_DIR/result.txt"
  fi
)

echo "Done: ${SAMPLE_ID}"
cat "$WORK_DIR/result.txt" 2>/dev/null || echo "UNKNOWN"
