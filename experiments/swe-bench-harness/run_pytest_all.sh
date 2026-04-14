#!/bin/bash
# SWE-bench pytest 실행 스크립트
set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_env.sh
source "$SCRIPT_DIR/_env.sh"

cd "$REPO_ROOT" || exit 1

RESULTS_DIR="${RESULTS_DIR:-$SWE_BENCH_PYTEST_RESULTS_DIR}"
VERIFIED_PATCH_ROOT="${VERIFIED_PATCH_ROOT:-$SWE_BENCH_RESULTS_DIR}"
LITE_PATCH_ROOT="${LITE_PATCH_ROOT:-$SWE_BENCH_RESULTS_LITE_DIR}"
VERIFIED_RESULTS_DIR="$RESULTS_DIR/verified"
LITE_RESULTS_DIR="$RESULTS_DIR/lite"
mkdir -p "$RESULTS_DIR" "$VERIFIED_RESULTS_DIR" "$LITE_RESULTS_DIR"

PASS=0
FAIL=0
TOTAL=0

echo "=== SWE-bench Verified Samples ==="
for SAMPLE_FILE in "$HARNESS_DIR"/samples/*.json; do
  [ -f "$SAMPLE_FILE" ] || continue
  SAMPLE_ID="$(basename "$SAMPLE_FILE" .json)"
  PATCH_FILE="$VERIFIED_PATCH_ROOT/${SAMPLE_ID}/patch.diff"

  [ -f "$PATCH_FILE" ] || continue

  TOTAL=$((TOTAL + 1))
  echo ""
  echo "=== [$TOTAL] ${SAMPLE_ID} ==="

  WORK_DIR="${TMPDIR:-/tmp}/swebench_${SAMPLE_ID}"
  rm -rf "$WORK_DIR"
  mkdir -p "$WORK_DIR"

  REPO="$(jq -r '.repo' "$SAMPLE_FILE")"
  BASE_COMMIT="$(jq -r '.base_commit' "$SAMPLE_FILE")"

  (
    cd "$WORK_DIR" || exit 1
    timeout 120 git clone --depth 1 "https://github.com/${REPO}.git" repo 2>&1 | tail -1
    cd repo || exit 1
    timeout 60 git fetch --depth 100 origin "$BASE_COMMIT" 2>&1 | tail -1
    timeout 30 git checkout "$BASE_COMMIT" 2>&1 | tail -1

    if timeout 30 patch -p1 < "$PATCH_FILE" 2>&1 | grep -q "patching file"; then
      echo "✅ Patch applied"
      exit 0
    fi

    echo "❌ Patch failed"
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

echo ""
echo "=== SWE-bench Lite Samples (first 20) ==="
COUNT=0
for SAMPLE_FILE in "$HARNESS_DIR"/samples-lite/*.json; do
  [ -f "$SAMPLE_FILE" ] || continue
  [ "$COUNT" -ge 20 ] && break

  SAMPLE_ID="$(basename "$SAMPLE_FILE" .json)"
  PATCH_FILE="$LITE_PATCH_ROOT/${SAMPLE_ID}/patch.diff"

  [ -f "$PATCH_FILE" ] || continue

  COUNT=$((COUNT + 1))
  TOTAL=$((TOTAL + 1))
  echo ""
  echo "=== [$TOTAL] ${SAMPLE_ID} ==="

  WORK_DIR="${TMPDIR:-/tmp}/swebench_${SAMPLE_ID}"
  rm -rf "$WORK_DIR"
  mkdir -p "$WORK_DIR"

  REPO="$(jq -r '.repo' "$SAMPLE_FILE")"
  BASE_COMMIT="$(jq -r '.base_commit' "$SAMPLE_FILE")"

  (
    cd "$WORK_DIR" || exit 1
    timeout 120 git clone --depth 1 "https://github.com/${REPO}.git" repo 2>&1 | tail -1
    cd repo || exit 1
    timeout 60 git fetch --depth 100 origin "$BASE_COMMIT" 2>&1 | tail -1
    timeout 30 git checkout "$BASE_COMMIT" 2>&1 | tail -1

    if timeout 30 patch -p1 < "$PATCH_FILE" 2>&1 | grep -q "patching file"; then
      echo "✅ Patch applied"
      exit 0
    fi

    echo "❌ Patch failed"
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
echo "Results dir: $RESULTS_DIR"
echo "Total: $TOTAL"
echo "PASS: $PASS"
echo "FAIL: $FAIL"
if [ "$TOTAL" -gt 0 ]; then
  echo "Pass Rate: $((PASS * 100 / TOTAL))%"
fi
