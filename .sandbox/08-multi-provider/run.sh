#!/bin/bash
# Test 08: Multi-Provider
# Expected: Different LLM providers used in same workflow

cd "$(dirname "$0")"

echo "=== Test 08: Multi-Provider ==="
echo "Testing multiple LLM providers in one workflow..."

# Check for API keys
if [ -z "$ZAI_API_KEY" ]; then
    echo "⚠️  ZAI_API_KEY not set, skipping ZAI tests"
fi

if [ -z "$OPENAI_API_KEY" ]; then
    echo "⚠️  OPENAI_API_KEY not set, skipping OpenAI tests"
fi

if [ -n "$ZAI_API_KEY" ] && [ -n "$OPENAI_API_KEY" ]; then
    obora run workflow.yaml --verbose
else
    echo ""
    echo "Skipping execution - set both API keys to run this test"
fi

echo ""
echo "=== Test Complete ==="
