import { describe, expect, it } from "vitest";

import { OboraError, OboraRuntime } from "../runtime.js";

function makeIsolatedRuntime() {
  const runtime = new OboraRuntime({
    persistence: {
      enabled: true,
      adapter: "sqlite",
      sqlite: { path: ":memory:" },
    },
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

describe("M3-05 Resume SDK API", () => {
  it("throws executionNotFound for unknown runId", async () => {
    const runtime = makeIsolatedRuntime();
    runtime.define("demo", { name: "demo", steps: [{ name: "s1" }] });

    await expect(runtime.resume("missing-run-id")).rejects.toMatchObject({
      name: "OboraError",
      code: "SDK_8007",
      message: "Execution not found: missing-run-id",
    });
  });

  it("throws checkpointNotFound when no checkpoint exists", async () => {
    const runtime = makeIsolatedRuntime();
    runtime.define("demo", { name: "demo", steps: [{ name: "s1" }] });

    const handle = await runtime.run("demo");
    const execution = await handle.wait();

    await expect(runtime.resume(execution.id)).rejects.toMatchObject({
      name: "OboraError",
      code: "SDK_CHECKPOINT_NOT_FOUND",
      message: `No checkpoint found for run: ${execution.id}`,
    });
  });

  it("throws checkpointNotFound when run has no checkpoint", async () => {
    const runtime = makeIsolatedRuntime();
    runtime.define("demo", { name: "demo", steps: [{ name: "s1" }] });

    const handle = await runtime.run("demo");
    const execution = await handle.wait();

    await expect(runtime.resume(execution.id)).rejects.toMatchObject({
      name: "OboraError",
      code: "SDK_CHECKPOINT_NOT_FOUND",
    });
  });

  it("throws OboraError for any resume failure", async () => {
    const runtime = makeIsolatedRuntime();
    runtime.define("demo", { name: "demo", steps: [{ name: "s1" }] });

    const handle = await runtime.run("demo");
    const execution = await handle.wait();

    await expect(runtime.resume(execution.id, { driftPolicy: "reject" })).rejects.toBeInstanceOf(
      OboraError,
    );
  });
});
