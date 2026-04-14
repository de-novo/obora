#!/bin/bash
set -u
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./_env.sh
source "$SCRIPT_DIR/_env.sh"

cd "$REPO_ROOT" || exit 1

SAMPLES_DIR="${SAMPLES_DIR:-$HARNESS_DIR/samples-lite}"
RESULTS_DIR="${RESULTS_DIR:-$SWE_BENCH_RESULTS_LITE_DIR}"
AGENTS_FILE="${AGENTS_FILE:-$REPO_ROOT/experiments/quick-benchmark/agents.yaml}"
WORKFLOW_FILE="$(mktemp "${TMPDIR:-/tmp}/swe-bench-lite-XXXXXX.yaml")"
trap 'rm -f "$WORKFLOW_FILE"' EXIT

if [ ! -f "$OBORA_CLI_BIN" ]; then
  echo "Missing CLI build: $OBORA_CLI_BIN"
  echo "Run pnpm --filter @obora/cli build first."
  exit 1
fi

mkdir -p "$RESULTS_DIR"
mapfile -t SAMPLES < <(find "$SAMPLES_DIR" -maxdepth 1 -name '*.json' ! -name 'metadata.json' | sort)

TOTAL="${#SAMPLES[@]}"
PASS=0
FAIL=0

echo "Running $TOTAL samples..."
echo "Results dir: $RESULTS_DIR"

for SAMPLE_FILE in "${SAMPLES[@]}"; do
  SAMPLE_ID="$(basename "$SAMPLE_FILE" .json)"
  SAMPLE_DIR="$RESULTS_DIR/$SAMPLE_ID"
  mkdir -p "$SAMPLE_DIR"

  cat > "$WORKFLOW_FILE" <<EOF
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

  echo "[$((PASS + FAIL + 1))/$TOTAL] Running: $SAMPLE_ID"

  node "$OBORA_CLI_BIN" run "$WORKFLOW_FILE" \
    --agents "$AGENTS_FILE" \
    --output-dir "$SAMPLE_DIR/obora" \
    --timeout 180000 \
    2>&1 | tail -1

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
echo "Results dir: $RESULTS_DIR"
echo "Total: $TOTAL"
echo "Pass: $PASS"
echo "Fail: $FAIL"
if [ "$TOTAL" -gt 0 ]; then
  echo "Pass Rate: $((PASS * 100 / TOTAL))%"
fi
