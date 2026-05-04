import { describe, it, expect, vi } from "vitest";
import { defaultStrategy } from "../strategies/default-strategy.js";
import type { WorkflowStep } from "../../workflow.js";
import type { StepContext, StepResult } from "../../step-executor-types.js";
import type { StepExecutionServices } from "../strategies/types.js";

function createMockServices(overrides: Partial<StepExecutionServices> = {}): StepExecutionServices {
  return {
    resolveProjectPath: vi.fn(),
    extractTask: vi.fn().mockReturnValue("do something"),
    requestForStep: vi.fn().mockResolvedValue({
      message: { content: '{"result": "ok"}' },
    }),
    parseStructuredStepOutput: vi.fn().mockReturnValue({ result: "ok" }),
    parseStepOutputContract: vi.fn().mockReturnValue({ result: "ok" }),
    persistStepOutput: vi.fn().mockResolvedValue(undefined),
    combineAbortSignals: vi.fn(),
    getStepTimeoutMs: vi.fn().mockReturnValue(30000),
    getConsensusTimeoutMs: vi.fn(),
    getConsensusQuorumRule: vi.fn(),
    withTimeout: vi.fn().mockImplementation(async (fn) => fn({} as AbortSignal)),
    config: { onEvent: vi.fn() },
    ...overrides,
  } as unknown as StepExecutionServices;
}

describe("defaultStrategy", () => {
  it("executes a basic step", async () => {
    const step: WorkflowStep = {
      name: "step1",
      agent: "agent1",
      input: { task: "test" },
    };
    const context: StepContext = { previousOutputs: {} };
    const services = createMockServices();

    const result = await defaultStrategy.execute(step, context, services);

    expect(result.output).toEqual({ result: "ok" });
    expect(result.raw).toBeDefined();
    expect(services.requestForStep).toHaveBeenCalledWith(step, context, "agent1");
    expect(services.persistStepOutput).toHaveBeenCalledWith(step, { result: "ok" });
  });

  it("handles response with null content", async () => {
    const step: WorkflowStep = {
      name: "step1",
      agent: "agent1",
      input: {},
    };
    const context: StepContext = { previousOutputs: {} };
    const services = createMockServices({
      requestForStep: vi.fn().mockResolvedValue({
        message: { content: null },
      }),
      parseStructuredStepOutput: vi.fn().mockReturnValue(""),
      parseStepOutputContract: vi.fn().mockReturnValue(""),
    });

    const result = await defaultStrategy.execute(step, context, services);

    expect(services.parseStructuredStepOutput).toHaveBeenCalledWith(step, "");
    expect(result.output).toBe("");
  });

  it("handles response with undefined content", async () => {
    const step: WorkflowStep = {
      name: "step1",
      agent: "agent1",
      input: {},
    };
    const context: StepContext = { previousOutputs: {} };
    const services = createMockServices({
      requestForStep: vi.fn().mockResolvedValue({
        message: { content: undefined },
      }),
      parseStructuredStepOutput: vi.fn().mockReturnValue(""),
      parseStepOutputContract: vi.fn().mockReturnValue(""),
    });

    const result = await defaultStrategy.execute(step, context, services);

    expect(services.parseStructuredStepOutput).toHaveBeenCalledWith(step, "");
    expect(result.output).toBe("");
  });

  it("handles empty string content", async () => {
    const step: WorkflowStep = {
      name: "step1",
      agent: "agent1",
      input: {},
    };
    const context: StepContext = { previousOutputs: {} };
    const services = createMockServices({
      requestForStep: vi.fn().mockResolvedValue({
        message: { content: "" },
      }),
      parseStructuredStepOutput: vi.fn().mockReturnValue(""),
      parseStepOutputContract: vi.fn().mockReturnValue(""),
    });

    const result = await defaultStrategy.execute(step, context, services);

    expect(services.parseStructuredStepOutput).toHaveBeenCalledWith(step, "");
    expect(result.output).toBe("");
  });

  it("passes step with output config", async () => {
    const step: WorkflowStep = {
      name: "step1",
      agent: "agent1",
      input: {},
      output: {
        path: "output.json",
        schema: "schema.json",
      },
    };
    const context: StepContext = { previousOutputs: {} };
    const services = createMockServices();

    await defaultStrategy.execute(step, context, services);

    expect(services.parseStepOutputContract).toHaveBeenCalledWith(
      step,
      expect.anything()
    );
  });
});
