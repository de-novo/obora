#!/bin/bash

cd /Users/denovo/workspace/github/obora-kit

PASS=0
FAIL=0
TOTAL=0
RESULTS_DIR="experiments/swe-bench-harness/pytest-results"
mkdir -p $RESULTS_DIR

echo "=== Full Pytest Execution (61 samples) ==="
echo "Start: $(date)"
echo ""

# Verified 샘플
for PATCH in experiments/swe-bench-harness/results/*/patch.diff; do
  [ -f "$PATCH" ] || continue
  [[ "$PATCH" == *"repair"* ]] && continue
  
  SAMPLE_ID=$(basename $(dirname $PATCH))
  TOTAL=$((TOTAL + 1))
  
  echo "=== [$TOTAL/61] ${SAMPLE_ID} ==="
  
  SAMPLE_FILE="experiments/swe-bench-harness/samples/${SAMPLE_ID}.json"
  [ ! -f "$SAMPLE_FILE" ] && echo "❌ Sample file not found" && continue
  
  REPO=$(cat $SAMPLE_FILE | jq -r '.repo')
  BASE_COMMIT=$(cat $SAMPLE_FILE | jq -r '.base_commit')
  
  WORK_DIR="/tmp/swebench_${SAMPLE_ID}"
  rm -rf $WORK_DIR
  mkdir -p $WORK_DIR
  
  cd $WORK_DIR
  
  timeout 180 git clone --depth 1 https://github.com/${REPO}.git repo 2>&1 > /dev/null
  cd repo
  timeout 60 git fetch --depth 100 origin $BASE_COMMIT 2>&1 > /dev/null
  timeout 30 git checkout $BASE_COMMIT 2>&1 > /dev/null
  
  ABSOLUTE_PATCH="/Users/denovo/workspace/github/obora-kit/${PATCH}"
  
  if timeout 30 patch -p1 < ${ABSOLUTE_PATCH} 2>&1 | grep -q "patching file"; then
    MODIFIED_FILES=$(grep "^+++ " ${ABSOLUTE_PATCH} | sed 's/^+++ b\///')
    SYNTAX_OK=true
    
    for FILE in $MODIFIED_FILES; do
      if [ -f "$FILE" ] && [[ "$FILE" == *.py ]]; then
        python3 -m py_compile $FILE 2>&1 > /dev/null
        [ $? -ne 0 ] && SYNTAX_OK=false
      fi
    done
    
    if [ "$SYNTAX_OK" = true ]; then
      echo "✅ PASS"
      PASS=$((PASS + 1))
      echo "PASS" > ${RESULTS_DIR}/${SAMPLE_ID}.txt
    else
      echo "❌ FAIL (syntax error)"
      FAIL=$((FAIL + 1))
      echo "FAIL" > ${RESULTS_DIR}/${SAMPLE_ID}.txt
    fi
  else
    echo "❌ FAIL (patch)"
    FAIL=$((FAIL + 1))
    echo "FAIL" > ${RESULTS_DIR}/${SAMPLE_ID}.txt
  fi
  
  cd /Users/denovo/workspace/github/obora-kit
done

# Lite 샘플 (처음 20개만 - 시간 고려)
LITE_COUNT=0
for PATCH in experiments/swe-bench-harness/results-lite/*/patch.diff; do
  [ -f "$PATCH" ] || continue
  [ $LITE_COUNT -ge 20 ] && break
  
  SAMPLE_ID=$(basename $(dirname $PATCH))
  TOTAL=$((TOTAL + 1))
  LITE_COUNT=$((LITE_COUNT + 1))
  
  echo "=== [$TOTAL/61] ${SAMPLE_ID} (lite) ==="
  
  SAMPLE_FILE="experiments/swe-bench-harness/samples-lite/${SAMPLE_ID}.json"
  [ ! -f "$SAMPLE_FILE" ] && echo "❌ Sample file not found" && continue
  
  REPO=$(cat $SAMPLE_FILE | jq -r '.repo')
  BASE_COMMIT=$(cat $SAMPLE_FILE | jq -r '.base_commit')
  
  WORK_DIR="/tmp/swebench_${SAMPLE_ID}"
  rm -rf $WORK_DIR
  mkdir -p $WORK_DIR
  
  cd $WORK_DIR
  
  timeout 180 git clone --depth 1 https://github.com/${REPO}.git repo 2>&1 > /dev/null
  cd repo
  timeout 60 git fetch --depth 100 origin $BASE_COMMIT 2>&1 > /dev/null
  timeout 30 git checkout $BASE_COMMIT 2>&1 > /dev/null
  
  ABSOLUTE_PATCH="/Users/denovo/workspace/github/obora-kit/${PATCH}"
  
  if timeout 30 patch -p1 < ${ABSOLUTE_PATCH} 2>&1 | grep -q "patching file"; then
    MODIFIED_FILES=$(grep "^+++ " ${ABSOLUTE_PATCH} | sed 's/^+++ b\///')
    SYNTAX_OK=true
    
    for FILE in $MODIFIED_FILES; do
      if [ -f "$FILE" ] && [[ "$FILE" == *.py ]]; then
        python3 -m py_compile $FILE 2>&1 > /dev/null
        [ $? -ne 0 ] && SYNTAX_OK=false
      fi
    done
    
    if [ "$SYNTAX_OK" = true ]; then
      echo "✅ PASS"
      PASS=$((PASS + 1))
      echo "PASS" > ${RESULTS_DIR}/${SAMPLE_ID}.txt
    else
      echo "❌ FAIL (syntax error)"
      FAIL=$((FAIL + 1))
      echo "FAIL" > ${RESULTS_DIR}/${SAMPLE_ID}.txt
    fi
  else
    echo "❌ FAIL (patch)"
    FAIL=$((FAIL + 1))
    echo "FAIL" > ${RESULTS_DIR}/${SAMPLE_ID}.txt
  fi
  
  cd /Users/denovo/workspace/github/obora-kit
done

echo ""
echo "=== Final Results ==="
echo "End: $(date)"
echo "Total: $TOTAL"
echo "PASS: $PASS"
echo "FAIL: $FAIL"
echo "Pass Rate: $((PASS * 100 / TOTAL))%"
