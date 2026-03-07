#!/bin/bash
# Test 04: Consensus
# Expected: Multiple agents vote, majority decides

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

echo "=== Test 04: Consensus ==="
echo "Testing multi-agent consensus pattern..."

run_sandbox_workflow "$SCRIPT_DIR" "$@"

echo ""
echo "=== Test Complete ==="
