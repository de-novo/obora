import { Type } from "@mariozechner/pi-ai";
import type { OboraSkill } from "../types";

function stub(name: string, description: string) {
  return {
    name,
    label: name,
    description,
    parameters: Type.Object({}, { additionalProperties: true }),
    execute: async () => ({
      content: [{ type: "text" as const, text: `${name} is not implemented yet` }],
      details: { stub: true },
    }),
  };
}

export const codeReviewSkill: OboraSkill = {
  name: "code-review",
  description: "Code review helpers",
  version: "0.1.0",
  tools: [
    stub("file_read", "Read file content"),
    stub("diff_analyze", "Analyze code diff"),
    stub("lint_check", "Run lint checks"),
  ],
  systemPrompt: [
    "You are in code review mode.",
    "Review for security, correctness, performance, readability, and tests.",
    "Prioritize high-impact issues and provide actionable fixes.",
  ].join("\n"),
};
