#!/bin/bash
# Run all sandbox tests

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "======================================"
echo "  Obora Sandbox Test Suite"
echo "======================================"
echo ""

# Check for API key
if [ -z "$ZAI_API_KEY" ]; then
    echo "⚠️  WARNING: ZAI_API_KEY not set"
    echo "   Some tests will fail without an API key"
    echo ""
fi

# Find all test directories
TEST_DIRS=$(ls -1 "$SCRIPT_DIR" | grep -E '^[0-9]+' | sort)

PASSED=0
FAILED=0
SKIPPED=0

for dir in $TEST_DIRS; do
    TEST_DIR="$SCRIPT_DIR/$dir"

    if [ -d "$TEST_DIR" ] && [ -f "$TEST_DIR/workflow.yaml" ]; then
        echo ""
        echo "======================================"
        echo "  Running: $dir"
        echo "======================================"

        cd "$TEST_DIR"

        # Clean up previous outputs
        rm -rf output/ .obora/ 2>/dev/null

        # Run the test
        if bash run.sh 2>&1; then
            ((PASSED++))
            echo "✓ $dir: PASSED"
        else
            ((FAILED++))
            echo "✗ $dir: FAILED"
        fi

        # Clean up
        rm -rf output/ .obora/ 2>/dev/null
    else
        ((SKIPPED++))
        echo "⊘ $dir: SKIPPED (no workflow.yaml)"
    fi
done

echo ""
echo "======================================"
echo "  Test Summary"
echo "======================================"
echo "  Passed:  $PASSED"
echo "  Failed:  $FAILED"
echo "  Skipped: $SKIPPED"
echo "======================================"

if [ $FAILED -gt 0 ]; then
    exit 1
fi
