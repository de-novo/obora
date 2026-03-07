#!/bin/bash
# Test 05: Policy Gate
# Expected: Policy gate blocks/enables execution based on conditions

cd "$(dirname "$0")"

echo "=== Test 05: Policy Gate ==="
echo "Testing policy enforcement..."

obora run workflow.yaml --verbose

echo ""
echo "=== Test Complete ==="
