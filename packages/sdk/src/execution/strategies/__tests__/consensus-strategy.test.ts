import { describe, it, expect, vi } from "vitest";
import { consensusStrategy } from "../consensus-strategy.js";
import type { WorkflowStep } from "../../../workflow.js";
import type { StepContext } from "../../../step-executor-types.js";
import type { StepExecutionServices } from "../types.js";

function createMockServices(overrides: Partial<StepExecutionServices> = {}): StepExecutionServices {
  return {
    resolveProjectPath: vi.fn(),
    extractTask: vi.fn().mockReturnValue("review"),
    requestForStep: vi.fn().mockResolvedValue({
      message: { content: "APPROVE" },
    }),
    tryParseStructuredContent: vi.fn(),
    parseStepOutputContract: vi.fn(),
    combineAbortSignals: vi.fn().mockReturnValue({ signal: undefined, cleanup: vi.fn() }),
    getStepTimeoutMs: vi.fn().mockReturnValue(30000),
    getConsensusTimeoutMs: vi.fn().mockReturnValue(60000),
    getConsensusQuorumRule: vi.fn().mockReturnValue({ requiredApprovals: 2, description: "majority (2/3)" }),
    withTimeout: vi.fn().mockImplementation(async (fn) => fn({} as AbortSignal)),
    config: { onEvent: vi.fn() },
    ...overrides,
  } as unknown as StepExecutionServices;
}

describe("consensusStrategy - branches", () => {
  it("throws when no participants", async () => {
    const step: WorkflowStep = {
      name: "consensus1",
      agent: "reviewer",
      input: {},
    };
    const context: StepContext = { previousOutputs: {} };
    const services = createMockServices();

    await expect(consensusStrategy.execute(step, context, services)).rejects.toThrow(
      "Consensus step 'consensus1' requires participants"
    );
  });

  it("passes when approvals meet quorum", async () => {
    const step: WorkflowStep = {
      name: "consensus1",
      agent: "reviewer",
      input: {},
      participants: ["alice", "bob", "charlie"],
    };
    const context: StepContext = { previousOutputs: {} };
    const services = createMockServices({
      getConsensusQuorumRule: vi.fn().mockReturnValue({ requiredApprovals: 2, description: "majority" }),
    });

    const result = await consensusStrategy.execute(step, context, services);

    expect(result.votes).toHaveLength(3);
    expect(result.votes?.filter((v) => v.vote === "APPROVE")).toHaveLength(3);
    expect(services.config.onEvent).toHaveBeenCalledWith("consensus_result", expect.objectContaining({
      pass: true,
      approveCount: 3,
    }));
  });

  it("fails when approvals are below quorum", async () => {
    const step: WorkflowStep = {
      name: "consensus1",
      agent: "reviewer",
      input: {},
      participants: ["alice", "bob"],
    };
    const context: StepContext = { previousOutputs: {} };
    const services = createMockServices({
      requestForStep: vi.fn()
        .mockResolvedValueOnce({ message: { content: "APPROVE" } })
        .mockResolvedValueOnce({ message: { content: "REJECT" } }),
      getConsensusQuorumRule: vi.fn().mockReturnValue({ requiredApprovals: 2, description: "unanimous" }),
    });

    await expect(consensusStrategy.execute(step, context, services)).rejects.toThrow(
      "Consensus failed"
    );

    expect(services.config.onEvent).toHaveBeenCalledWith("consensus_result", expect.objectContaining({
      pass: false,
      approveCount: 1,
    }));
  });

  it("uses combined abort signal when available", async () => {
    const step: WorkflowStep = {
      name: "consensus1",
      agent: "reviewer",
      input: {},
      participants: ["alice"],
    };
    const abortController = new AbortController();
    const context: StepContext = { previousOutputs: {}, signal: abortController.signal };
    const combinedSignal = new AbortController().signal;
    const services = createMockServices({
      combineAbortSignals: vi.fn().mockReturnValue({ signal: combinedSignal, cleanup: vi.fn() }),
      getConsensusQuorumRule: vi.fn().mockReturnValue({ requiredApprovals: 1, description: "single" }),
    });

    await consensusStrategy.execute(step, context, services);

    expect(services.combineAbortSignals).toHaveBeenCalled();
    expect(services.requestForStep).toHaveBeenCalledWith(
      step,
      expect.objectContaining({ signal: combinedSignal }),
      "alice"
    );
  });

  it("cleans up combined signal after voting", async () => {
    const step: WorkflowStep = {
      name: "consensus1",
      agent: "reviewer",
      input: {},
      participants: ["alice"],
    };
    const context: StepContext = { previousOutputs: {} };
    const cleanup = vi.fn();
    const services = createMockServices({
      combineAbortSignals: vi.fn().mockReturnValue({ signal: undefined, cleanup }),
      getConsensusQuorumRule: vi.fn().mockReturnValue({ requiredApprovals: 1, description: "single" }),
    });

    await consensusStrategy.execute(step, context, services);

    expect(cleanup).toHaveBeenCalled();
  });

  it("requests vote from each participant", async () => {
    const step: WorkflowStep = {
      name: "consensus1",
      agent: "reviewer",
      input: {},
      participants: ["alice", "bob"],
    };
    const context: StepContext = { previousOutputs: {} };
    const services = createMockServices({
      requestForStep: vi.fn()
        .mockResolvedValueOnce({ message: { content: "APPROVE" } })
        .mockResolvedValueOnce({ message: { content: "REQUEST_CHANGES" } }),
      getConsensusQuorumRule: vi.fn().mockReturnValue({ requiredApprovals: 1, description: "majority" }),
    });

    const result = await consensusStrategy.execute(step, context, services);

    expect(services.requestForStep).toHaveBeenCalledTimes(2);
    expect(result.votes?.[0]?.participant).toBe("alice");
    expect(result.votes?.[1]?.participant).toBe("bob");
    expect(result.votes?.[1]?.vote).toBe("REQUEST_CHANGES");
  });
});
