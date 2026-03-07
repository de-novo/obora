#!/bin/bash
# Test 07: Custom Tools
# Expected: Custom tools injected and used

cd "$(dirname "$0")"

echo "=== Test 07: Custom Tools ==="
echo "Testing custom tool injection..."

echo ""
echo "Note: This test requires programmatic execution with custom tools."
echo "See custom-tools.ts for tool definitions."
echo ""
echo "Example code:"
echo ""
cat << 'EOF'
import { OboraRuntime, StepExecutor } from "@obora/sdk";
import { customTools } from "./custom-tools.js";

const runtime = new OboraRuntime({
  llm: { provider: "zai", model: "glm-4.7" }
});

// Register agent with custom tools
runtime.registerAgent("tool_user", () => ({
  role: "Tool User",
  getExecutor: () => new StepExecutor(adapter, agents, { tools: customTools })
}));

const result = await runtime.run("custom-tools-test");
EOF

echo ""
echo "=== Test Complete ==="
