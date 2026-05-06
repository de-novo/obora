/**
 * StepExecutor unit tests
 */

import { describe, it, expect, vi } from "vitest";
import {
  stepToTask,
  parseDuration,
  executeStep,
  type AgentResolver,
} from "../StepScheduler.js";
import { OboraError, type Step } from "../workflow/index.js";
import { SkillLoader } from "@obora/adapters";
import type { BaseAgent, Task, TaskResult, AgentContext } from "@obora-kit/runtime";
import { Blackboard } from "../../blackboard/core/blackboard.js";

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
    board: new Blackboard(),
    history: [],
  };
}

function makeAgent(result: Partial<TaskResult> = {}): BaseAgent {
  return {
    execute: vi.fn(async (): Promise<TaskResult> => ({
      taskId: "test-step",
      success: true,
      output: "agent output",
      duration: 100,
      tokensUsed: { prompt: 10, completion: 20, total: 30 },
      ...result,
    })),
  } as unknown as BaseAgent;
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

    const calledTask = vi.mocked(agent.execute).mock.calls[0][0] as Task;
    expect(calledTask.id).toBe("test-step");
    expect(calledTask.type).toBe("executor");
  });

  it("should format structured output and forward subscribed agent events", async () => {
    const unsubscribe = vi.fn();
    const onEvent = vi.fn();
    const agent = {
      subscribe: vi.fn((listener: (event: unknown) => void) => {
        listener({ type: "agent.progress", step: "test-step" });
        return unsubscribe;
      }),
      execute: vi.fn(async (): Promise<TaskResult> => ({
        taskId: "test-step",
        success: true,
        output: { ok: true },
        duration: 1,
        tokensUsed: { prompt: 1, completion: 1, total: 2 },
      })),
    } as unknown as BaseAgent;

    const result = await executeStep(makeStep(), makeResolver(agent), makeContext(), {
      onEvent,
    });

    expect(result).toEqual({
      success: true,
      output: "{\n  \"ok\": true\n}",
    });
    expect(onEvent).toHaveBeenCalledWith({ type: "agent.progress", step: "test-step" });
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("should load step skills, configure runtime extensions, and tear them down", async () => {
    const loadSkills = vi.spyOn(SkillLoader.prototype, "loadSkills").mockResolvedValue({
      loaded: [],
      tools: [],
      systemPrompt: "Use loaded guidance.",
    });
    const teardown = vi.spyOn(SkillLoader.prototype, "teardown").mockResolvedValue(undefined);
    const configureRuntimeExtensions = vi.fn();
    const clearRuntimeExtensions = vi.fn();
    const agent = {
      id: "agent-with-skills",
      configureRuntimeExtensions,
      clearRuntimeExtensions,
      execute: vi.fn(async (): Promise<TaskResult> => ({
        taskId: "test-step",
        success: true,
        output: "skill output",
        duration: 1,
        tokensUsed: { prompt: 1, completion: 1, total: 2 },
      })),
    } as unknown as BaseAgent;

    try {
      const result = await executeStep(
        makeStep({ skills: ["skill-a", "skill-b"] }),
        makeResolver(agent),
        makeContext(),
      );

      expect(result).toEqual({ success: true, output: "skill output" });
      expect(loadSkills).toHaveBeenCalledWith(["skill-a", "skill-b"], {
        cwd: process.cwd(),
        agentId: "agent-with-skills",
        stepName: "test-step",
      });
      expect(configureRuntimeExtensions).toHaveBeenCalledWith({
        tools: [],
        systemPromptAppend: "Use loaded guidance.",
      });
      expect(teardown).toHaveBeenCalledWith([]);
      expect(clearRuntimeExtensions).toHaveBeenCalledTimes(1);
    } finally {
      loadSkills.mockRestore();
      teardown.mockRestore();
    }
  });

  it("should fall back to the default timeout when step.timeout is invalid", async () => {
    const agent = makeAgent();

    const result = await executeStep(
      makeStep({ timeout: "not-a-duration" }),
      makeResolver(agent),
      makeContext()
    );

    expect(result.success).toBe(true);
    expect(agent.execute).toHaveBeenCalledTimes(1);
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
      execute: vi.fn(async (): Promise<TaskResult> => {
        throw new Error("unexpected");
      }),
    } as unknown as BaseAgent;
    const resolver = makeResolver(agent);

    const result = await executeStep(makeStep(), resolver, makeContext());

    expect(result.success).toBe(false);
    expect(result.error).toBe("unexpected");
    expect(result.diagnosisCode).toBe("E4001");
  });

  it("should format unsuccessful output without error metadata when no error exists", async () => {
    const agent = makeAgent({
      success: false,
      output: { reason: "empty" },
      error: undefined,
    });

    const result = await executeStep(makeStep(), makeResolver(agent), makeContext());

    expect(result).toEqual({
      success: false,
      output: "{\n  \"reason\": \"empty\"\n}",
      error: undefined,
      diagnosisCode: "E4001",
    });
    expect("errorMeta" in result).toBe(false);
  });

  it.each([
    {
      name: "Obora error",
      error: new OboraError("E4012", "schema rejected"),
      expectedCode: "E4012",
      expectedMessage: "E4012: undefined - schema rejected",
    },
    {
      name: "provider rate limit",
      error: Object.assign(new Error("rate limited"), { code: "E4011" }),
      expectedCode: "E4005",
      expectedMessage: "rate limited",
    },
    {
      name: "generic coded error",
      error: Object.assign(new Error("tool failed"), { code: "E4013" }),
      expectedCode: "E4013",
      expectedMessage: "tool failed",
    },
    {
      name: "plain coded object",
      error: { code: "E4010", message: "plain failure" },
      expectedCode: "E4010",
      expectedMessage: "[object Object]",
    },
  ])("should normalize $name failures", async ({ error, expectedCode, expectedMessage }) => {
    const agent = {
      execute: vi.fn(async (): Promise<TaskResult> => {
        throw error;
      }),
    } as unknown as BaseAgent;

    const result = await executeStep(makeStep(), makeResolver(agent), makeContext());

    expect(result.success).toBe(false);
    expect(result.error).toBe(expectedMessage);
    expect(result.diagnosisCode).toBe(expectedCode);
  });

  it("should include retry-exhausted metadata for retry wrapper errors", async () => {
    const retryError = Object.assign(new Error("all attempts failed"), {
      name: "RetryExhaustedError",
      attempts: 3,
      getLastErrorCode: () => "E4011",
    });
    const agent = {
      execute: vi.fn(async (): Promise<TaskResult> => {
        throw retryError;
      }),
    } as unknown as BaseAgent;

    const result = await executeStep(makeStep(), makeResolver(agent), makeContext());

    expect(result.success).toBe(false);
    expect(result.diagnosisCode).toBe("E4005");
    expect(result.errorMeta).toMatchObject({
      code: "E4005",
      message: "all attempts failed",
      attempts: 3,
      lastError: "E4011",
    });
  });

  it("should derive retry metadata from the last error fallback", async () => {
    const retryError = Object.assign(new Error("last error stored"), {
      name: "RetryExhaustedError",
      attempts: 2,
      lastError: { lastErrorCode: "E4013" },
    });
    const agent = {
      execute: vi.fn(async (): Promise<TaskResult> => {
        throw retryError;
      }),
    } as unknown as BaseAgent;

    const result = await executeStep(makeStep(), makeResolver(agent), makeContext());

    expect(result.success).toBe(false);
    expect(result.diagnosisCode).toBe("E4005");
    expect(result.errorMeta).toMatchObject({
      attempts: 2,
      lastError: "E4013",
    });
  });

  it("should derive retry metadata from root cause when no coded last error exists", async () => {
    const retryError = Object.assign(new Error("root cause stored"), {
      name: "RetryExhaustedError",
      attempts: 2,
      getLastErrorCode: () => undefined,
      getRootCause: () => Object.assign(new Error("provider limited"), { code: "E4011" }),
    });
    const agent = {
      execute: vi.fn(async (): Promise<TaskResult> => {
        throw retryError;
      }),
    } as unknown as BaseAgent;

    const result = await executeStep(makeStep(), makeResolver(agent), makeContext());

    expect(result.success).toBe(false);
    expect(result.diagnosisCode).toBe("E4005");
    expect(result.errorMeta).toMatchObject({
      attempts: 2,
      lastError: "E4005",
    });
  });
});

describe("executeStep — cancellation and retry", () => {
  it("should return E4006 when the external signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const agent = makeAgent();

    const result = await executeStep(makeStep(), makeResolver(agent), makeContext(), {
      signal: controller.signal,
    });

    expect(result).toEqual({
      success: false,
      error: "Execution cancelled before start",
      diagnosisCode: "E4006",
    });
    expect(agent.execute).not.toHaveBeenCalled();
  });

  it("should return E4006 when the external signal aborts in-flight execution", async () => {
    const controller = new AbortController();
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const agent = {
      execute: vi.fn(() => {
        markStarted();
        return new Promise<TaskResult>(() => {
          // Keep the task pending until the external signal rejects the race.
        });
      }),
    } as unknown as BaseAgent;

    const pending = executeStep(makeStep(), makeResolver(agent), makeContext(), {
      signal: controller.signal,
    });
    await started;
    controller.abort();

    await expect(pending).resolves.toMatchObject({
      success: false,
      error: "Execution cancelled",
      diagnosisCode: "E4006",
    });
  });

  it("should retry retryable failures after best-effort continue", async () => {
    const continueStep = vi.fn(async () => undefined);
    const agent = {
      continue: continueStep,
      execute: vi.fn()
        .mockResolvedValueOnce({
          taskId: "test-step",
          success: false,
          output: null,
          duration: 1,
          tokensUsed: { prompt: 1, completion: 1, total: 2 },
          error: new Error("transient"),
        } satisfies TaskResult)
        .mockResolvedValueOnce({
          taskId: "test-step",
          success: true,
          output: "recovered",
          duration: 1,
          tokensUsed: { prompt: 1, completion: 1, total: 2 },
        } satisfies TaskResult),
    } as unknown as BaseAgent;

    const result = await executeStep(makeStep(), makeResolver(agent), makeContext(), {
      retryAttempts: 1,
    });

    expect(result).toEqual({
      success: true,
      output: "recovered",
    });
    expect(continueStep).toHaveBeenCalledTimes(1);
    expect(agent.execute).toHaveBeenCalledTimes(2);
  });

  it("should stop retry delay when the external signal aborts", async () => {
    const controller = new AbortController();
    let markContinueStarted!: () => void;
    let releaseContinue!: () => void;
    const continueStarted = new Promise<void>((resolve) => {
      markContinueStarted = resolve;
    });
    const continueCanFinish = new Promise<void>((resolve) => {
      releaseContinue = resolve;
    });
    const agent = {
      continue: vi.fn(() => {
        markContinueStarted();
        return continueCanFinish;
      }),
      execute: vi.fn(async (): Promise<TaskResult> => ({
        taskId: "test-step",
        success: false,
        output: null,
        duration: 1,
        tokensUsed: { prompt: 1, completion: 1, total: 2 },
        error: new Error("transient"),
      })),
    } as unknown as BaseAgent;

    const pending = executeStep(makeStep(), makeResolver(agent), makeContext(), {
      retryAttempts: 1,
      signal: controller.signal,
    });

    await continueStarted;
    releaseContinue();
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();

    await expect(pending).resolves.toMatchObject({
      success: false,
      error: "Execution cancelled",
      diagnosisCode: "E4006",
    });
    expect(agent.execute).toHaveBeenCalledTimes(1);
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
      execute: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000)),
      ),
    } as unknown as BaseAgent;
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
      execute: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000)),
      ),
    } as unknown as BaseAgent;
    const resolver = makeResolver(agent);
    const step = makeStep({ timeout: "1s" });

    const result = await executeStep(step, resolver, makeContext());

    expect(result.success).toBe(false);
    expect(result.diagnosisCode).toBe("E4002");
  });
});

describe("executeStep — timeout (E4002)", () => {
  it("should return E4002 when step exceeds timeout", async () => {
    const agent = {
      execute: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000)),
      ),
    } as unknown as BaseAgent;
    const resolver = makeResolver(agent);

    const result = await executeStep(
      makeStep(),
      resolver,
      makeContext(),
      { timeoutMs: 50 }, // very short timeout
    );

    expect(result.success).toBe(false);
    expect(result.diagnosisCode).toBe("E4002");
    expect(result.error).toBe("Timeout exceeded");
  });
});

// ---------------------------------------------------------------------------
// executeStep — single-writer policy
// ---------------------------------------------------------------------------

describe("executeStep — single-writer policy", () => {
  it("should NOT call board.write — status persistence is executeWorkflow's responsibility", async () => {
    const writeSpy = vi.fn();
    const board = new Blackboard();
    vi.spyOn(board, "write").mockImplementation(() => {
      writeSpy();
      return { success: true, version: board.version, path: "test", previousValue: undefined };
    });
    const ctx: AgentContext = {
      sessionId: "s",
      board,
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
    const board = new Blackboard();
    vi.spyOn(board, "write").mockImplementation(() => {
      writeSpy();
      return { success: true, version: board.version, path: "test", previousValue: undefined };
    });
    const ctx: AgentContext = {
      sessionId: "s",
      board,
      history: [],
    };

    const agent = makeAgent({ success: false, error: new Error("fail") });
    const resolver = makeResolver(agent);

    await executeStep(makeStep(), resolver, ctx);

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("should not call board.write on timeout", async () => {
    const writeSpy = vi.fn();
    const board = new Blackboard();
    vi.spyOn(board, "write").mockImplementation(() => {
      writeSpy();
      return { success: true, version: board.version, path: "test", previousValue: undefined };
    });
    const ctx: AgentContext = {
      sessionId: "s",
      board,
      history: [],
    };

    const agent = {
      execute: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000)),
      ),
    } as unknown as BaseAgent;
    const resolver = makeResolver(agent);

    await executeStep(makeStep(), resolver, ctx, { timeoutMs: 50 });

    expect(writeSpy).not.toHaveBeenCalled();
  });
});
