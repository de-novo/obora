#!/bin/bash
# Test 05: Policy Gate
# Expected: Policy gate blocks/enables execution based on conditions

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

echo "=== Test 05: Policy Gate ==="
echo "Testing policy enforcement..."

run_sandbox_workflow "$SCRIPT_DIR" "$@"

echo ""
echo "=== Test Complete ==="
