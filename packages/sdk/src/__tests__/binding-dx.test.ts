import { describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import { Workflow } from "../workflow.js";
import { StepExecutor } from "../step-executor.js";

describe("input bindings DX", () => {
  it("renders path-based json bindings into task prompt", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-bind-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(
      join(root, "artifacts", "submission.json"),
      JSON.stringify({ score: 1, label: "ok" }, null, 2),
      "utf8",
    );

    const workflow = await Workflow.fromYaml(join(dirname(fileURLToPath(import.meta.url)), "fixtures/one-file-binding.yaml"));
    const step = workflow.steps[0]!;

    let seenPrompt = "";
    const executor = new StepExecutor(
      {
        async chatCompletion(req) {
          seenPrompt = String(req.messages[1]?.content ?? "");
          return { model: "mock-model", message: { role: "assistant", content: "ok" } };
        },
      },
      new Map([
        [
          "writer",
          () => ({
            role: "binding test writer",
            provider: "mock",
            model: "mock-model",
          }),
        ],
      ]),
      {
        model: "mock-model",
      },
    );

    const prev = process.cwd();
    process.chdir(root);
    try {
      await executor.executeStep(step, { previousOutputs: {} });
    } finally {
      process.chdir(prev);
    }

    expect(seenPrompt).toContain('"score": 1');
    expect(seenPrompt).toContain('"label": "ok"');
    expect(seenPrompt).not.toContain('{{submission}}');
  });
});
