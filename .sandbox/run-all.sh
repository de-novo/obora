#!/bin/bash
# Run all sandbox tests

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "======================================"
echo "  Obora Sandbox Test Suite"
echo "======================================"
echo ""

# Check for API key (ZAI for all tests except docs-only examples)
if [ -z "${ZAI_API_KEY:-}" ]; then
    echo "⚠️  WARNING: ZAI_API_KEY not set"
    echo "   Sandbox workflows that execute LLM steps will fail fast"
    echo "   export ZAI_API_KEY='your-key'"
    echo ""
fi

TEST_DIRS=$(find "$SCRIPT_DIR" -maxdepth 1 -mindepth 1 -type d -name '[0-9]*' -exec basename {} \; | sort)

PASSED=0
FAILED=0
SKIPPED=0

for dir in $TEST_DIRS; do
    TEST_DIR="$SCRIPT_DIR/$dir"

    if [ -d "$TEST_DIR" ] && [ -f "$TEST_DIR/workflow.yaml" -o -f "$TEST_DIR/run.sh" ]; then
        echo ""
        echo "======================================"
        echo "  Running: $dir"
        echo "======================================"

        rm -rf "$TEST_DIR/output" "$TEST_DIR/.obora" 2>/dev/null || true

        if "$SCRIPT_DIR/run.sh" "$dir" 2>&1; then
            ((PASSED+=1))
            echo "✓ $dir: PASSED"
        else
            status=$?
            if [ "$status" -eq 2 ]; then
                ((SKIPPED+=1))
                echo "⊘ $dir: SKIPPED (missing required API key)"
            else
                ((FAILED+=1))
                echo "✗ $dir: FAILED"
            fi
        fi

        rm -rf "$TEST_DIR/output" "$TEST_DIR/.obora" 2>/dev/null || true
    else
        ((SKIPPED+=1))
        echo "⊘ $dir: SKIPPED (no runnable workflow)"
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

if [ "$FAILED" -gt 0 ]; then
    exit 1
fi
