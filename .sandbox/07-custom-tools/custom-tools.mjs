// Runnable custom tool definitions for sandbox execution

export const calculateTool = {
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
            description: "Mathematical expression to evaluate (e.g. '42 * 17')",
          },
        },
        required: ["expression"],
      },
    },
  },
  execute: async (args) => {
    const expression = typeof args.expression === "string" ? args.expression : "";
    try {
      const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, "");
      const result = Function(`return (${sanitized})`)();
      return `Result: ${result}`;
    } catch (error) {
      return `Error: Could not evaluate expression - ${error}`;
    }
  },
};

export const timeTool = {
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
            description: "Timezone (e.g., 'Asia/Seoul')",
          },
        },
        required: [],
      },
    },
  },
  execute: async (args) => {
    const timezone = typeof args.timezone === "string" && args.timezone ? args.timezone : "UTC";
    return `Current time in ${timezone}: ${new Date().toISOString()}`;
  },
};

export const customTools = [calculateTool, timeTool];
