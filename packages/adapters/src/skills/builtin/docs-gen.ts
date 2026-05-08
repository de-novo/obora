import { Type } from "@earendil-works/pi-ai";
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

export const docsGenSkill: OboraSkill = {
  name: "docs-gen",
  description: "Documentation generation helpers",
  version: "0.1.0",
  tools: [
    stub("file_read", "Read file content"),
    stub("file_write", "Write file content"),
    stub("markdown_render", "Render markdown"),
  ],
  systemPrompt: [
    "You are in documentation mode.",
    "Write clear, structured docs with examples and constraints.",
    "Prefer concise sections and consistent terminology.",
  ].join("\n"),
};
