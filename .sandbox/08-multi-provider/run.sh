#!/bin/bash
# Test 08: Multi-Provider
# Expected: Different LLM providers used in same workflow

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

echo "=== Test 08: Multi-Provider ==="
echo "Testing multiple LLM providers in one workflow..."
echo ""

if [ -z "${ZAI_API_KEY:-}" ]; then
    echo "⚠️  ZAI_API_KEY not set"
    echo ""
    echo "Skipping execution - set both API keys to run this test:"
    echo "  export ZAI_API_KEY='your-key'"
    echo "  export OPENAI_API_KEY='your-key'"
    echo ""
    echo "=== Test Complete ==="
    exit 0
fi

if [ -z "${OPENAI_API_KEY:-}" ]; then
    echo "⚠️  OPENAI_API_KEY not set"
    echo ""
    echo "Skipping execution - set both API keys to run this test:"
    echo "  export ZAI_API_KEY='your-key'"
    echo "  export OPENAI_API_KEY='your-key'"
    echo ""
    echo "=== Test Complete ==="
    exit 0
fi

run_sandbox_workflow "$SCRIPT_DIR" "$@"

echo ""
echo "=== Test Complete ==="
