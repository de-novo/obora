#!/bin/bash

SAMPLES_DIR="experiments/swe-bench-harness/samples-lite"
RESULTS_DIR="experiments/swe-bench-harness/results-lite"
mkdir -p $RESULTS_DIR

# 샘플 목록 가져오기
SAMPLES=($(ls $SAMPLES_DIR/*.json | grep -v metadata))

TOTAL=${#SAMPLES[@]}
PASS=0
FAIL=0

echo "Running $TOTAL samples..."

for SAMPLE_FILE in "${SAMPLES[@]}"; do
  SAMPLE_ID=$(basename $SAMPLE_FILE .json)
  SAMPLE_DIR="$RESULTS_DIR/$SAMPLE_ID"
  mkdir -p $SAMPLE_DIR
  
  # 워크플로우 동적 생성
  cat > /tmp/sample-workflow.yaml << EOF
name: swe-bench-lite
version: "1.0"
steps:
  - name: fix
    agent: solver
    input:
      task: |
        Read: $SAMPLE_FILE
        Write patch to: $SAMPLE_DIR/patch.diff
EOF

  echo "[$(($PASS + $FAIL + 1))/$TOTAL] Running: $SAMPLE_ID"
  
  node bin/obora.js run /tmp/sample-workflow.yaml \
    --agents experiments/quick-benchmark/agents.yaml \
    --output-dir $SAMPLE_DIR/obora \
    --timeout 180000 \
    2>&1 | tail -1
  
  # 결과 확인
  if [ -f "$SAMPLE_DIR/patch.diff" ]; then
    echo "  ✅ Patch generated"
    PASS=$((PASS + 1))
  else
    echo "  ❌ No patch"
    FAIL=$((FAIL + 1))
  fi
done

echo ""
echo "=== Results ==="
echo "Total: $TOTAL"
echo "Pass: $PASS"
echo "Fail: $FAIL"
echo "Pass Rate: $((PASS * 100 / TOTAL))%"
