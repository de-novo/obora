import { describe, expect, it, vi } from "vitest";

import { StepExecutor, type LLMAdapterLike } from "../step-executor.js";

describe("StepExecutor", () => {
  it("executes a normal step using task + dependency context", async () => {
    const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>().mockResolvedValue({
      message: { role: "assistant", content: "done" },
    });

    const executor = new StepExecutor(
      { chatCompletion },
      new Map([
        ["writer", () => ({ role: "Writer", description: "Writes clearly" })],
      ]),
      { model: "test-model" },
    );

    const result = await executor.executeStep(
      {
        name: "draft",
        agent: "writer",
        input: { task: "Write summary" },
        depends_on: ["plan"],
      },
      { previousOutputs: { plan: "plan output" } },
    );

    expect(result.output).toBe("done");
    expect(chatCompletion).toHaveBeenCalledTimes(1);
    const call = chatCompletion.mock.calls[0]?.[0];
    expect(call?.messages[0]?.role).toBe("system");
    expect(call?.messages[1]?.content).toContain("Write summary");
    expect(call?.messages[1]?.content).toContain("plan output");
  });

  it("handles consensus with majority", async () => {
    const chatCompletion = vi
      .fn<LLMAdapterLike["chatCompletion"]>()
      .mockResolvedValueOnce({ message: { role: "assistant", content: "APPROVE: looks good" } })
      .mockResolvedValueOnce({ message: { role: "assistant", content: "REJECT: not enough" } })
      .mockResolvedValueOnce({ message: { role: "assistant", content: "APPROVE with notes" } });

    const executor = new StepExecutor(
      { chatCompletion },
      new Map(),
      {},
    );

    const result = await executor.executeStep(
      {
        name: "review",
        pattern: "consensus",
        participants: ["r1", "r2", "r3"],
        input: { task: "Review this" },
      },
      { previousOutputs: {} },
    );

    expect(result.votes).toHaveLength(3);
    expect(result.output).toContain("[r1] APPROVE");
    expect(chatCompletion).toHaveBeenCalledTimes(3);
  });

  it("uses REQUEST_CHANGES for ambiguous consensus vote text", async () => {
    const chatCompletion = vi
      .fn<LLMAdapterLike["chatCompletion"]>()
      .mockResolvedValueOnce({ message: { role: "assistant", content: "looks fine" } })
      .mockResolvedValueOnce({ message: { role: "assistant", content: "APPROVE" } })
      .mockResolvedValueOnce({ message: { role: "assistant", content: "APPROVE" } });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});

    const result = await executor.executeStep(
      {
        name: "review-safe-default",
        pattern: "consensus",
        participants: ["r1", "r2", "r3"],
        input: { task: "Review this" },
      },
      { previousOutputs: {} },
    );

    expect(result.votes?.[0]?.vote).toBe("REQUEST_CHANGES");
  });
});
