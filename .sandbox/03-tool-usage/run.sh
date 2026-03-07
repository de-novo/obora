#!/bin/bash
# Test 03: Tool Usage
# Expected: Files created, read, and listed via tool calls

cd "$(dirname "$0")"

echo "=== Test 03: Tool Usage ==="
echo "Testing file_write, file_read, file_list tools..."

# Clean up before
rm -f notes.txt output/

obora run workflow.yaml --verbose --output-dir ./output

echo ""
echo "=== Checking results ==="
if [ -f "notes.txt" ]; then
    echo "✓ notes.txt was created"
    cat notes.txt
else
    echo "✗ notes.txt was NOT created"
fi

echo ""
echo "=== Cleanup ==="
rm -f notes.txt

echo "=== Test Complete ==="
