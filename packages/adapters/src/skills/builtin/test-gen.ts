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

export const testGenSkill: OboraSkill = {
  name: "test-gen",
  description: "Test generation helpers",
  version: "0.1.0",
  tools: [
    stub("file_read", "Read file content"),
    stub("file_write", "Write file content"),
    stub("test_runner", "Run tests"),
  ],
  systemPrompt: [
    "You are in test generation mode.",
    "Create focused tests with edge cases and clear assertions.",
    "Prefer deterministic tests and explain coverage intent.",
  ].join("\n"),
};
