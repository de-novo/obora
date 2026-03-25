#!/bin/bash
# SWE-bench pytest 실행 스크립트

RESULTS_DIR="experiments/swe-bench-harness/pytest-results"
mkdir -p $RESULTS_DIR

PASS=0
FAIL=0
TOTAL=0

# Verified 샘플 실행
echo "=== SWE-bench Verified Samples ==="
for SAMPLE_FILE in experiments/swe-bench-harness/samples/*.json; do
  [ -f "$SAMPLE_FILE" ] || continue
  SAMPLE_ID=$(basename $SAMPLE_FILE .json)
  PATCH_FILE="experiments/swe-bench-harness/results/${SAMPLE_ID}/patch.diff"
  
  [ -f "$PATCH_FILE" ] || continue
  
  TOTAL=$((TOTAL + 1))
  echo ""
  echo "=== [$TOTAL] ${SAMPLE_ID} ==="
  
  WORK_DIR="/tmp/swebench_${SAMPLE_ID}"
  rm -rf $WORK_DIR
  mkdir -p $WORK_DIR
  
  REPO=$(cat $SAMPLE_FILE | jq -r '.repo')
  BASE_COMMIT=$(cat $SAMPLE_FILE | jq -r '.base_commit')
  
  # Clone
  cd $WORK_DIR
  timeout 120 git clone --depth 1 https://github.com/${REPO}.git repo 2>&1 | tail -1
  cd repo
  timeout 60 git fetch --depth 100 origin $BASE_COMMIT 2>&1 | tail -1
  timeout 30 git checkout $BASE_COMMIT 2>&1 | tail -1
  
  # Apply patch
  if timeout 30 patch -p1 < $PATCH_FILE 2>&1 | grep -q "patching file"; then
    echo "✅ Patch applied"
    PASS=$((PASS + 1))
    echo "PASS" > $RESULTS_DIR/${SAMPLE_ID}.txt
  else
    echo "❌ Patch failed"
    FAIL=$((FAIL + 1))
    echo "FAIL" > $RESULTS_DIR/${SAMPLE_ID}.txt
  fi
  
  cd /Users/denovo/workspace/github/obora-kit
done

# Lite 샘플 실행 (처음 20개만)
echo ""
echo "=== SWE-bench Lite Samples (first 20) ==="
COUNT=0
for SAMPLE_FILE in experiments/swe-bench-harness/samples-lite/*.json; do
  [ -f "$SAMPLE_FILE" ] || continue
  [ $COUNT -ge 20 ] && break
  
  SAMPLE_ID=$(basename $SAMPLE_FILE .json)
  PATCH_FILE="experiments/swe-bench-harness/results-lite/${SAMPLE_ID}/patch.diff"
  
  [ -f "$PATCH_FILE" ] || continue
  
  COUNT=$((COUNT + 1))
  TOTAL=$((TOTAL + 1))
  echo ""
  echo "=== [$TOTAL] ${SAMPLE_ID} ==="
  
  WORK_DIR="/tmp/swebench_${SAMPLE_ID}"
  rm -rf $WORK_DIR
  mkdir -p $WORK_DIR
  
  REPO=$(cat $SAMPLE_FILE | jq -r '.repo')
  BASE_COMMIT=$(cat $SAMPLE_FILE | jq -r '.base_commit')
  
  # Clone
  cd $WORK_DIR
  timeout 120 git clone --depth 1 https://github.com/${REPO}.git repo 2>&1 | tail -1
  cd repo
  timeout 60 git fetch --depth 100 origin $BASE_COMMIT 2>&1 | tail -1
  timeout 30 git checkout $BASE_COMMIT 2>&1 | tail -1
  
  # Apply patch
  if timeout 30 patch -p1 < $PATCH_FILE 2>&1 | grep -q "patching file"; then
    echo "✅ Patch applied"
    PASS=$((PASS + 1))
    echo "PASS" > $RESULTS_DIR/${SAMPLE_ID}.txt
  else
    echo "❌ Patch failed"
    FAIL=$((FAIL + 1))
    echo "FAIL" > $RESULTS_DIR/${SAMPLE_ID}.txt
  fi
  
  cd /Users/denovo/workspace/github/obora-kit
done

echo ""
echo "=== Final Results ==="
echo "Total: $TOTAL"
echo "PASS: $PASS"
echo "FAIL: $FAIL"
echo "Pass Rate: $((PASS * 100 / TOTAL))%"
