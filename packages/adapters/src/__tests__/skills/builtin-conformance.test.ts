import { describe, expect, it } from "vitest";

import { codeGenSkill } from "../../skills/builtin/code-gen";
import { codeReviewSkill } from "../../skills/builtin/code-review";
import { docsGenSkill } from "../../skills/builtin/docs-gen";
import { testGenSkill } from "../../skills/builtin/test-gen";

const builtinSkills = [codeGenSkill, codeReviewSkill, docsGenSkill, testGenSkill];

describe("builtin skill conformance", () => {
  it("exposes executable stub tools and task-specific system prompts", async () => {
    for (const skill of builtinSkills) {
      expect(skill.name).toMatch(/^[a-z-]+$/);
      expect(skill.description.length).toBeGreaterThan(0);
      expect(skill.version).toBe("0.1.0");
      expect(skill.systemPrompt).toContain("mode");
      expect(skill.tools.length).toBeGreaterThan(0);

      const tool = skill.tools[0];
      expect(tool).toMatchObject({
        name: expect.any(String),
        label: expect.any(String),
        description: expect.any(String),
      });

      const result = await tool?.execute("tool-call-1", {});

      expect(result).toEqual({
        content: [{ type: "text", text: `${tool?.name} is not implemented yet` }],
        details: { stub: true },
      });
    }
  });
});
