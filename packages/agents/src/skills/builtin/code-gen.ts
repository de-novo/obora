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

export const codeGenSkill: OboraSkill = {
  name: "code-gen",
  description: "Code generation helpers",
  version: "0.1.0",
  tools: [
    stub("file_read", "Read file content"),
    stub("file_write", "Write file content"),
    stub("file_edit", "Edit file content"),
    stub("bash_exec", "Execute shell command"),
  ],
  systemPrompt: [
    "You are in code generation mode.",
    "Follow existing project conventions and keep changes minimal/safe.",
    "When unclear, prefer explicit assumptions and list them.",
  ].join("\n"),
};
