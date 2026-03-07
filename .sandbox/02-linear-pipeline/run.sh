#!/bin/bash
# Test 02: Linear Pipeline
# Expected: 3 steps executed in order, each receives previous output

cd "$(dirname "$0")"

echo "=== Test 02: Linear Pipeline ==="
echo "Running 3-step pipeline with dependencies..."

obora run workflow.yaml --verbose

echo ""
echo "=== Test Complete ==="
