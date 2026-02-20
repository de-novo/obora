import { describe, expect, it } from "vitest";

import {
  validateKnowledgeSchemaContent,
  validateKnowledgeTag,
  parseKnowledgeSchema,
} from "../../knowledge/schema-validator.js";

describe("knowledge schema validator", () => {
  const validYaml = `
version: "2.0"
name: "knowledge-schema-v2"
tagRules:
  depth: 3
  separator: "."
  pattern: "^[A-Z][A-Za-z0-9]+\\\\.[a-z][a-z0-9-]+\\\\.[a-z][a-z0-9-]+$"
fields:
  required: [id, title, body, tags, source, createdAt]
limits:
  maxTagsPerEntry: 8
  maxBodyChars: 12000
  maxTitleChars: 180
`;

  it("validates a correct schema", () => {
    const result = validateKnowledgeSchemaContent(validYaml);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects invalid depth", () => {
    const invalidYaml = validYaml.replace("depth: 3", "depth: 2");
    const result = validateKnowledgeSchemaContent(invalidYaml);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toContain("depth");
  });

  it("validates tags by regex", () => {
    const schema = parseKnowledgeSchema(validYaml);
    const regex = new RegExp(schema.tagRules.pattern);
    expect(validateKnowledgeTag("Auth.oauth.kakao", regex)).toBe(true);
    expect(validateKnowledgeTag("auth.oauth.kakao", regex)).toBe(false);
  });
});
