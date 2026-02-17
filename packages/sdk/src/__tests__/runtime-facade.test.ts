import { describe, expect, it, vi } from "vitest";

import { OboraError, OboraRuntime } from "../runtime.js";

describe("OboraRuntime facade", () => {
  it("stores a workflow definition and runs it with a RunHandle", async () => {
    const runtime = new OboraRuntime({ policyPath: "./policy.yaml" });
    runtime.define("demo", { name: "demo", steps: [] });

    const handle = await runtime.run("demo", { input: { topic: "runtime facade" } });

    expect(handle.executionId).toBeTypeOf("string");
    expect(handle.status === "queued" || handle.status === "running").toBe(true);

    const result = await handle.wait();
    expect(result.workflowName).toBe("demo");
    expect(result.input).toEqual({ topic: "runtime facade" });
    expect(result.status).toBe("completed");
    expect(handle.status).toBe("completed");
  });

  it("throws OboraError when define receives invalid workflow", () => {
    const runtime = new OboraRuntime();

    expect(() => runtime.define("invalid", { steps: [] } as never)).toThrowError(OboraError);
    expect(() => runtime.define("invalid", { steps: [] } as never)).toThrowError(
      "Workflow must have a name",
    );
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
    runtime.define("cancel-me", { name: "cancel-me", steps: [] });

    const handle = await runtime.run("cancel-me", { input: { value: 1 } });
    await handle.cancel("user abort");

    expect(handle.status).toBe("aborted");
    await expect(handle.wait()).rejects.toMatchObject({
      name: "OboraError",
      code: "SDK_EXECUTION_CANCELLED",
      message: "user abort",
    });
  });

  it("onError receives OboraError on execution cancel", async () => {
    const runtime = new OboraRuntime();
    const errors: OboraError[] = [];

    runtime.onError((err) => errors.push(err));
    runtime.define("err-test", { name: "err-test", steps: [] });

    const handle = await runtime.run("err-test");
    await handle.cancel("test abort");
    await expect(handle.wait()).rejects.toMatchObject({
      name: "OboraError",
      code: "SDK_EXECUTION_CANCELLED",
      message: "test abort",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(OboraError);
    expect(errors[0].code).toBe("SDK_EXECUTION_CANCELLED");
  });

  it("throws OboraError for unknown workflows", async () => {
    const runtime = new OboraRuntime();

    await expect(runtime.run("unknown")).rejects.toThrow("Workflow is not defined: unknown");
    await expect(runtime.run("unknown")).rejects.toMatchObject({
      name: "OboraError",
      code: "SDK_WORKFLOW_NOT_FOUND",
    });
  });

  it("supports abort signal cancellation", async () => {
    const runtime = new OboraRuntime();
    runtime.define("signal-cancel", { name: "signal-cancel", steps: [] });

    const controller = new AbortController();
    const handle = await runtime.run("signal-cancel", { signal: controller.signal });
    controller.abort("signal abort");

    expect(handle.status).toBe("aborted");
    await expect(handle.wait()).rejects.toMatchObject({
      name: "OboraError",
      code: "SDK_EXECUTION_CANCELLED",
      message: "signal abort",
    });
  });
});
