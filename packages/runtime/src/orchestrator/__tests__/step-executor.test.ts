/**
 * StepExecutor unit tests
 */

import { describe, it, expect, vi } from "vitest";
import {
  stepToTask,
  parseDuration,
  executeStep,
  type AgentResolver,
  type StepResult,
} from "../StepScheduler.js";
import type { Step } from "@obora/core";
import type { BaseAgent, Task, TaskResult, AgentContext } from "@obora-kit/agents";

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
    board: { read: () => ({}), write: () => {} } as any,
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
  } as any;
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

    const calledTask = (agent.execute as any).mock.calls[0][0] as Task;
    expect(calledTask.id).toBe("test-step");
    expect(calledTask.type).toBe("executor");
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
    } as any;
    const resolver = makeResolver(agent);

    const result = await executeStep(makeStep(), resolver, makeContext());

    expect(result.success).toBe(false);
    expect(result.error).toBe("unexpected");
    expect(result.diagnosisCode).toBe("E4001");
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
    } as any;
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
    } as any;
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
    } as any;
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
    const ctx: AgentContext = {
      sessionId: "s",
      board: { read: () => ({}), write: writeSpy } as any,
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
      board: { read: () => ({}), write: writeSpy } as any,
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
      board: { read: () => ({}), write: writeSpy } as any,
      history: [],
    };

    const agent = {
      execute: vi.fn().mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000)),
      ),
    } as any;
    const resolver = makeResolver(agent);

    await executeStep(makeStep(), resolver, ctx, { timeoutMs: 50 });

    expect(writeSpy).not.toHaveBeenCalled();
  });
});
