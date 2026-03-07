#!/bin/bash
# Test 08: Multi-Provider
# Expected: Different LLM providers used in same workflow

cd "$(dirname "$0")"

echo "=== Test 08: Multi-Provider ==="
echo "Testing multiple LLM providers in one workflow..."
echo ""

# Check for required API keys
MISSING=0
if [ -z "$ZAI_API_KEY" ]; then
    echo "⚠️  ZAI_API_KEY not set"
    MISSING=1
fi

if [ -z "$OPENAI_API_KEY" ]; then
    echo "⚠️  OPENAI_API_KEY not set"
    MISSING=1
fi

if [ $MISSING -eq 1 ]; then
    echo ""
    echo "Skipping execution - set both API keys to run this test:"
    echo "  export ZAI_API_KEY='your-key'"
    echo "  export OPENAI_API_KEY='your-key'"
    echo ""
    echo "Other tests work with global config defaults."
else
    obora run workflow.yaml --verbose
fi

echo ""
echo "=== Test Complete ==="
