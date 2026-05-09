import { Tool, ToolContext } from "../types";
import { ToolRegistry } from "../registry";
import { params } from "../decorators";

export const getCurrentTimeTool: Tool<Record<string, never>, string> = {
  name: "get_current_time",
  description: "Get the current date and time in ISO format",
  parameters: { type: "object", properties: {} },
  category: "utility",
  hasSideEffects: false,
  async execute() {
    return new Date().toISOString();
  },
};

export const calculatorTool: Tool<{ expression: string }, number> = {
  name: "calculator",
  description: "Evaluate a mathematical expression",
  parameters: params()
    .string("expression", "Mathematical expression to evaluate", { required: true })
    .build(),
  category: "utility",
  hasSideEffects: false,
  async execute(p) {
    try {
      // @ts-expect-error mathjs is an optional peer dependency
      const { evaluate } = await import("mathjs");
      return evaluate(p.expression) as number;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid expression: ${message}`, { cause: error });
    }
  },
};

export const parseJsonTool: Tool<{ json: string }, unknown> = {
  name: "parse_json",
  description: "Parse a JSON string into an object",
  parameters: params().string("json", "JSON string to parse", { required: true }).build(),
  category: "utility",
  hasSideEffects: false,
  async execute(p) {
    return JSON.parse(p.json);
  },
};

export const searchTextTool: Tool<
  { text: string; query: string; caseSensitive?: boolean },
  { found: boolean; matches: string[] }
> = {
  name: "search_text",
  description: "Search for a query string within text",
  parameters: params()
    .string("text", "Text to search in", { required: true })
    .string("query", "Query string to find", { required: true })
    .boolean("caseSensitive", "Whether to perform case-sensitive search", { default: false })
    .build(),
  category: "text",
  hasSideEffects: false,
  async execute(p) {
    const text = p.caseSensitive ? p.text : p.text.toLowerCase();
    const query = p.caseSensitive ? p.query : p.query.toLowerCase();
    const collectMatches = (startIndex: number): string[] => {
      const index = text.indexOf(query, startIndex);
      return index === -1
        ? []
        : [
          p.text.substring(index, index + p.query.length),
          ...collectMatches(index + 1),
        ];
    };
    const matches = collectMatches(0);
    return { found: matches.length > 0, matches };
  },
};

export const httpRequestTool: Tool<
  {
    url: string;
    method?: "GET" | "POST" | "PUT" | "DELETE";
    headers?: Record<string, string>;
    body?: string;
  },
  { status: number; headers: Record<string, string>; body: string }
> = {
  name: "http_request",
  description: "Make an HTTP request to a URL",
  parameters: params()
    .string("url", "URL to request", { required: true })
    .string("method", "HTTP method", {
      enum: ["GET", "POST", "PUT", "DELETE"],
      default: "GET",
    })
    .object("headers", "Request headers", {})
    .string("body", "Request body")
    .build(),
  category: "network",
  hasSideEffects: true,
  requiredPermissions: ["network"],
  async execute(p, context: ToolContext) {
    const controller = new AbortController();
    const timeout = context.timeout ?? 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(p.url, {
        method: p.method ?? "GET",
        headers: p.headers,
        body: p.body,
        signal: controller.signal,
      });
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      const body = await response.text();
      return { status: response.status, headers, body };
    } finally {
      clearTimeout(timeoutId);
    }
  },
};

export const randomGeneratorTool: Tool<
  { type: "number" | "string" | "uuid"; min?: number; max?: number; length?: number },
  string | number
> = {
  name: "random_generator",
  description: "Generate random values (numbers, strings, or UUIDs)",
  parameters: params()
    .string("type", "Type of random value to generate", {
      required: true,
      enum: ["number", "string", "uuid"],
    })
    .number("min", "Minimum value for numbers", { default: 0 })
    .number("max", "Maximum value for numbers", { default: 100 })
    .number("length", "Length for string generation", { default: 10 })
    .build(),
  category: "utility",
  hasSideEffects: false,
  async execute(p) {
    switch (p.type) {
      case "number": {
        const min = p.min ?? 0;
        const max = p.max ?? 100;
        return Math.floor(Math.random() * (max - min + 1)) + min;
      }
      case "string": {
        const length = p.length ?? 10;
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        return Array.from({ length }, () =>
          chars.charAt(Math.floor(Math.random() * chars.length))
        ).join("");
      }
      case "uuid":
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === "x" ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      default:
        throw new Error(`Unknown type: ${p.type}`);
    }
  },
};

export const builtinTools: Tool[] = [
  getCurrentTimeTool,
  calculatorTool,
  parseJsonTool,
  searchTextTool,
  httpRequestTool,
  randomGeneratorTool,
];

export function registerBuiltinTools(registry: ToolRegistry): void {
  builtinTools.forEach((tool) => {
    registry.register(tool);
  });
}
