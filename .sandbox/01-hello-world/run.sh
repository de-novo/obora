#!/bin/bash
# Test 01: Hello World
# Expected: Single step execution, output contains greeting

cd "$(dirname "$0")"

echo "=== Test 01: Hello World ==="
echo "Running simplest workflow..."

obora run workflow.yaml --verbose

echo ""
echo "=== Test Complete ==="
