/**
 * Custom tool definitions for Test 07
 *
 * This file shows how to define custom tools that can be injected
 * into the StepExecutor.
 */

import type { StepToolHandler } from "@obora/sdk";

// Custom calculator tool
export const calculateTool: StepToolHandler = {
  definition: {
    type: "function",
    function: {
      name: "calculate",
      description: "Perform a mathematical calculation",
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "Mathematical expression to evaluate (e.g., '42 * 17')"
          }
        },
        required: ["expression"]
      }
    }
  },
  execute: async (args: Record<string, unknown>): Promise<string> => {
    const expression = args.expression as string;
    try {
      // Safe evaluation using Function constructor
      // Note: In production, use a proper math parser library
      const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, "");
      const result = new Function(`return ${sanitized}`)();
      return `Result: ${result}`;
    } catch (error) {
      return `Error: Could not evaluate expression - ${error}`;
    }
  }
};

// Custom time tool
export const timeTool: StepToolHandler = {
  definition: {
    type: "function",
    function: {
      name: "get_current_time",
      description: "Get the current date and time",
      parameters: {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description: "Timezone (e.g., 'Asia/Seoul')"
          }
        },
        required: []
      }
    }
  },
  execute: async (args: Record<string, unknown>): Promise<string> => {
    const timezone = args.timezone as string || "UTC";
    const now = new Date();
    return `Current time in ${timezone}: ${now.toISOString()}`;
  }
};

// Export all custom tools
export const customTools: StepToolHandler[] = [
  calculateTool,
  timeTool
];
