import { describe, expect, it, vi } from "vitest";

import { OboraError, OboraRuntime } from "../runtime.js";

describe("OboraRuntime facade", () => {
  it("stores a workflow definition and runs it with a RunHandle", async () => {
    const runtime = new OboraRuntime({ policyPath: "./policy.yaml" });
    runtime.define("demo", "name: demo\nsteps: []");

    const handle = runtime.run("demo", { input: { topic: "runtime facade" } });

    expect(handle.executionId).toBeTypeOf("string");
    expect(handle.status === "queued" || handle.status === "running").toBe(true);

    const result = await handle.wait();
    expect(result.workflowName).toBe("demo");
    expect(result.input).toEqual({ topic: "runtime facade" });
    expect(result.status).toBe("completed");
    expect(handle.status).toBe("completed");
  });

  it("supports agent/tool/pattern/plugin registration and event subscriptions", async () => {
    const sink = vi.fn();
    const runtime = new OboraRuntime({
      audit: {
        enabled: true,
        sink,
      },
    });

    const onPluginLoad = vi.fn();
    const unsubscribe = runtime.on("plugin_load", onPluginLoad);

    runtime
      .registerAgent("writer", () => ({ id: "writer" }))
      .registerTool("format", async (params) => params)
      .registerPattern({
        name: "custom-pattern",
        execute: async () => ({ success: true, output: "ok" }),
      })
      .registerPlugin({
        name: "demo-plugin",
        version: "0.1.0",
        type: "tool",
      });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onPluginLoad).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalled();

    unsubscribe();
    runtime.registerPlugin({
      name: "demo-plugin-2",
      version: "0.1.0",
      type: "tool",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onPluginLoad).toHaveBeenCalledTimes(1);
  });

  it("cancels an execution via RunHandle.cancel", async () => {
    const runtime = new OboraRuntime();
    runtime.define("cancel-me", "name: cancel-me\nsteps: []");

    const handle = runtime.run("cancel-me", { input: { value: 1 } });
    await handle.cancel("user abort");

    expect(handle.status).toBe("aborted");
    await expect(handle.wait()).rejects.toMatchObject({
      name: "OboraError",
      code: "SDK_EXECUTION_CANCELLED",
      message: "user abort",
    });
  });

  it("throws OboraError for unknown workflows", () => {
    const runtime = new OboraRuntime();

    expect(() => runtime.run("unknown")).toThrow("Workflow is not defined: unknown");
    try {
      runtime.run("unknown");
    } catch (error) {
      expect(error).toBeInstanceOf(OboraError);
      expect((error as OboraError).code).toBe("SDK_WORKFLOW_NOT_FOUND");
    }
  });

  it("supports abort signal cancellation", async () => {
    const runtime = new OboraRuntime();
    runtime.define("signal-cancel", "name: signal-cancel\nsteps: []");

    const controller = new AbortController();
    const handle = runtime.run("signal-cancel", { signal: controller.signal });
    controller.abort("signal abort");

    expect(handle.status).toBe("aborted");
    await expect(handle.wait()).rejects.toMatchObject({
      name: "OboraError",
      code: "SDK_EXECUTION_CANCELLED",
      message: "signal abort",
    });
  });
});
