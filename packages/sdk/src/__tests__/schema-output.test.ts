import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { findSchemaMismatchReason, loadMinimalJsonSchema } from "../schema-output.js";

describe("schema-output", () => {
  it("loads a minimal JSON schema from disk", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-schema-module-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    const schemaPath = join(root, "artifacts", "result.schema.json");
    await writeFile(
      schemaPath,
      JSON.stringify({ type: "object", required: ["score"] }, null, 2),
      "utf8",
    );

    const schema = loadMinimalJsonSchema(schemaPath);
    expect(schema).toMatchObject({ type: "object", required: ["score"] });
  });

  it("reports missing nested required fields", () => {
    const reason = findSchemaMismatchReason(
      { meta: {} },
      {
        type: "object",
        properties: {
          meta: {
            type: "object",
            required: ["summary"],
            properties: {
              summary: { type: "string" },
            },
          },
        },
      },
    );

    expect(reason).toBe("missing required field(s): meta.summary");
  });

  it("reports array item type mismatches", () => {
    const reason = findSchemaMismatchReason(
      { tags: ["ok", 2] },
      {
        type: "object",
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    );

    expect(reason).toBe("field 'tags[1]' should be string, got integer");
  });

  it("reports enum mismatches", () => {
    const reason = findSchemaMismatchReason(
      { verdict: "maybe" },
      {
        type: "object",
        properties: {
          verdict: {
            type: "string",
            enum: ["accept", "reject"],
          },
        },
      },
    );

    expect(reason).toBe("field 'verdict' should be one of: accept, reject; got \"maybe\"");
  });

  it("returns undefined when the candidate satisfies the minimal schema subset", () => {
    const reason = findSchemaMismatchReason(
      {
        score: 0.9,
        verdict: "accept",
        tags: ["clear", "grounded"],
        meta: { summary: "ok" },
      },
      {
        type: "object",
        required: ["score", "verdict"],
        properties: {
          score: { type: "number" },
          verdict: { type: "string", enum: ["accept", "reject"] },
          tags: { type: "array", items: { type: "string" } },
          meta: {
            type: "object",
            required: ["summary"],
            properties: { summary: { type: "string" } },
          },
        },
      },
    );

    expect(reason).toBeUndefined();
  });
  it("supports anyOf when one branch matches", () => {
    const reason = findSchemaMismatchReason(
      { value: 42 },
      {
        type: "object",
        properties: {
          value: {
            anyOf: [{ type: "string" }, { type: "number" }],
          },
        },
      },
    );

    expect(reason).toBeUndefined();
  });

  it("reports anyOf mismatch when no branch matches", () => {
    const reason = findSchemaMismatchReason(
      { value: true },
      {
        type: "object",
        properties: {
          value: {
            anyOf: [{ type: "string" }, { type: "number" }],
          },
        },
      },
    );

    expect(reason).toBe("field 'value' did not match any allowed schema option");
  });

  it("supports oneOf when exactly one branch matches", () => {
    const reason = findSchemaMismatchReason(
      { value: 42 },
      {
        type: "object",
        properties: {
          value: {
            oneOf: [{ type: "number" }, { type: "string" }],
          },
        },
      },
    );

    expect(reason).toBeUndefined();
  });

  it("reports oneOf mismatch when no branch matches", () => {
    const reason = findSchemaMismatchReason(
      { value: false },
      {
        type: "object",
        properties: {
          value: {
            oneOf: [{ type: "number" }, { type: "string" }],
          },
        },
      },
    );

    expect(reason).toBe("field 'value' did not match exactly one schema option");
  });

  it("supports allOf when all branches match", () => {
    const reason = findSchemaMismatchReason(
      { value: 42 },
      {
        type: "object",
        properties: {
          value: {
            allOf: [{ type: "number" }, { enum: [42, 43] }],
          },
        },
      },
    );

    expect(reason).toBeUndefined();
  });

  it("reports allOf mismatch when one branch fails", () => {
    const reason = findSchemaMismatchReason(
      { value: 41 },
      {
        type: "object",
        properties: {
          value: {
            allOf: [{ type: "number" }, { enum: [42, 43] }],
          },
        },
      },
    );

    expect(reason).toBe("field 'value' did not satisfy all schema requirements");
  });

});
