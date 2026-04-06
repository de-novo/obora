import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { Workflow } from "../workflow.js";
import { OboraRuntime } from "../runtime.js";

describe("binding preview", () => {
  it("logs resolved bindings at execution start", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-binding-preview-"));
    await mkdir(join(root, "artifacts"), { recursive: true });
    await writeFile(join(root, "artifacts", "submission.json"), JSON.stringify({ ok: true }, null, 2), "utf8");
    await writeFile(join(root, "artifacts", "result.schema.json"), JSON.stringify({ type: "object" }, null, 2), "utf8");
    await writeFile(
      join(root, "binding-preview.yaml"),
      [
        'name: binding-preview',
        'version: "1.0"',
        'agents:',
        '  writer:',
        '    provider: mock',
        '    model: mock-model',
        'steps:',
        '  - name: preview-step',
        '    agent: writer',
        '    input:',
        '      bindings:',
        '        submission:',
        '          path: artifacts/submission.json',
        '          kind: json',
        '      task: |',
        '        Evaluate {{submission}}',
        '    output:',
        '      path: artifacts/result.json',
        '      schema: artifacts/result.schema.json',
      ].join("\n"),
      "utf8",
    );

    const workflow = await Workflow.fromYaml(join(root, "binding-preview.yaml"));
    const logs: string[] = [];
    const runtime = new OboraRuntime({
      llm: { provider: "mock", apiKey: "test-key", model: "mock-model" },
      logger: { info: (...args: unknown[]) => void logs.push(String(args[0] ?? "")) },
    });

    (runtime as unknown as { createLLMAdapter: (config: unknown) => Promise<unknown> }).createLLMAdapter = async () => ({
      async chatCompletion() {
        return {
          model: "mock-model",
          message: { role: "assistant", content: '{"ok":true,"verdict":"accept"}' },
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
    } finally {
      process.chdir(prev);
    }

    const combined = logs.join("\n");
    expect(combined).toContain("chosen by precedence: runtime.llm > config > env");
    expect(combined).toContain("next place to edit: runtime llm config");
    expect(combined).toContain("Binding Preview");
    expect(combined).toContain("preview-step.submission: json <- artifacts/submission.json [resolved]");
    expect(combined).toContain("Output Preview");
    expect(combined).toContain("preview-step: path <- artifacts/result.json [pending]; schema <- artifacts/result.schema.json [resolved]");
  });
});
