import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { StepExecutor, type LLMAdapterLike } from "../step-executor.js";

describe("step output schema UX", () => {
  it("parses JSON output automatically when step.output.schema is declared", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-schema-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(join(root, "artifacts", "result.schema.json"), JSON.stringify({ type: "object" }, null, 2), "utf8");

    const chatCompletion = {
      async chatCompletion() {
        return {
          message: {
            role: "assistant",
            content: '{"score":0.9,"verdict":"accept"}',
          },
        };
      },
    } satisfies LLMAdapterLike;

    const executor = new StepExecutor(chatCompletion, new Map(), {});
    const prev = process.cwd();
    process.chdir(root);
    try {
      const result = await executor.executeStep(
        {
          name: "evaluate",
          agent: "judge",
          input: { task: "Return JSON only" },
          output: { schema: "artifacts/result.schema.json", path: "artifacts/result.json" },
        },
        { previousOutputs: {} },
      );
      expect(result.output).toMatchObject({ score: 0.9, verdict: "accept" });
      const written = JSON.parse(await readFile(join(root, "artifacts", "result.json"), "utf8"));
      expect(written).toMatchObject({ score: 0.9, verdict: "accept" });
    } finally {
      process.chdir(prev);
    }
  });

  it("fails with SCHEMA_1001 when output.schema is declared but model output is not JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-schema-fail-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(join(root, "artifacts", "result.schema.json"), JSON.stringify({ type: "object" }, null, 2), "utf8");

    const chatCompletion = {
      async chatCompletion() {
        return { message: { role: "assistant", content: 'looks good to me' } };
      },
    } satisfies LLMAdapterLike;

    const executor = new StepExecutor(chatCompletion, new Map(), {});
    const prev = process.cwd();
    process.chdir(root);
    try {
      await expect(
        executor.executeStep(
          {
            name: "evaluate",
            agent: "judge",
            input: { task: "Return JSON only" },
            output: { schema: "artifacts/result.schema.json" },
          },
          { previousOutputs: {} },
        ),
      ).rejects.toThrow("SCHEMA_1001");
    } finally {
      process.chdir(prev);
    }
  });
  it("fails with detailed SCHEMA_1003 when required fields are missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-schema-required-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(
      join(root, "artifacts", "result.schema.json"),
      JSON.stringify({ type: "object", required: ["score", "verdict"] }, null, 2),
      "utf8",
    );

    const chatCompletion = {
      async chatCompletion() {
        return { message: { role: "assistant", content: '{"score":0.9}' } };
      },
    } satisfies LLMAdapterLike;

    const executor = new StepExecutor(chatCompletion, new Map(), {});
    const prev = process.cwd();
    process.chdir(root);
    try {
      await expect(
        executor.executeStep(
          {
            name: "evaluate",
            agent: "judge",
            input: { task: "Return JSON only" },
            output: { schema: "artifacts/result.schema.json" },
          },
          { previousOutputs: {} },
        ),
      ).rejects.toThrow("missing required field(s): verdict");
    } finally {
      process.chdir(prev);
    }
  });

  it("fails with detailed SCHEMA_1003 when field type mismatches", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-schema-type-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(
      join(root, "artifacts", "result.schema.json"),
      JSON.stringify({ type: "object", properties: { score: { type: "number" } } }, null, 2),
      "utf8",
    );

    const chatCompletion = {
      async chatCompletion() {
        return { message: { role: "assistant", content: '{"score":"high"}' } };
      },
    } satisfies LLMAdapterLike;

    const executor = new StepExecutor(chatCompletion, new Map(), {});
    const prev = process.cwd();
    process.chdir(root);
    try {
      await expect(
        executor.executeStep(
          {
            name: "evaluate",
            agent: "judge",
            input: { task: "Return JSON only" },
            output: { schema: "artifacts/result.schema.json" },
          },
          { previousOutputs: {} },
        ),
      ).rejects.toThrow("field 'score' should be number, got string");
    } finally {
      process.chdir(prev);
    }
  });

  it("fails with detailed SCHEMA_1003 for nested object required field mismatch", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-schema-nested-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(
      join(root, "artifacts", "result.schema.json"),
      JSON.stringify({
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
      }, null, 2),
      "utf8",
    );

    const chatCompletion = {
      async chatCompletion() {
        return { message: { role: "assistant", content: '{"meta":{}}' } };
      },
    } satisfies LLMAdapterLike;

    const executor = new StepExecutor(chatCompletion, new Map(), {});
    const prev = process.cwd();
    process.chdir(root);
    try {
      await expect(
        executor.executeStep(
          {
            name: "evaluate",
            agent: "judge",
            input: { task: "Return JSON only" },
            output: { schema: "artifacts/result.schema.json" },
          },
          { previousOutputs: {} },
        ),
      ).rejects.toThrow("missing required field(s): meta.summary");
    } finally {
      process.chdir(prev);
    }
  });

  it("fails with detailed SCHEMA_1003 for array item type mismatch", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-schema-array-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(
      join(root, "artifacts", "result.schema.json"),
      JSON.stringify({
        type: "object",
        properties: {
          tags: {
            type: "array",
            items: { type: "string" },
          },
        },
      }, null, 2),
      "utf8",
    );

    const chatCompletion = {
      async chatCompletion() {
        return { message: { role: "assistant", content: '{"tags":["ok",2]}' } };
      },
    } satisfies LLMAdapterLike;

    const executor = new StepExecutor(chatCompletion, new Map(), {});
    const prev = process.cwd();
    process.chdir(root);
    try {
      await expect(
        executor.executeStep(
          {
            name: "evaluate",
            agent: "judge",
            input: { task: "Return JSON only" },
            output: { schema: "artifacts/result.schema.json" },
          },
          { previousOutputs: {} },
        ),
      ).rejects.toThrow("field 'tags[1]' should be string, got integer");
    } finally {
      process.chdir(prev);
    }
  });

  it("fails with detailed SCHEMA_1003 for enum mismatch", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-schema-enum-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(
      join(root, "artifacts", "result.schema.json"),
      JSON.stringify({
        type: "object",
        properties: {
          verdict: {
            type: "string",
            enum: ["accept", "reject"],
          },
        },
      }, null, 2),
      "utf8",
    );

    const chatCompletion = {
      async chatCompletion() {
        return { message: { role: "assistant", content: '{"verdict":"maybe"}' } };
      },
    } satisfies LLMAdapterLike;

    const executor = new StepExecutor(chatCompletion, new Map(), {});
    const prev = process.cwd();
    process.chdir(root);
    try {
      await expect(
        executor.executeStep(
          {
            name: "evaluate",
            agent: "judge",
            input: { task: "Return JSON only" },
            output: { schema: "artifacts/result.schema.json" },
          },
          { previousOutputs: {} },
        ),
      ).rejects.toThrow("field 'verdict' should be one of: accept, reject; got \"maybe\"");
    } finally {
      process.chdir(prev);
    }
  });

  it("supports anyOf through the step output contract path", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-schema-anyof-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(
      join(root, "artifacts", "result.schema.json"),
      JSON.stringify({
        type: "object",
        properties: {
          value: {
            anyOf: [{ type: "string" }, { type: "number" }],
          },
        },
      }, null, 2),
      "utf8",
    );

    const chatCompletion = {
      async chatCompletion() {
        return { message: { role: "assistant", content: '{"value":42}' } };
      },
    } satisfies LLMAdapterLike;

    const executor = new StepExecutor(chatCompletion, new Map(), {});
    const prev = process.cwd();
    process.chdir(root);
    try {
      const result = await executor.executeStep(
        {
          name: "evaluate",
          agent: "judge",
          input: { task: "Return JSON only" },
          output: { schema: "artifacts/result.schema.json" },
        },
        { previousOutputs: {} },
      );
      expect(result.output).toMatchObject({ value: 42 });
    } finally {
      process.chdir(prev);
    }
  });

  it("fails with detailed SCHEMA_1003 when anyOf matches no branch", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-schema-anyof-fail-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(
      join(root, "artifacts", "result.schema.json"),
      JSON.stringify({
        type: "object",
        properties: {
          value: {
            anyOf: [{ type: "string" }, { type: "number" }],
          },
        },
      }, null, 2),
      "utf8",
    );

    const chatCompletion = {
      async chatCompletion() {
        return { message: { role: "assistant", content: '{"value":true}' } };
      },
    } satisfies LLMAdapterLike;

    const executor = new StepExecutor(chatCompletion, new Map(), {});
    const prev = process.cwd();
    process.chdir(root);
    try {
      await expect(
        executor.executeStep(
          {
            name: "evaluate",
            agent: "judge",
            input: { task: "Return JSON only" },
            output: { schema: "artifacts/result.schema.json" },
          },
          { previousOutputs: {} },
        ),
      ).rejects.toThrow("field 'value' did not match any allowed schema option");
    } finally {
      process.chdir(prev);
    }
  });

  it("supports oneOf through the step output contract path", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-schema-oneof-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(
      join(root, "artifacts", "result.schema.json"),
      JSON.stringify({
        type: "object",
        properties: {
          value: {
            oneOf: [{ type: "number" }, { type: "string" }],
          },
        },
      }, null, 2),
      "utf8",
    );

    const chatCompletion = {
      async chatCompletion() {
        return { message: { role: "assistant", content: '{"value":"ok"}' } };
      },
    } satisfies LLMAdapterLike;

    const executor = new StepExecutor(chatCompletion, new Map(), {});
    const prev = process.cwd();
    process.chdir(root);
    try {
      const result = await executor.executeStep(
        {
          name: "evaluate",
          agent: "judge",
          input: { task: "Return JSON only" },
          output: { schema: "artifacts/result.schema.json" },
        },
        { previousOutputs: {} },
      );
      expect(result.output).toMatchObject({ value: "ok" });
    } finally {
      process.chdir(prev);
    }
  });

  it("fails with detailed SCHEMA_1003 when oneOf matches no branch", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-schema-oneof-fail-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(
      join(root, "artifacts", "result.schema.json"),
      JSON.stringify({
        type: "object",
        properties: {
          value: {
            oneOf: [{ type: "number" }, { type: "string" }],
          },
        },
      }, null, 2),
      "utf8",
    );

    const chatCompletion = {
      async chatCompletion() {
        return { message: { role: "assistant", content: '{"value":false}' } };
      },
    } satisfies LLMAdapterLike;

    const executor = new StepExecutor(chatCompletion, new Map(), {});
    const prev = process.cwd();
    process.chdir(root);
    try {
      await expect(
        executor.executeStep(
          {
            name: "evaluate",
            agent: "judge",
            input: { task: "Return JSON only" },
            output: { schema: "artifacts/result.schema.json" },
          },
          { previousOutputs: {} },
        ),
      ).rejects.toThrow("field 'value' did not match exactly one schema option");
    } finally {
      process.chdir(prev);
    }
  });

  it("supports allOf through the step output contract path", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-schema-allof-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(
      join(root, "artifacts", "result.schema.json"),
      JSON.stringify({
        type: "object",
        properties: {
          value: {
            allOf: [{ type: "number" }, { enum: [42, 43] }],
          },
        },
      }, null, 2),
      "utf8",
    );

    const chatCompletion = {
      async chatCompletion() {
        return { message: { role: "assistant", content: '{"value":42}' } };
      },
    } satisfies LLMAdapterLike;

    const executor = new StepExecutor(chatCompletion, new Map(), {});
    const prev = process.cwd();
    process.chdir(root);
    try {
      const result = await executor.executeStep(
        {
          name: "evaluate",
          agent: "judge",
          input: { task: "Return JSON only" },
          output: { schema: "artifacts/result.schema.json" },
        },
        { previousOutputs: {} },
      );
      expect(result.output).toMatchObject({ value: 42 });
    } finally {
      process.chdir(prev);
    }
  });

  it("fails with detailed SCHEMA_1003 when allOf fails one branch", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-schema-allof-fail-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(
      join(root, "artifacts", "result.schema.json"),
      JSON.stringify({
        type: "object",
        properties: {
          value: {
            allOf: [{ type: "number" }, { enum: [42, 43] }],
          },
        },
      }, null, 2),
      "utf8",
    );

    const chatCompletion = {
      async chatCompletion() {
        return { message: { role: "assistant", content: '{"value":41}' } };
      },
    } satisfies LLMAdapterLike;

    const executor = new StepExecutor(chatCompletion, new Map(), {});
    const prev = process.cwd();
    process.chdir(root);
    try {
      await expect(
        executor.executeStep(
          {
            name: "evaluate",
            agent: "judge",
            input: { task: "Return JSON only" },
            output: { schema: "artifacts/result.schema.json" },
          },
          { previousOutputs: {} },
        ),
      ).rejects.toThrow("field 'value' did not satisfy all schema requirements");
    } finally {
      process.chdir(prev);
    }
  });

});
