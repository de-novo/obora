#!/bin/bash
# Test 06: Error Recovery
# Expected: Retry mechanism activates on failure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

echo "=== Test 06: Error Recovery ==="
echo "Testing retry and recovery mechanisms..."

run_sandbox_workflow "$SCRIPT_DIR" "$@"

echo ""
echo "=== Test Complete ==="
