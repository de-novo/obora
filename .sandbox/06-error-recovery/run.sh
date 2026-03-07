#!/bin/bash
# Test 06: Error Recovery
# Expected: Retry mechanism activates on failure

cd "$(dirname "$0")"

echo "=== Test 06: Error Recovery ==="
echo "Testing retry and recovery mechanisms..."

obora run workflow.yaml --verbose

echo ""
echo "=== Test Complete ==="
