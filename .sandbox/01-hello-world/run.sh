#!/bin/bash
# Test 01: Hello World
# Expected: Single step execution, output contains greeting

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

echo "=== Test 01: Hello World ==="
echo "Running simplest workflow..."

run_sandbox_workflow "$SCRIPT_DIR" "$@"

echo ""
echo "=== Test Complete ==="
