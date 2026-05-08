import { describe, it, expect, vi } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { judgeStrategy } from "../judge-strategy.js";
import type { WorkflowStep } from "../../../workflow.js";
import type { StepContext } from "../../../step-executor-types.js";
import type { StepExecutionServices } from "../types.js";

function createMockServices(): StepExecutionServices {
  return {
    resolveProjectPath: vi.fn((p: string) => `/project/${p}`),
    extractTask: vi.fn().mockReturnValue("review code"),
    requestForStep: vi.fn().mockResolvedValue({
      message: { content: '{"score": 8}' },
    }),
    tryParseStructuredContent: vi.fn().mockReturnValue({ score: 8 }),
    parseStepOutputContract: vi.fn().mockReturnValue({ score: 8 }),
    config: { onEvent: vi.fn() },
  } as unknown as StepExecutionServices;
}

describe("judgeStrategy - config validation branches", () => {
  it("throws when judge config is not enabled", async () => {
    const step: WorkflowStep = {
      name: "judge1",
      agent: "judge",
      input: {},
      config: { judge: { enabled: false } },
    };
    const context: StepContext = { previousOutputs: {} };
    const services = createMockServices();

    await expect(judgeStrategy.execute(step, context, services)).rejects.toThrow(
      "Judge step 'judge1' is not properly configured"
    );
  });

  it("throws when judge config is missing", async () => {
    const step: WorkflowStep = {
      name: "judge1",
      agent: "judge",
      input: {},
      config: {},
    };
    const context: StepContext = { previousOutputs: {} };
    const services = createMockServices();

    await expect(judgeStrategy.execute(step, context, services)).rejects.toThrow(
      "Judge step 'judge1' is not properly configured"
    );
  });

  it("throws when config parsing fails (invalid type)", async () => {
    const step: WorkflowStep = {
      name: "judge1",
      agent: "judge",
      input: {},
      config: {
        judge: "invalid",
      },
    };
    const context: StepContext = { previousOutputs: {} };
    const services = createMockServices();

    await expect(judgeStrategy.execute(step, context, services)).rejects.toThrow(
      "Judge step 'judge1' is not properly configured"
    );
  });

  it("throws when input_json is missing", async () => {
    const step: WorkflowStep = {
      name: "judge1",
      agent: "judge",
      input: {},
      config: {
        judge: {
          enabled: true,
          output_path: "output.json",
        },
      },
    };
    const context: StepContext = { previousOutputs: {} };
    const services = createMockServices();

    await expect(judgeStrategy.execute(step, context, services)).rejects.toThrow(
      "Missing input artifact path"
    );
  });

  it("throws when output_path is missing", async () => {
    const step: WorkflowStep = {
      name: "judge1",
      agent: "judge",
      input: {},
      config: {
        judge: {
          enabled: true,
          input_json: "input.json",
        },
      },
    };
    const context: StepContext = { previousOutputs: {} };
    const services = createMockServices();

    await expect(judgeStrategy.execute(step, context, services)).rejects.toThrow(
      "Missing output artifact path"
    );
  });

  it("reads input JSON, validates structured output, and writes judge artifact", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-judge-strategy-"));
    const inputPath = join(dir, "input.json");
    const outputPath = join(dir, "out", "judge.json");
    await writeFile(inputPath, JSON.stringify({ answer: 42 }), "utf-8");

    const services = createMockServices();
    vi.mocked(services.resolveProjectPath)
      .mockImplementationOnce(() => inputPath)
      .mockImplementationOnce(() => outputPath);
    vi.mocked(services.tryParseStructuredContent).mockReturnValueOnce(undefined);
    vi.mocked(services.parseStepOutputContract).mockReturnValueOnce({ score: 9 });

    const step: WorkflowStep = {
      name: "judge1",
      agent: "judge",
      input: { rubric: "strict" },
      config: {
        judge: {
          enabled: true,
          input_json: "input.json",
          output_path: "out/judge.json",
          output_schema: "schema.json",
        },
      },
    };

    const result = await judgeStrategy.execute(step, { previousOutputs: {} }, services);

    expect(result.output).toEqual({ score: 9 });
    expect(services.requestForStep).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          rubric: "strict",
          task: expect.stringContaining("Return JSON only."),
        }),
      }),
      { previousOutputs: {} },
      "judge"
    );
    expect(services.parseStepOutputContract).toHaveBeenCalledWith(
      expect.objectContaining({
        output: { path: "out/judge.json", schema: "schema.json" },
      }),
      '{"score": 8}'
    );
    await expect(readFile(outputPath, "utf-8")).resolves.toBe('{\n  "score": 9\n}\n');
  });

  it("normalizes non-object step input, missing response content, and absent output schema", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-judge-strategy-"));
    const inputPath = join(dir, "input.json");
    const outputPath = join(dir, "judge.json");
    await writeFile(inputPath, JSON.stringify({ answer: "ok" }), "utf-8");

    const services = createMockServices();
    vi.mocked(services.resolveProjectPath)
      .mockImplementationOnce(() => inputPath)
      .mockImplementationOnce(() => outputPath);
    vi.mocked(services.requestForStep).mockResolvedValueOnce({
      message: { role: "assistant", content: null },
    });
    vi.mocked(services.tryParseStructuredContent).mockReturnValueOnce({ score: 7 });
    vi.mocked(services.parseStepOutputContract).mockReturnValueOnce({ score: 7 });

    const step: WorkflowStep = {
      name: "judge1",
      agent: "judge",
      config: {
        judge: {
          enabled: true,
          input_json: "input.json",
          output_path: "judge.json",
        },
      },
    };

    const result = await judgeStrategy.execute(step, { previousOutputs: {} }, services);

    expect(result.output).toEqual({ score: 7 });
    expect(services.requestForStep).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          task: expect.stringContaining("Input JSON (input.json)"),
        },
      }),
      { previousOutputs: {} },
      "judge"
    );
    expect(services.tryParseStructuredContent).toHaveBeenCalledWith("");
    expect(services.parseStepOutputContract).toHaveBeenCalledWith(
      expect.objectContaining({
        output: { path: "judge.json" },
      }),
      { score: 7 }
    );
    await expect(readFile(outputPath, "utf-8")).resolves.toBe('{\n  "score": 7\n}\n');
  });
});
