/**
 * StepExecutor unit tests
 */

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RetryExhaustedError } from "@obora/adapters";
import type { Step } from "@obora/runtime";
import type { BaseAgent, Task, TaskResult, AgentContext } from "@obora/runtime";
import { OboraError } from "@obora/runtime";
import { describe, it, expect, vi } from "vitest";

import { stepToTask, parseDuration, executeStep, type AgentResolver } from "../step-executor.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStep(overrides: Partial<Step> = {}): Step {
  return {
    name: "test-step",
    agent: "executor",
    description: "A test step",
    config: { key: "value" },
    inputs: ["input.md"],
    outputs: ["output.md"],
    ...overrides,
  };
}

function makeContext(): AgentContext {
  return {
    sessionId: "test-session",
    board: { read: () => ({}), write: () => {} } as unknown,
    history: [],
  };
}

function makeAgent(result: Partial<TaskResult> = {}): BaseAgent {
  return {
    execute: vi.fn().mockResolvedValue({
      taskId: "test-step",
      success: true,
      output: "agent output",
      duration: 100,
      tokensUsed: { prompt: 10, completion: 20, total: 30 },
      ...result,
    }),
  } as unknown;
}

function makeResolver(agent: BaseAgent): AgentResolver {
  return { resolve: vi.fn().mockReturnValue(agent) };
}

// ---------------------------------------------------------------------------
// stepToTask
// ---------------------------------------------------------------------------

describe("stepToTask", () => {
  it("should convert a full Step to Task", () => {
    const step = makeStep();
    const task = stepToTask(step);

    expect(task.id).toBe("test-step");
    expect(task.type).toBe("executor");
    expect(task.description).toBe("A test step");
    expect(task.input).toEqual({ key: "value" });
    expect(task.priority).toBe(1);
    expect(task.metadata).toEqual({
      inputs: ["input.md"],
      outputs: ["output.md"],
    });
  });

  it("should use step.name as description when description is absent", () => {
    const task = stepToTask(makeStep({ description: undefined }));
    expect(task.description).toBe("test-step");
  });

  it("should default input to {} when config is absent", () => {
    const task = stepToTask(makeStep({ config: undefined }));
    expect(task.input).toEqual({});
  });

  it("should preserve undefined inputs/outputs in metadata", () => {
    const task = stepToTask(makeStep({ inputs: undefined, outputs: undefined }));
    expect(task.metadata).toEqual({ inputs: undefined, outputs: undefined });
  });

  it("should handle minimal step (name + agent only)", () => {
    const task = stepToTask({ name: "min", agent: "a" });
    expect(task.id).toBe("min");
    expect(task.type).toBe("a");
    expect(task.description).toBe("min");
    expect(task.input).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// parseDuration
// ---------------------------------------------------------------------------

describe("parseDuration", () => {
  it("should parse seconds", () => expect(parseDuration("30s")).toBe(30_000));
  it("should parse minutes", () => expect(parseDuration("5m")).toBe(300_000));
  it("should parse hours", () => expect(parseDuration("1h")).toBe(3_600_000));
  it("should parse days", () => expect(parseDuration("2d")).toBe(172_800_000));
  it("should throw on invalid format", () => {
    expect(() => parseDuration("abc")).toThrow("Invalid duration");
  });
});

// ---------------------------------------------------------------------------
// executeStep — success path
// ---------------------------------------------------------------------------

describe("executeStep — success", () => {
  it("should call agent.execute and return success result", async () => {
    const agent = makeAgent();
    const resolver = makeResolver(agent);
    const step = makeStep();
    const ctx = makeContext();

    const result = await executeStep(step, resolver, ctx);

    expect(result.success).toBe(true);
    expect(result.output).toBe("agent output");
    expect(result.diagnosisCode).toBeUndefined();
    expect(resolver.resolve).toHaveBeenCalledWith({
      agent: "executor",
      type: "executor",
      config: undefined,
    });
    expect(agent.execute).toHaveBeenCalledTimes(1);
  });

  it("should pass converted task to agent.execute", async () => {
    const agent = makeAgent();
    const resolver = makeResolver(agent);
    const step = makeStep();

    await executeStep(step, resolver, makeContext());

    const executeMock = agent.execute as unknown as ReturnType<typeof vi.fn>;
    const calledTask = executeMock.mock.calls[0]?.[0] as Task;
    expect(calledTask.id).toBe("test-step");
    expect(calledTask.type).toBe("executor");
  });

  it("should serialize object outputs", async () => {
    const agent = makeAgent({ output: { ok: true, count: 2 } });
    const resolver = makeResolver(agent);

    const result = await executeStep(makeStep(), resolver, makeContext());

    expect(result).toEqual({
      success: true,
      output: JSON.stringify({ ok: true, count: 2 }, null, 2),
    });
  });

  it("should forward subscribed runtime events and unsubscribe after execution", async () => {
    const unsubscribe = vi.fn();
    const agent = {
      ...makeAgent(),
      id: "agent-1",
      subscribe: vi.fn((listener: (event: unknown) => void) => {
        listener({ type: "stream", chunk: "hello" });
        return unsubscribe;
      }),
    } as unknown as BaseAgent;
    const resolver = makeResolver(agent);
    const onEvent = vi.fn();

    const result = await executeStep(makeStep(), resolver, makeContext(), { onEvent });

    expect(result.success).toBe(true);
    expect(onEvent).toHaveBeenCalledWith({ type: "stream", chunk: "hello" });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("should pass resolved agent config through to the resolver", async () => {
    const agent = makeAgent();
    const resolver = makeResolver(agent);
    const config = {
      provider: "openai",
      model: "gpt-4o-mini",
      systemPrompt: "Use policy.",
    };

    const result = await executeStep(makeStep(), resolver, makeContext(), {
      resolvedAgentConfig: config,
    });

    expect(result.success).toBe(true);
    expect(resolver.resolve).toHaveBeenCalledWith({
      agent: "executor",
      type: "executor",
      config,
    });
  });

  it("should load local skills and clear runtime extensions after execution", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-step-skill-"));
    const skillDir = join(root, ".obora", "skills", "local-test");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, "SKILL.md"),
      [
        "---",
        "name: local-test",
        "description: Local test skill",
        "---",
        "Add local test instructions.",
        "",
      ].join("\n"),
      "utf-8"
    );

    const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
    const configureRuntimeExtensions = vi.fn();
    const clearRuntimeExtensions = vi.fn();
    const agent = {
      ...makeAgent(),
      id: "agent-1",
      configureRuntimeExtensions,
      clearRuntimeExtensions,
    } as unknown as BaseAgent;
    const resolver = makeResolver(agent);

    try {
      const result = await executeStep(
        makeStep({ skills: ["local-test"] }),
        resolver,
        makeContext()
      );

      expect(result).toEqual({ success: true, output: "agent output" });
      expect(configureRuntimeExtensions).toHaveBeenCalledWith({
        tools: [],
        systemPromptAppend: "Add local test instructions.",
      });
      expect(clearRuntimeExtensions).toHaveBeenCalledTimes(1);
    } finally {
      cwd.mockRestore();
      await rm(root, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// executeStep — failure paths
// ---------------------------------------------------------------------------

describe("executeStep — agent failure", () => {
  it("should return E4001 when agent returns success:false", async () => {
    const agent = makeAgent({
      success: false,
      output: null,
      error: new Error("LLM refused"),
    });
    const resolver = makeResolver(agent);

    const result = await executeStep(makeStep(), resolver, makeContext());

    expect(result.success).toBe(false);
    expect(result.error).toBe("LLM refused");
    expect(result.diagnosisCode).toBe("E4001");
  });

  it("should return E4001 when agent throws unexpected error", async () => {
    const agent = {
      execute: vi.fn().mockRejectedValue(new Error("unexpected")),
    } as unknown;
    const resolver = makeResolver(agent);

    const result = await executeStep(makeStep(), resolver, makeContext());

    expect(result.success).toBe(false);
    expect(result.error).toBe("unexpected");
    expect(result.diagnosisCode).toBe("E4001");
  });

  it("should map provider retry exhaustion codes from generic errors", async () => {
    const providerError = Object.assign(new Error("rate limited"), { code: "E4011" });
    const agent = makeAgent({
      success: false,
      output: { retryable: true },
      error: providerError,
    });
    const resolver = makeResolver(agent);

    const result = await executeStep(makeStep(), resolver, makeContext());

    expect(result.success).toBe(false);
    expect(result.output).toBe(JSON.stringify({ retryable: true }, null, 2));
    expect(result.diagnosisCode).toBe("E4005");
    expect(result.errorMeta).toEqual(
      expect.objectContaining({
        code: "E4005",
        message: "rate limited",
      })
    );
  });

  it("should use default failure code when a failed result has no error object", async () => {
    const agent = makeAgent({
      success: false,
      output: null,
      error: undefined,
    });
    const resolver = makeResolver(agent);

    const result = await executeStep(makeStep(), resolver, makeContext());

    expect(result).toEqual({
      success: false,
      output: "",
      error: undefined,
      diagnosisCode: "E4001",
    });
  });

  it("should preserve OboraError diagnosis codes and metadata", async () => {
    const error = new OboraError("E4007", "context unavailable");
    const agent = {
      execute: vi.fn().mockRejectedValue(error),
    } as unknown as BaseAgent;
    const resolver = makeResolver(agent);

    const result = await executeStep(makeStep(), resolver, makeContext());

    expect(result.success).toBe(false);
    expect(result.diagnosisCode).toBe("E4007");
    expect(result.errorMeta).toEqual(
      expect.objectContaining({
        code: "E4007",
        message: error.message,
      })
    );
  });

  it("should preserve typed E4 codes from generic errors", async () => {
    const typedError = Object.assign(new Error("policy blocked"), {
      code: "E4123",
      provider: "openai",
      statusCode: 429,
      attempts: 2,
    });
    const agent = makeAgent({
      success: false,
      output: "blocked",
      error: typedError,
    });
    const resolver = makeResolver(agent);

    const result = await executeStep(makeStep(), resolver, makeContext());

    expect(result.success).toBe(false);
    expect(result.diagnosisCode).toBe("E4123");
    expect(result.errorMeta).toEqual(
      expect.objectContaining({
        code: "E4123",
        provider: "openai",
        statusCode: 429,
        attempts: 2,
      })
    );
  });

  it("should preserve typed E4 codes from thrown plain objects", async () => {
    const agent = {
      execute: vi.fn().mockRejectedValue({ code: "E4555", message: "object failure" }),
    } as unknown as BaseAgent;
    const resolver = makeResolver(agent);

    const result = await executeStep(makeStep(), resolver, makeContext());

    expect(result).toEqual({
      success: false,
      error: "[object Object]",
      diagnosisCode: "E4555",
    });
  });

  it("should include retry exhaustion last error codes in metadata", async () => {
    const rootCause = Object.assign(new Error("provider unavailable"), { code: "E4012" });
    const exhausted = new RetryExhaustedError("Max retries exceeded", rootCause, 3);
    const agent = {
      execute: vi.fn().mockRejectedValue(exhausted),
    } as unknown as BaseAgent;
    const resolver = makeResolver(agent);

    const result = await executeStep(makeStep(), resolver, makeContext());

    expect(result.success).toBe(false);
    expect(result.diagnosisCode).toBe("E4005");
    expect(result.errorMeta).toEqual(
      expect.objectContaining({
        code: "E4005",
        attempts: 3,
        lastError: "E4012",
      })
    );
  });

  it("should map retry exhaustion root causes when no E4 last code is available", async () => {
    const exhausted = new RetryExhaustedError(
      {
        code: "HTTP_500",
        message: "gateway failed",
        lastError: "gateway failed",
        lastErrorCode: "HTTP_500",
      },
      2
    );
    const agent = makeAgent({
      success: false,
      output: null,
      error: exhausted,
    });
    const resolver = makeResolver(agent);

    const result = await executeStep(makeStep(), resolver, makeContext());

    expect(result.success).toBe(false);
    expect(result.diagnosisCode).toBe("E4005");
    expect(result.errorMeta).toEqual(
      expect.objectContaining({
        attempts: 2,
        lastError: "E4001",
      })
    );
  });
});

describe("executeStep — resolver failure (E4003)", () => {
  it("should return E4003 when resolver throws", async () => {
    const resolver: AgentResolver = {
      resolve: vi.fn().mockImplementation(() => {
        throw new Error("No such agent");
      }),
    };

    const result = await executeStep(makeStep(), resolver, makeContext());

    expect(result.success).toBe(false);
    expect(result.diagnosisCode).toBe("E4003");
    expect(result.error).toContain("Agent resolution failed");
  });
});

describe("executeStep — timeout precedence", () => {
  it("should prefer options.timeoutMs over step.timeout", async () => {
    // step.timeout = "1s" (1000ms), but options.timeoutMs = 50ms should win
    const agent = {
      execute: vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5000))),
    } as unknown;
    const resolver = makeResolver(agent);
    const step = makeStep({ timeout: "10s" }); // 10s from YAML

    const result = await executeStep(step, resolver, makeContext(), { timeoutMs: 50 });

    // Should timeout at 50ms (options), not 10s (step)
    expect(result.success).toBe(false);
    expect(result.diagnosisCode).toBe("E4002");
  });

  it("should use step.timeout when options.timeoutMs is undefined", async () => {
    // step.timeout = "1s" → agent takes 5s → should timeout at 1s
    const agent = {
      execute: vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5000))),
    } as unknown;
    const resolver = makeResolver(agent);
    const step = makeStep({ timeout: "1s" });

    const result = await executeStep(step, resolver, makeContext());

    expect(result.success).toBe(false);
    expect(result.diagnosisCode).toBe("E4002");
  });

  it("should fall back to the default timeout when step.timeout is invalid", async () => {
    const agent = makeAgent();
    const resolver = makeResolver(agent);

    const result = await executeStep(makeStep({ timeout: "not-a-duration" }), resolver, makeContext());

    expect(result).toEqual({ success: true, output: "agent output" });
  });
});

describe("executeStep — timeout (E4002)", () => {
  it("should return E4002 when step exceeds timeout", async () => {
    const agent = {
      execute: vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5000))),
    } as unknown;
    const resolver = makeResolver(agent);

    const result = await executeStep(
      makeStep(),
      resolver,
      makeContext(),
      { timeoutMs: 50 } // very short timeout
    );

    expect(result.success).toBe(false);
    expect(result.diagnosisCode).toBe("E4002");
    expect(result.error).toBe("Timeout exceeded");
  });
});

describe("executeStep — cancellation", () => {
  it("should return E4006 when the external signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const agent = makeAgent();
    const resolver = makeResolver(agent);

    const result = await executeStep(makeStep(), resolver, makeContext(), {
      signal: controller.signal,
    });

    expect(result).toEqual({
      success: false,
      error: "Execution cancelled before start",
      diagnosisCode: "E4006",
    });
    expect(agent.execute).not.toHaveBeenCalled();
  });

  it("should return E4006 when the external signal aborts during execution", async () => {
    const controller = new AbortController();
    const agent = {
      execute: vi.fn().mockImplementation(
        () =>
          new Promise(() => {
            // Intentionally pending until AbortSignal.any rejects the race.
          })
      ),
    } as unknown as BaseAgent;
    const resolver = makeResolver(agent);

    const promise = executeStep(makeStep(), resolver, makeContext(), {
      signal: controller.signal,
      timeoutMs: 10_000,
    });
    await vi.waitFor(() => expect(agent.execute).toHaveBeenCalled());
    controller.abort();

    await expect(promise).resolves.toEqual({
      success: false,
      error: "Execution cancelled",
      diagnosisCode: "E4006",
    });
  });
});

describe("executeStep — retry", () => {
  it("should retry retryable failures, continue the agent, and return the later success", async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const agent = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          taskId: "test-step",
          success: false,
          output: null,
          error: new Error("transient"),
          duration: 10,
        })
        .mockResolvedValueOnce({
          taskId: "test-step",
          success: true,
          output: "recovered",
          duration: 10,
        }),
      continue: vi.fn().mockRejectedValue(new Error("continue unavailable")),
    } as unknown as BaseAgent & { continue: ReturnType<typeof vi.fn> };
    const resolver = makeResolver(agent);

    const promise = executeStep(makeStep(), resolver, makeContext(), { retryAttempts: 1 });
    await vi.advanceTimersByTimeAsync(1_000);
    const result = await promise;

    expect(result).toEqual({ success: true, output: "recovered" });
    expect(agent.execute).toHaveBeenCalledTimes(2);
    expect(agent.continue).toHaveBeenCalledTimes(1);

    random.mockRestore();
    vi.useRealTimers();
  });

  it("should cancel while waiting for a retry delay", async () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const controller = new AbortController();
    const agent = {
      execute: vi.fn().mockResolvedValue({
        taskId: "test-step",
        success: false,
        output: null,
        error: new Error("transient"),
        duration: 10,
      }),
    } as unknown as BaseAgent;
    const resolver = makeResolver(agent);

    const promise = executeStep(makeStep(), resolver, makeContext(), {
      retryAttempts: 1,
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(agent.execute).toHaveBeenCalledTimes(1));
    controller.abort();
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(promise).resolves.toEqual({
      success: false,
      error: "Execution cancelled",
      diagnosisCode: "E4006",
    });

    random.mockRestore();
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// executeStep — single-writer policy
// ---------------------------------------------------------------------------

describe("executeStep — single-writer policy", () => {
  it("should NOT call board.write — status persistence is executeWorkflow's responsibility", async () => {
    const writeSpy = vi.fn();
    const ctx: AgentContext = {
      sessionId: "s",
      board: { read: () => ({}), write: writeSpy } as unknown,
      history: [],
    };

    const agent = makeAgent();
    const resolver = makeResolver(agent);

    await executeStep(makeStep(), resolver, ctx);

    // Single-writer invariant: StepExecutor must NEVER call board.write
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("should not call board.write even on agent failure", async () => {
    const writeSpy = vi.fn();
    const ctx: AgentContext = {
      sessionId: "s",
      board: { read: () => ({}), write: writeSpy } as unknown,
      history: [],
    };

    const agent = makeAgent({ success: false, error: new Error("fail") });
    const resolver = makeResolver(agent);

    await executeStep(makeStep(), resolver, ctx);

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("should not call board.write on timeout", async () => {
    const writeSpy = vi.fn();
    const ctx: AgentContext = {
      sessionId: "s",
      board: { read: () => ({}), write: writeSpy } as unknown,
      history: [],
    };

    const agent = {
      execute: vi
        .fn()
        .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 5000))),
    } as unknown;
    const resolver = makeResolver(agent);

    await executeStep(makeStep(), resolver, ctx, { timeoutMs: 50 });

    expect(writeSpy).not.toHaveBeenCalled();
  });
});
