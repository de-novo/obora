#!/bin/bash
# Test 08: Multi-Provider
# Expected: Different LLM providers used in same workflow

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/../common.sh"

echo "=== Test 08: Multi-Provider ==="
echo "Testing multiple LLM providers in one workflow..."
echo ""

if ! provider_auth_available zai; then
    echo "⚠️  ZAI auth not set"
    echo ""
    echo "Skipping execution - configure both providers to run this test:"
    echo "  ~/.obora/global-auth.json (zai/openai) or matching env vars"
    echo ""
    echo "=== Test Complete ==="
    exit 0
fi

if ! provider_auth_available openai; then
    echo "⚠️  OpenAI auth not set"
    echo ""
    echo "Skipping execution - configure both providers to run this test:"
    echo "  ~/.obora/global-auth.json (zai/openai) or matching env vars"
    echo ""
    echo "=== Test Complete ==="
    exit 0
fi

run_sandbox_workflow "$SCRIPT_DIR" "$@"

echo ""
echo "=== Test Complete ==="
