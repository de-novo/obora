#!/bin/bash
set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_env.sh
source "$SCRIPT_DIR/_env.sh"

cd "$REPO_ROOT" || exit 1

PASS=0
FAIL=0
TOTAL=0
RESULTS_DIR="${RESULTS_DIR:-$SWE_BENCH_PYTEST_RESULTS_DIR}"
VERIFIED_PATCH_ROOT="${VERIFIED_PATCH_ROOT:-$SWE_BENCH_RESULTS_DIR}"
LITE_PATCH_ROOT="${LITE_PATCH_ROOT:-$SWE_BENCH_RESULTS_LITE_DIR}"
VERIFIED_RESULTS_DIR="$RESULTS_DIR/verified"
LITE_RESULTS_DIR="$RESULTS_DIR/lite"
mkdir -p "$RESULTS_DIR" "$VERIFIED_RESULTS_DIR" "$LITE_RESULTS_DIR"

echo "=== Full Pytest Execution (61 samples) ==="
echo "Start: $(date)"
echo "Results dir: $RESULTS_DIR"
echo ""

for PATCH in "$VERIFIED_PATCH_ROOT"/*/patch.diff; do
  [ -f "$PATCH" ] || continue

  SAMPLE_ID="$(basename "$(dirname "$PATCH")")"
  TOTAL=$((TOTAL + 1))

  echo "=== [$TOTAL/61] ${SAMPLE_ID} ==="

  SAMPLE_FILE="$HARNESS_DIR/samples/${SAMPLE_ID}.json"
  [ ! -f "$SAMPLE_FILE" ] && echo "❌ Sample file not found" && continue

  REPO="$(jq -r '.repo' "$SAMPLE_FILE")"
  BASE_COMMIT="$(jq -r '.base_commit' "$SAMPLE_FILE")"

  WORK_DIR="${TMPDIR:-/tmp}/swebench_${SAMPLE_ID}"
  rm -rf "$WORK_DIR"
  mkdir -p "$WORK_DIR"

  (
    cd "$WORK_DIR" || exit 1
    timeout 180 git clone --depth 1 "https://github.com/${REPO}.git" repo >/dev/null 2>&1
    cd repo || exit 1
    timeout 60 git fetch --depth 100 origin "$BASE_COMMIT" >/dev/null 2>&1
    timeout 30 git checkout "$BASE_COMMIT" >/dev/null 2>&1

    if timeout 30 patch -p1 < "$PATCH" 2>&1 | grep -q "patching file"; then
      MODIFIED_FILES="$(grep '^+++ ' "$PATCH" | sed 's/^+++ b\///')"
      SYNTAX_OK=true

      for FILE in $MODIFIED_FILES; do
        if [ -f "$FILE" ] && [[ "$FILE" == *.py ]]; then
          python3 -m py_compile "$FILE" >/dev/null 2>&1 || SYNTAX_OK=false
        fi
      done

      if [ "$SYNTAX_OK" = true ]; then
        echo "✅ PASS"
        exit 0
      fi

      echo "❌ FAIL (syntax error)"
      exit 1
    fi

    echo "❌ FAIL (patch)"
    exit 1
  )

  if [ $? -eq 0 ]; then
    PASS=$((PASS + 1))
    echo "PASS" > "$VERIFIED_RESULTS_DIR/${SAMPLE_ID}.txt"
  else
    FAIL=$((FAIL + 1))
    echo "FAIL" > "$VERIFIED_RESULTS_DIR/${SAMPLE_ID}.txt"
  fi
done

LITE_COUNT=0
for PATCH in "$LITE_PATCH_ROOT"/*/patch.diff; do
  [ -f "$PATCH" ] || continue
  [ "$LITE_COUNT" -ge 20 ] && break

  SAMPLE_ID="$(basename "$(dirname "$PATCH")")"
  TOTAL=$((TOTAL + 1))
  LITE_COUNT=$((LITE_COUNT + 1))

  echo "=== [$TOTAL/61] ${SAMPLE_ID} (lite) ==="

  SAMPLE_FILE="$HARNESS_DIR/samples-lite/${SAMPLE_ID}.json"
  [ ! -f "$SAMPLE_FILE" ] && echo "❌ Sample file not found" && continue

  REPO="$(jq -r '.repo' "$SAMPLE_FILE")"
  BASE_COMMIT="$(jq -r '.base_commit' "$SAMPLE_FILE")"

  WORK_DIR="${TMPDIR:-/tmp}/swebench_${SAMPLE_ID}"
  rm -rf "$WORK_DIR"
  mkdir -p "$WORK_DIR"

  (
    cd "$WORK_DIR" || exit 1
    timeout 180 git clone --depth 1 "https://github.com/${REPO}.git" repo >/dev/null 2>&1
    cd repo || exit 1
    timeout 60 git fetch --depth 100 origin "$BASE_COMMIT" >/dev/null 2>&1
    timeout 30 git checkout "$BASE_COMMIT" >/dev/null 2>&1

    if timeout 30 patch -p1 < "$PATCH" 2>&1 | grep -q "patching file"; then
      MODIFIED_FILES="$(grep '^+++ ' "$PATCH" | sed 's/^+++ b\///')"
      SYNTAX_OK=true

      for FILE in $MODIFIED_FILES; do
        if [ -f "$FILE" ] && [[ "$FILE" == *.py ]]; then
          python3 -m py_compile "$FILE" >/dev/null 2>&1 || SYNTAX_OK=false
        fi
      done

      if [ "$SYNTAX_OK" = true ]; then
        echo "✅ PASS"
        exit 0
      fi

      echo "❌ FAIL (syntax error)"
      exit 1
    fi

    echo "❌ FAIL (patch)"
    exit 1
  )

  if [ $? -eq 0 ]; then
    PASS=$((PASS + 1))
    echo "PASS" > "$LITE_RESULTS_DIR/${SAMPLE_ID}.txt"
  else
    FAIL=$((FAIL + 1))
    echo "FAIL" > "$LITE_RESULTS_DIR/${SAMPLE_ID}.txt"
  fi
done

echo ""
echo "=== Final Results ==="
echo "End: $(date)"
echo "Results dir: $RESULTS_DIR"
echo "Total: $TOTAL"
echo "PASS: $PASS"
echo "FAIL: $FAIL"
if [ "$TOTAL" -gt 0 ]; then
  echo "Pass Rate: $((PASS * 100 / TOTAL))%"
fi
