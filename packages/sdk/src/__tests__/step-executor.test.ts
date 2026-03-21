import { describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

  it("applies consensus-wide timeout", async () => {
    const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return { message: { role: "assistant", content: "APPROVE" } };
    });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});

    await expect(
      executor.executeStep(
        {
          name: "review-timeout",
          pattern: "consensus",
          participants: ["r1", "r2", "r3"],
          input: { task: "Review this" },
          config: { llmTimeoutMs: 100, consensusTimeoutMs: 60 },
        },
        { previousOutputs: {} },
      ),
    ).rejects.toThrow("Consensus timed out");
  });

  it("cleans up parent abort listeners after successful request completion", async () => {
    const parentController = new AbortController();
    const addEventListenerSpy = vi.spyOn(parentController.signal, "addEventListener");
    const removeEventListenerSpy = vi.spyOn(parentController.signal, "removeEventListener");

    const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>().mockResolvedValue({
      message: { role: "assistant", content: "done" },
    });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});

    await executor.executeStep(
      {
        name: "cleanup-check",
        agent: "writer",
        input: { task: "Write summary" },
      },
      { previousOutputs: {}, signal: parentController.signal },
    );

    expect(addEventListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function), { once: true });
    expect(removeEventListenerSpy).toHaveBeenCalledWith("abort", expect.any(Function));
  });

  it("aborts in-flight request when consensus timeout happens", async () => {
    let aborted = false;
    const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>().mockImplementation(async ({ signal }) => {
      await new Promise<void>((resolve, reject) => {
        signal?.addEventListener(
          "abort",
          () => {
            aborted = true;
            reject(signal.reason ?? new Error("aborted"));
          },
          { once: true },
        );
      });
      return { message: { role: "assistant", content: "APPROVE" } };
    });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});

    await expect(
      executor.executeStep(
        {
          name: "review-timeout-abort",
          pattern: "consensus",
          participants: ["r1"],
          input: { task: "Review this" },
          config: { llmTimeoutMs: 1000, consensusTimeoutMs: 10 },
        },
        { previousOutputs: {} },
      ),
    ).rejects.toThrow("Consensus timed out");

    expect(aborted).toBe(true);
  });

  it("combines parent signal with consensus timeout only once", async () => {
    const parentController = new AbortController();
    const addEventListenerSpy = vi.spyOn(parentController.signal, "addEventListener");

    const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>().mockResolvedValue({
      message: { role: "assistant", content: "APPROVE" },
    });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});

    await executor.executeStep(
      {
        name: "review-signal-combine",
        pattern: "consensus",
        participants: ["r1", "r2", "r3"],
        input: { task: "Review this" },
      },
      { previousOutputs: {}, signal: parentController.signal },
    );

    const parentAbortRegistrations = addEventListenerSpy.mock.calls.filter(([eventName]) => eventName === "abort");
    expect(parentAbortRegistrations).toHaveLength(1);
  });

  it("supports configurable consensus quorum", async () => {
    const chatCompletion = vi
      .fn<LLMAdapterLike["chatCompletion"]>()
      .mockResolvedValueOnce({ message: { role: "assistant", content: "APPROVE" } })
      .mockResolvedValueOnce({ message: { role: "assistant", content: "APPROVE" } })
      .mockResolvedValueOnce({ message: { role: "assistant", content: "REJECT" } })
      .mockResolvedValueOnce({ message: { role: "assistant", content: "REJECT" } });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});

    const result = await executor.executeStep(
      {
        name: "review-quorum",
        pattern: "consensus",
        participants: ["r1", "r2", "r3", "r4"],
        input: { task: "Review this" },
        config: { quorum: 0.5 },
      },
      { previousOutputs: {} },
    );

    expect(result.votes).toHaveLength(4);
    expect(result.output).toContain("[r1] APPROVE");
  });

  it("uses agent-specific resolver for model routing", async () => {
    const defaultChat = vi.fn<LLMAdapterLike["chatCompletion"]>().mockResolvedValue({
      message: { role: "assistant", content: "default" },
    });
    const routedChat = vi.fn<LLMAdapterLike["chatCompletion"]>().mockResolvedValue({
      message: { role: "assistant", content: "routed" },
    });

    const executor = new StepExecutor(
      { chatCompletion: defaultChat },
      new Map(),
      {
        resolveAgentLLM: async (agentName) => {
          if (agentName !== "reviewer") return undefined;
          return {
            adapter: { chatCompletion: routedChat },
            model: "custom-model",
            temperature: 0.1,
            maxTokens: 512,
          };
        },
      },
    );

    const result = await executor.executeStep(
      {
        name: "route-by-agent",
        agent: "reviewer",
        input: { task: "Review this" },
      },
      { previousOutputs: {} },
    );

    expect(result.output).toBe("routed");
    expect(defaultChat).not.toHaveBeenCalled();
    expect(routedChat).toHaveBeenCalledWith(
      expect.objectContaining({ model: "custom-model", temperature: 0.1, maxTokens: 512 }),
    );
  });

  it("explains strict majority requirement on consensus failure", async () => {
    const chatCompletion = vi
      .fn<LLMAdapterLike["chatCompletion"]>()
      .mockResolvedValueOnce({ message: { role: "assistant", content: "APPROVE" } })
      .mockResolvedValueOnce({ message: { role: "assistant", content: "REJECT" } });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});

    await expect(
      executor.executeStep(
        {
          name: "review-fail-majority",
          pattern: "consensus",
          participants: ["r1", "r2"],
          input: { task: "Review this" },
        },
        { previousOutputs: {} },
      ),
    ).rejects.toThrow("strict majority (>50%)");
  });

  it("parses structured validation JSON when validation config is enabled", async () => {
    const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>().mockResolvedValue({
      message: {
        role: "assistant",
        content: "```json\n{\n  \"passed\": false,\n  \"summary\": \"Fix TS1484 import type errors\",\n  \"failedChecks\": [{ \"name\": \"typescript\", \"message\": \"TS1484\" }]\n}\n```",
      },
    });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});
    const result = await executor.executeStep(
      {
        name: "validate",
        agent: "validator",
        input: { task: "Validate the generated app" },
        config: { validation: { enabled: true, emit_structured_result: true } },
      },
      { previousOutputs: {} },
    );

    expect(result.output).toMatchObject({
      passed: false,
      summary: "Fix TS1484 import type errors",
      failedChecks: [{ name: "typescript", message: "TS1484" }],
    });
  });

  it("parses structured validation JSON when wrapped in explanatory text", async () => {
    const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>().mockResolvedValue({
      message: {
        role: "assistant",
        content: [
          "판정 결과입니다.",
          '{"passed":false,"summary":"Need backup redesign","failedChecks":[{"name":"implementation_bug","message":"backup path broken"}],"signature":"implementation_bug:1"}',
          "위 JSON만 사용하세요.",
        ].join("\n"),
      },
    });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});
    const result = await executor.executeStep(
      {
        name: "validate-text-wrapper",
        agent: "validator",
        input: { task: "Validate the generated app" },
        config: { validation: { enabled: true, emit_structured_result: true } },
      },
      { previousOutputs: {} },
    );

    expect(result.output).toMatchObject({
      passed: false,
      summary: "Need backup redesign",
      failedChecks: [{ name: "implementation_bug", message: "backup path broken" }],
      signature: "implementation_bug:1",
    });
  });

  it("parses structured validation JSON when fenced JSON appears after explanatory text", async () => {
    const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>().mockResolvedValue({
      message: {
        role: "assistant",
        content: [
          "아래 JSON을 최종 판정으로 사용하세요.",
          "```json",
          '{"passed":true,"summary":"Validation passed","failedChecks":[],"signature":"pass"}',
          "```",
          "추가 설명은 무시해도 됩니다.",
        ].join("\n"),
      },
    });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});
    const result = await executor.executeStep(
      {
        name: "validate-fenced-wrapper",
        agent: "validator",
        input: { task: "Validate the generated app" },
        config: { validation: { enabled: true, emit_structured_result: true } },
      },
      { previousOutputs: {} },
    );

    expect(result.output).toMatchObject({
      passed: true,
      summary: "Validation passed",
      failedChecks: [],
      signature: "pass",
    });
  });

  it("injects repair context into the user prompt", async () => {
    const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>().mockResolvedValue({
      message: { role: "assistant", content: "done" },
    });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});
    await executor.executeStep(
      {
        name: "build_or_repair",
        agent: "builder",
        input: { task: "Repair the generated app" },
      },
      {
        previousOutputs: {},
        repairContext: {
          mode: "repair",
          attempt: 2,
          validationStep: "validate",
          repeatedSignatureCount: 2,
          maxNoProgressIterations: 3,
          repeatedCriticalIssueCeiling: 2,
          latestValidation: {
            passed: false,
            summary: "Fix CSS import issues",
            failedChecks: [{ name: "css", message: "Unexpected CSS import" }],
            signature: "css-import",
          },
          previousValidationResults: [
            {
              passed: false,
              summary: "Fix CSS import issues",
              failedChecks: [{ name: "css", message: "Unexpected CSS import" }],
              signature: "css-import",
            },
          ],
        },
      },
    );

    const call = chatCompletion.mock.calls[0]?.[0];
    expect(call?.messages[1]?.content).toContain("Repair context:");
    expect(call?.messages[1]?.content).toContain("Fix CSS import issues");
    expect(call?.messages[1]?.content).toContain("Attempt: 2");
    expect(call?.messages[1]?.content).toContain("Validation step: validate");
    expect(call?.messages[1]?.content).toContain("Repeated signature count: 2");
    expect(call?.messages[1]?.content).toContain("No-progress ceiling: 3");
    expect(call?.messages[1]?.content).toContain("Repeated critical issue ceiling: 2");
  });

  it("executes file tools when model returns structured tool calls", async () => {
    const cwdBefore = process.cwd();
    const workspace = await mkdtemp(join(tmpdir(), "obora-step-tools-"));
    process.chdir(workspace);

    try {
      const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>().mockImplementation(async ({ messages }) => {
        const toolResultMessage = messages.find((message) => message.role === "tool");
        if (!toolResultMessage) {
          return {
            message: {
              role: "assistant",
              content: null,
              toolCalls: [
                {
                  id: "tc-1",
                  type: "function",
                  function: {
                    name: "file_write",
                    arguments: JSON.stringify({
                      path: "docs/tool-smoke.md",
                      content: "tool smoke",
                    }),
                  },
                },
              ],
            },
          };
        }

        return {
          message: { role: "assistant", content: "done" },
        };
      });

      const executor = new StepExecutor({ chatCompletion }, new Map(), {});
      const result = await executor.executeStep(
        {
          name: "tool-smoke",
          agent: "writer",
          input: { task: "Create docs/tool-smoke.md via tool call" },
        },
        { previousOutputs: {} },
      );

      expect(result.output).toBe("done");
      expect(chatCompletion).toHaveBeenCalledTimes(2);
      expect(await readFile(join(workspace, "docs/tool-smoke.md"), "utf-8")).toBe("tool smoke");
    } finally {
      process.chdir(cwdBefore);
    }
  });
});
