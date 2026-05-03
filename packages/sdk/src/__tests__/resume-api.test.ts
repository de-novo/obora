import { describe, expect, it } from "vitest";

import { OboraError, OboraRuntime } from "../runtime.js";

function makeIsolatedRuntime() {
  return new OboraRuntime({
    persistence: {
      enabled: true,
      adapter: "sqlite",
      sqlite: { path: ":memory:" },
    },
  });
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
