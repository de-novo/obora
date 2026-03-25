#!/bin/bash

cd /Users/denovo/workspace/github/obora-kit

RESULTS_DIR="experiments/swe-bench-harness/results-lite-full"
mkdir -p $RESULTS_DIR

PASS=0
FAIL=0
TOTAL=0

echo "=== Generating Patches for 300 SWE-bench Lite Samples ==="
echo "Start: $(date)"

for SAMPLE_FILE in experiments/swe-bench-harness/samples-lite-full/*.json; do
  [ -f "$SAMPLE_FILE" ] || continue
  [[ "$SAMPLE_FILE" == *"metadata"* ]] && continue
  
  SAMPLE_ID=$(basename $SAMPLE_FILE .json)
  TOTAL=$((TOTAL + 1))
  
  echo ""
  echo "=== [$TOTAL/300] ${SAMPLE_ID} ==="
  
  SAMPLE_DIR="${RESULTS_DIR}/${SAMPLE_ID}"
  mkdir -p $SAMPLE_DIR
  
  # 워크플로우 생성
  cat > /tmp/sample_wf.yaml << EOF
name: lite-full
version: "1.0"
steps:
  - name: fix
    agent: solver
    input:
      task: |
        Read: ${SAMPLE_FILE}
        Write patch to: ${SAMPLE_DIR}/patch.diff
EOF
  
  # Obora 실행
  node bin/obora.js run /tmp/sample_wf.yaml \
    --agents experiments/quick-benchmark/agents.yaml \
    --output-dir ${SAMPLE_DIR}/obora \
    --timeout 180000 \
    2>&1 | tail -2
  
  # 결과 확인
  if [ -f "${SAMPLE_DIR}/patch.diff" ]; then
    echo "✅ PASS"
    PASS=$((PASS + 1))
  else
    echo "❌ FAIL"
    FAIL=$((FAIL + 1))
  fi
  
  # 진행 상황 저장
  echo "${SAMPLE_ID}: $([ -f ${SAMPLE_DIR}/patch.diff ] && echo PASS || echo FAIL)" >> ${RESULTS_DIR}/progress.log
done

echo ""
echo "=== Final Results ==="
echo "End: $(date)"
echo "Total: $TOTAL"
echo "PASS: $PASS"
echo "FAIL: $FAIL"
echo "Pass Rate: $((PASS * 100 / TOTAL))%"
