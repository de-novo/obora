#!/bin/bash
set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_env.sh
source "$SCRIPT_DIR/_env.sh"

cd "$REPO_ROOT" || exit 1

SAMPLES_DIR="${SAMPLES_DIR:-$HARNESS_DIR/samples-lite-full}"
RESULTS_DIR="${RESULTS_DIR:-$SWE_BENCH_RESULTS_LITE_FULL_DIR}"
AGENTS_FILE="${AGENTS_FILE:-$REPO_ROOT/experiments/quick-benchmark/agents.yaml}"
WORKFLOW_FILE="$(mktemp "${TMPDIR:-/tmp}/swe-bench-lite-full-XXXXXX.yaml")"
trap 'rm -f "$WORKFLOW_FILE"' EXIT

if [ ! -f "$OBORA_CLI_BIN" ]; then
  echo "Missing CLI build: $OBORA_CLI_BIN"
  echo "Run pnpm --filter @obora/cli build first."
  exit 1
fi

mkdir -p "$RESULTS_DIR"
PASS=0
FAIL=0
TOTAL=0

echo "=== Generating Patches for SWE-bench Lite Full Samples ==="
echo "Start: $(date)"
echo "Results dir: $RESULTS_DIR"

while IFS= read -r SAMPLE_FILE; do
  [ -f "$SAMPLE_FILE" ] || continue

  SAMPLE_ID="$(basename "$SAMPLE_FILE" .json)"
  TOTAL=$((TOTAL + 1))

  echo ""
  echo "=== [$TOTAL] ${SAMPLE_ID} ==="

  SAMPLE_DIR="${RESULTS_DIR}/${SAMPLE_ID}"
  mkdir -p "$SAMPLE_DIR"

  cat > "$WORKFLOW_FILE" <<EOF
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

  node "$OBORA_CLI_BIN" run "$WORKFLOW_FILE" \
    --agents "$AGENTS_FILE" \
    --output-dir "$SAMPLE_DIR/obora" \
    --timeout 180000 \
    2>&1 | tail -2

  if [ -f "${SAMPLE_DIR}/patch.diff" ]; then
    echo "✅ PASS"
    PASS=$((PASS + 1))
  else
    echo "❌ FAIL"
    FAIL=$((FAIL + 1))
  fi

  echo "${SAMPLE_ID}: $([ -f "${SAMPLE_DIR}/patch.diff" ] && echo PASS || echo FAIL)" >> "${RESULTS_DIR}/progress.log"
done < <(find "$SAMPLES_DIR" -maxdepth 1 -name '*.json' ! -name 'metadata.json' | sort)

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
