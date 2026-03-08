#!/bin/bash
# Test 07: Custom Tools
# Expected: Custom tools are injected, called, and verified end-to-end

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

require_provider_auth zai

echo "=== Test 07: Custom Tools ==="
echo "Testing runnable custom tool injection..."

rm -rf "$SCRIPT_DIR/output"

node "$SCRIPT_DIR/run.mjs"

echo ""
echo "=== Test Complete ==="
