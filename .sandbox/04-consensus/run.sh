#!/bin/bash
# Test 04: Consensus
# Expected: Multiple agents vote, majority decides

cd "$(dirname "$0")"

echo "=== Test 04: Consensus ==="
echo "Testing multi-agent consensus pattern..."

obora run workflow.yaml --verbose

echo ""
echo "=== Test Complete ==="
