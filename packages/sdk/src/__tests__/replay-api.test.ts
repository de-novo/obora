import { describe, expect, it, vi } from "vitest";

import { OboraError, OboraErrorCode, OboraRuntime } from "../runtime.js";

function makeIsolatedRuntime() {
  const runtime = new OboraRuntime({
    config: {},
    llm: { provider: "mock", apiKey: "test-key", model: "mock-model" },
  });
  // Inject mock adapter so steps can execute without real LLM
  (runtime as unknown as { createLLMAdapter: (cfg: unknown) => Promise<unknown> }).createLLMAdapter = async () => ({
    async chatCompletion() {
      return {
        model: "mock",
        message: { role: "assistant", content: "mock output" },
      };
    },
  });
  return runtime;
}

describe("M3-05 Replay/Re-execution SDK API", () => {
  it("throws OboraError with AUDIT_REPLAY_NOT_FOUND for unknown executionId", async () => {
    const runtime = makeIsolatedRuntime();

    await expect(runtime.simulateReplay("missing-exec-id")).rejects.toMatchObject({
      name: "OboraError",
      code: OboraErrorCode.AUDIT_REPLAY_NOT_FOUND,
      message: "Execution not found: missing-exec-id",
    });
  });

  it("returns ReExecutionResult with success=true for completed execution", async () => {
    const runtime = makeIsolatedRuntime();
    runtime.define("demo", { name: "demo", steps: [{ name: "s1" }, { name: "s2" }] });

    const handle = await runtime.run("demo");
    const execution = await handle.wait();

    const replay = await runtime.simulateReplay(execution.id);
    expect(replay.success).toBe(true);
    expect(replay.originalExecutionId).toBe(execution.id);
    expect(replay.stepResults).toHaveLength(2);
  });

  it("supports mode=from_checkpoint and splits steps correctly", async () => {
    const runtime = makeIsolatedRuntime();
    runtime.define("cp", {
      name: "cp",
      steps: [{ name: "a" }, { name: "b" }, { name: "c" }],
    });

    const handle = await runtime.run("cp");
    const execution = await handle.wait();

    const replay = await runtime.simulateReplay(execution.id, {
      mode: "from_checkpoint",
      startFromStep: "b",
    });

    expect(replay.plan.mode).toBe("from_checkpoint");
    expect(replay.plan.originalWorkflow).toBe("cp");
    expect(replay.plan.stepsToSkip).toEqual(["a"]);
    expect(replay.plan.stepsToRerun).toEqual(["b", "c"]);
    expect(replay.plan.startFromStep).toBe("b");
    expect(replay.plan.createdAt).toBeInstanceOf(Date);
  });

  it("populates restoredState from skipped steps in from_checkpoint mode", async () => {
    const runtime = makeIsolatedRuntime();
    runtime.define("restore", {
      name: "restore",
      steps: [{ name: "a" }, { name: "b" }, { name: "c" }],
    });

    const handle = await runtime.run("restore");
    const execution = await handle.wait();

    const storedExecution = (runtime as unknown as {
      executions: Map<string, { outputs: Record<string, unknown> }>;
    }).executions.get(execution.id);

    expect(storedExecution).toBeDefined();
    storedExecution!.outputs = {
      a: { value: "from-a" },
      b: { value: "from-b" },
      c: { value: "from-c" },
    };

    const replay = await runtime.simulateReplay(execution.id, {
      mode: "from_checkpoint",
      startFromStep: "c",
    });

    expect(replay.plan.stepsToSkip).toEqual(["a", "b"]);
    expect(replay.plan.restoredState).toEqual({
      a: { value: "from-a" },
      b: { value: "from-b" },
    });
  });

  it("throws AUDIT_REPLAY_NOT_FOUND when checkpoint step is not found", async () => {
    const runtime = makeIsolatedRuntime();
    runtime.define("cp-missing", {
      name: "cp-missing",
      steps: [{ name: "a" }, { name: "b" }],
    });

    const handle = await runtime.run("cp-missing");
    const execution = await handle.wait();

    await expect(
      runtime.simulateReplay(execution.id, {
        mode: "from_checkpoint",
        startFromStep: "z",
      }),
    ).rejects.toMatchObject({
      name: "OboraError",
      code: OboraErrorCode.AUDIT_REPLAY_NOT_FOUND,
      message: "Checkpoint step not found: z",
    });
  });

  it("adds non-determinism warnings to plan when detectNonDeterminism=true", async () => {
    const runtime = makeIsolatedRuntime();
    runtime.define("nd", {
      name: "nd",
      steps: [{ name: "s1" }, { name: "s2" }],
    });

    const handle = await runtime.run("nd");
    const execution = await handle.wait();

    const replay = await runtime.simulateReplay(execution.id, { detectNonDeterminism: true });

    expect(replay.plan.nonDeterminismWarnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "state_external",
          description: "Non-determinism detection is limited in simulation mode",
          severity: "info",
        }),
      ]),
    );
  });

  it("emits reexecution lifecycle events", async () => {
    const runtime = makeIsolatedRuntime();
    runtime.define("events", { name: "events", steps: [{ name: "x" }, { name: "y" }] });

    const start = vi.fn();
    const stepStart = vi.fn();
    const stepEnd = vi.fn();
    const end = vi.fn();

    runtime.on("reexecution_start", start);
    runtime.on("reexecution_step_start", stepStart);
    runtime.on("reexecution_step_end", stepEnd);
    runtime.on("reexecution_end", end);

    const handle = await runtime.run("events");
    const execution = await handle.wait();
    await runtime.simulateReplay(execution.id);

    expect(start).toHaveBeenCalledTimes(1);
    expect(stepStart).toHaveBeenCalledTimes(2);
    expect(stepEnd).toHaveBeenCalledTimes(2);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("calls onStepComplete for each replayed step", async () => {
    const runtime = makeIsolatedRuntime();
    runtime.define("callback", {
      name: "callback",
      steps: [{ name: "step-1" }, { name: "step-2" }, { name: "step-3" }],
    });

    const callback = vi.fn();
    const handle = await runtime.run("callback");
    const execution = await handle.wait();

    await runtime.simulateReplay(execution.id, { onStepComplete: callback });

    expect(callback).toHaveBeenCalledTimes(3);
    expect(callback).toHaveBeenNthCalledWith(
      1,
      "step-1",
      expect.objectContaining({ stepName: "step-1", status: "completed" }),
    );
  });

  it("uses dryRun=true by default", async () => {
    const sink = vi.fn();
    const runtime = new OboraRuntime({
      audit: { enabled: true, sink },
      config: {},
      llm: { provider: "mock", apiKey: "test-key", model: "mock-model" },
    });
    // Inject mock adapter so steps can execute without real LLM
    (runtime as unknown as { createLLMAdapter: (cfg: unknown) => Promise<unknown> }).createLLMAdapter = async () => ({
      async chatCompletion() {
        return {
          model: "mock",
          message: { role: "assistant", content: "mock output" },
        };
      },
    });
    runtime.define("dry", { name: "dry", steps: [{ name: "s1" }] });

    const handle = await runtime.run("dry");
    const execution = await handle.wait();
    await runtime.simulateReplay(execution.id);

    const replayStartEvent = sink.mock.calls
      .map((call) => call[0])
      .find((event) => event.type === "reexecution_start");

    expect(replayStartEvent).toBeDefined();
    expect(replayStartEvent.data).toMatchObject({
      originalExecutionId: execution.id,
      dryRun: true,
    });
  });

  it("throws OboraError instance for unknown executionId", async () => {
    const runtime = makeIsolatedRuntime();

    await expect(runtime.simulateReplay("unknown")).rejects.toBeInstanceOf(OboraError);
  });
});
