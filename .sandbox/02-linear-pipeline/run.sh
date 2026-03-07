#!/bin/bash
# Test 02: Linear Pipeline
# Expected: 3 steps executed in order, each receives previous output

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

echo "=== Test 02: Linear Pipeline ==="
echo "Running 3-step pipeline with dependencies..."

run_sandbox_workflow "$SCRIPT_DIR" "$@"

echo ""
echo "=== Test Complete ==="
