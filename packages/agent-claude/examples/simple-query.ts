/**
 * Simple Query Example (without workflow)
 */

import { simpleQuery } from "@obora/agent-claude";

async function main() {
  console.log("Analyzing codebase structure...\n");

  const output = await simpleQuery(
    "List all TypeScript files in the src directory and summarize the codebase structure",
    process.cwd(),
    ["Read", "Glob", "Grep"],
    (message) => {
      const msg = message as Record<string, unknown>;

      // Print tool usage
      if (msg.type === "assistant") {
        const content = (msg.message as any)?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "tool_use") {
              console.log(`[Tool] ${block.name}`);
            }
          }
        }
      }
    }
  );

  console.log("\n=== Analysis Result ===");
  console.log(output);
}

main().catch(console.error);
