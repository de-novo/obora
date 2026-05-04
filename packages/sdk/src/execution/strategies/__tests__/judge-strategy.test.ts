import { describe, it, expect, vi } from "vitest";
import { judgeStrategy } from "../judge-strategy.js";
import type { WorkflowStep } from "../../workflow.js";
import type { StepContext } from "../../step-executor-types.js";
import type { StepExecutionServices } from "./types.js";

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
      } as any,
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
});
