#!/bin/bash
# Run individual sandbox test

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "$1" ]; then
    echo "Usage: $0 <test-case>"
    echo ""
    echo "Available test cases:"
    ls -1 "$SCRIPT_DIR" | grep -E '^[0-9]+' | while read dir; do
        echo "  - $dir"
    done
    exit 1
fi

TEST_CASE="$1"
TEST_DIR="$SCRIPT_DIR/$TEST_CASE"

if [ ! -d "$TEST_DIR" ]; then
    echo "Error: Test case '$TEST_CASE' not found"
    echo "Looking for: $TEST_DIR"
    exit 1
fi

cd "$TEST_DIR"

if [ -f "run.sh" ]; then
    bash run.sh
else
    echo "Running workflow directly..."
    obora run workflow.yaml --verbose
fi
