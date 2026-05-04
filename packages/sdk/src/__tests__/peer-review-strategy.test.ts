import { describe, expect, it, vi } from "vitest";
import { peerReviewStrategy } from "../execution/strategies/peer-review-strategy.js";
import type { StepExecutionServices } from "../execution/strategies/types.js";
import type { WorkflowStep } from "../workflow.js";
import type { StepContext } from "../step-executor-types.js";

const APPROVE_CONTENT = "APPROVE: score 9/10";

const createServices = (overrides?: Partial<StepExecutionServices>): StepExecutionServices => {
  const baseOnEvent = vi.fn();
  const onEvent =
    (overrides as Record<string, unknown>)?.onEvent ??
    overrides?.config?.onEvent ??
    baseOnEvent;
  return {
    requestForStep: vi.fn().mockResolvedValue({
      model: "gpt-4",
      message: { role: "assistant", content: APPROVE_CONTENT },
    }),
    persistStepOutput: vi.fn().mockResolvedValue(undefined),
    parseStepOutputContract: vi.fn().mockImplementation((_, o) => o),
    parseStructuredStepOutput: vi.fn().mockImplementation((_, o) => o),
    resolveProjectPath: vi.fn().mockImplementation((p) => p),
    withTimeout: vi.fn().mockImplementation(async (task) => task(new AbortController().signal)),
    getStepTimeoutMs: vi.fn().mockReturnValue(5000),
    getConsensusTimeoutMs: vi.fn().mockReturnValue(10000),
    getConsensusQuorumRule: vi.fn().mockReturnValue({ requiredApprovals: 1, description: "simple" }),
    combineAbortSignals: vi.fn().mockReturnValue({
      signal: new AbortController().signal,
      cleanup: vi.fn(),
    }),
    extractTask: vi.fn().mockReturnValue("task"),
    tryParseStructuredContent: vi.fn().mockImplementation((c) => c),
    config: { onEvent } as unknown as StepExecutionServices["config"],
    ...overrides,
  } as unknown as StepExecutionServices;
};

const createStep = (overrides?: Partial<WorkflowStep>): WorkflowStep =>
  ({
    name: "review",
    pattern: "peer-review",
    participants: ["alice", "bob"],
    config: { parallel: true, minScore: 7 },
    ...overrides,
  }) as WorkflowStep;

const createContext = (overrides?: Partial<StepContext>): StepContext =>
  ({
    runId: "run-1",
    executionId: "exec-1",
    signal: new AbortController().signal,
    ...overrides,
  }) as StepContext;

describe("peerReviewStrategy", () => {
  it("throws when participants is empty", async () => {
    const services = createServices();
    await expect(
      peerReviewStrategy.execute(createStep({ participants: [] }), createContext(), services)
    ).rejects.toThrow("requires participants");
  });

  it("throws when participants is not an array", async () => {
    const services = createServices();
    await expect(
      peerReviewStrategy.execute(
        createStep({ participants: "alice" as unknown as string[] }),
        createContext(),
        services
      )
    ).rejects.toThrow("requires participants");
  });

  it("uses default config when step.config is undefined", async () => {
    const services = createServices();
    const result = (await peerReviewStrategy.execute(
      createStep({ config: undefined }),
      createContext(),
      services
    )) as { passed: boolean };
    expect(result.passed).toBe(true);
  });

  it("runs sequentially when parallel is false", async () => {
    const services = createServices();
    const result = (await peerReviewStrategy.execute(
      createStep({ config: { parallel: false } }),
      createContext(),
      services
    )) as { passed: boolean };
    expect(result.passed).toBe(true);
    expect(services.requestForStep).toHaveBeenCalledTimes(2);
  });

  it("handles null content in response (hits ?? branch)", async () => {
    const services = createServices({
      requestForStep: vi.fn().mockResolvedValue({
        model: "gpt-4",
        message: { role: "assistant", content: null },
      }),
    });
    // null content → vote REQUEST_CHANGES, score 50, evaluation fails
    await expect(
      peerReviewStrategy.execute(createStep(), createContext(), services)
    ).rejects.toThrow("Peer review failed");
  });

  it("handles rejected parallel outcomes and emits failed event", async () => {
    const onEvent = vi.fn();
    const services = createServices({
      onEvent,
      requestForStep: vi
        .fn()
        .mockResolvedValueOnce({
          model: "gpt-4",
          message: { role: "assistant", content: APPROVE_CONTENT },
        })
        .mockRejectedValueOnce(new Error("network error")),
    });
    const result = (await peerReviewStrategy.execute(createStep(), createContext(), services)) as {
      passed: boolean;
    };
    expect(result.passed).toBe(true);
    expect(onEvent).toHaveBeenCalledWith(
      "peer_review_vote",
      expect.objectContaining({ failed: true })
    );
  });

  it("handles rejected parallel outcomes with non-Error reason", async () => {
    const onEvent = vi.fn();
    const services = createServices({
      onEvent,
      requestForStep: vi
        .fn()
        .mockResolvedValueOnce({
          model: "gpt-4",
          message: { role: "assistant", content: APPROVE_CONTENT },
        })
        .mockRejectedValueOnce("string error"),
    });
    const result = (await peerReviewStrategy.execute(createStep(), createContext(), services)) as {
      passed: boolean;
    };
    expect(result.passed).toBe(true);
    expect(onEvent).toHaveBeenCalledWith(
      "peer_review_vote",
      expect.objectContaining({ error: "string error", failed: true })
    );
  });

  it("throws when evaluation fails", async () => {
    const services = createServices({
      requestForStep: vi.fn().mockResolvedValue({
        model: "gpt-4",
        message: { role: "assistant", content: "REJECT: score 3/10" },
      }),
    });
    await expect(
      peerReviewStrategy.execute(createStep(), createContext(), services)
    ).rejects.toThrow("Peer review failed");
  });

  it("falls back to _timeoutSignal when combineAbortSignals returns undefined", async () => {
    const services = createServices({
      combineAbortSignals: vi.fn().mockReturnValue(undefined),
    });
    const result = (await peerReviewStrategy.execute(createStep(), createContext(), services)) as {
      passed: boolean;
    };
    expect(result.passed).toBe(true);
  });

  it("emits peer_review_result event on success", async () => {
    const onEvent = vi.fn();
    const services = createServices({ onEvent });
    await peerReviewStrategy.execute(createStep(), createContext(), services);
    expect(onEvent).toHaveBeenCalledWith(
      "peer_review_result",
      expect.objectContaining({ passed: true })
    );
  });
});
