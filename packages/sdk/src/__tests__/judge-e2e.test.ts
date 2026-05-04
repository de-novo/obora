import { describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { Workflow } from "../workflow.js";
import { OboraRuntime } from "../runtime.js";

describe("judge mode e2e", () => {
  it("loads input JSON and writes structured output JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-judge-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(
      join(root, "artifacts", "submission.json"),
      JSON.stringify({ title: "Sample", body: "Clear answer", rubric: { clarity: 1 } }, null, 2),
      "utf8",
    );

    const workflow = await Workflow.fromYaml(join(dirname(fileURLToPath(import.meta.url)), "fixtures/judge-e2e.yaml"));

    const runtime = new OboraRuntime({
      llm: {
        provider: "mock",
        apiKey: "test-key",
        model: "mock-evaluator",
      },
    });

    (runtime as unknown as { createLLMAdapter: (config: unknown) => Promise<unknown> }).createLLMAdapter = async () => ({
      async chatCompletion() {
        return {
          model: "mock-evaluator",
          message: {
            role: "assistant",
            content: JSON.stringify({
              score: 0.91,
              verdict: "accept",
              rationale: "The submission is clear enough.",
            }),
          },
        };
      },
    });

    runtime.define(workflow.name, workflow);

    const prev = process.cwd();
    process.chdir(root);
    try {
      const handle = await runtime.run(workflow.name, {});
      const result = await handle.wait();
      expect(result.status).toBe("completed");
      const written = JSON.parse(await readFile(join(root, "artifacts", "result.json"), "utf8"));
      expect(written).toMatchObject({
        score: 0.91,
        verdict: "accept",
        rationale: "The submission is clear enough.",
      });
    } finally {
      process.chdir(prev);
    }
  });

  it("normalizes fenced JSON judge output before writing artifacts", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-judge-fenced-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(
      join(root, "artifacts", "submission.json"),
      JSON.stringify({ title: "Sample", body: "Clear answer", rubric: { clarity: 1 } }, null, 2),
      "utf8",
    );

    const workflow = await Workflow.fromYaml(join(dirname(fileURLToPath(import.meta.url)), "fixtures/judge-e2e.yaml"));

    const runtime = new OboraRuntime({
      llm: {
        provider: "mock",
        apiKey: "test-key",
        model: "mock-evaluator",
      },
    });

    (runtime as unknown as { createLLMAdapter: (config: unknown) => Promise<unknown> }).createLLMAdapter = async () => ({
      async chatCompletion() {
        return {
          model: "mock-evaluator",
          message: {
            role: "assistant",
            content: [
              '```json',
              JSON.stringify({
                score: 0.73,
                verdict: "accept",
                rationale: "Fenced JSON should still be normalized.",
              }, null, 2),
              '```',
            ].join('\n'),
          },
        };
      },
    });

    runtime.define(workflow.name, workflow);

    const prev = process.cwd();
    process.chdir(root);
    try {
      const handle = await runtime.run(workflow.name, {});
      const result = await handle.wait();
      expect(result.status).toBe("completed");
      const written = JSON.parse(await readFile(join(root, "artifacts", "result.json"), "utf8"));
      expect(written).toMatchObject({
        score: 0.73,
        verdict: "accept",
        rationale: "Fenced JSON should still be normalized.",
      });
      expect(typeof written).toBe("object");
    } finally {
      process.chdir(prev);
    }
  });
});
