#!/bin/bash
# Test 03: Tool Usage
# Expected: Files created, read, and listed via tool calls

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

echo "=== Test 03: Tool Usage ==="
echo "Testing file_write, file_read, file_list tools..."

rm -rf "$SCRIPT_DIR/output" "$SCRIPT_DIR/notes.txt"

run_sandbox_workflow "$SCRIPT_DIR" --output-dir "$SCRIPT_DIR/output" "$@"

echo ""
echo "=== Checking results ==="
if [ -f "$SCRIPT_DIR/notes.txt" ]; then
    echo "✓ notes.txt was created"
    cat "$SCRIPT_DIR/notes.txt"
else
    echo "✗ notes.txt was NOT created"
    exit 1
fi

echo ""
echo "=== Cleanup ==="
rm -f "$SCRIPT_DIR/notes.txt"

echo "=== Test Complete ==="
