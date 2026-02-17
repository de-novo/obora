import { describe, expect, it, vi } from "vitest";

import { OboraError, OboraErrorCode, OboraRuntime } from "../runtime.js";
import type { LoadedPlugin } from "../plugin-types.js";

function makeLoadedPlugin(name: string, type: "tool" | "agent" = "tool"): LoadedPlugin {
  return {
    descriptor: {
      packageName: `@test/${name}`,
      version: "1.0.0",
      packagePath: "/tmp",
      metadata: {
        type,
        exports: "./dist/index.js",
        name,
      },
    },
    module: { name, type },
  };
}

describe("OboraRuntime facade", () => {
  function withNoLLMEnv() {
    const keys = [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GOOGLE_API_KEY",
      "XAI_API_KEY",
    ] as const;
    const backup = new Map<string, string | undefined>();
    for (const key of keys) {
      backup.set(key, process.env[key]);
      delete process.env[key];
    }

    return () => {
      for (const [key, value] of backup.entries()) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    };
  }
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

  it("throws on duplicate step names in workflow definition", () => {
    const runtime = new OboraRuntime();

    expect(() =>
      runtime.define("dup-steps", {
        name: "dup-steps",
        steps: [{ name: "a" }, { name: "a" }],
      }),
    ).toThrow("Duplicate workflow step name");
  });

  it("runs steps in stub mode and emits warning when LLM is not configured", async () => {
    const restoreEnv = withNoLLMEnv();
    try {
      const runtime = new OboraRuntime();
      const warnings: string[] = [];
      runtime.on("warning", (event) => {
        const payload = event.data as { message?: string };
        if (payload.message) warnings.push(payload.message);
      });

      runtime.define("stub-flow", {
        name: "stub-flow",
        steps: [{ name: "step-a" }, { name: "step-b", depends_on: ["step-a"] }],
      });

      const handle = await runtime.run("stub-flow");
      const result = await handle.wait();

      expect(result.status).toBe("completed");
      expect(result.completedSteps).toEqual(["step-a", "step-b"]);
      expect(result.outputs["step-a"]).toBe("[stub] No LLM configured");
      expect(result.outputs["step-b"]).toBe("[stub] No LLM configured");
      expect(warnings[0]).toContain("No LLM configured");
    } finally {
      restoreEnv();
    }
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
      .registerPlugin(makeLoadedPlugin("demo-plugin", "tool"));

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onPluginLoad).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalled();

    unsubscribe();
    runtime.registerPlugin(makeLoadedPlugin("demo-plugin-2", "tool"));
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
      code: OboraErrorCode.SDK_EXECUTION_CANCELLED,
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
      code: OboraErrorCode.SDK_EXECUTION_CANCELLED,
      message: "test abort",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(OboraError);
    expect(errors[0].code).toBe(OboraErrorCode.SDK_EXECUTION_CANCELLED);
  });

  it("throws OboraError for unknown workflows", async () => {
    const runtime = new OboraRuntime();

    await expect(runtime.run("unknown")).rejects.toThrow("Workflow is not defined: unknown");
    await expect(runtime.run("unknown")).rejects.toMatchObject({
      name: "OboraError",
      code: OboraErrorCode.SDK_WORKFLOW_NOT_FOUND,
    });
  });

  it("supports abort signal cancellation", async () => {
    const restoreEnv = withNoLLMEnv();
    try {
      const runtime = new OboraRuntime();
      runtime.define("signal-cancel", {
        name: "signal-cancel",
        steps: [{ name: "s1" }, { name: "s2", depends_on: ["s1"] }],
      });

      const controller = new AbortController();
      controller.abort("signal abort");
      const handle = await runtime.run("signal-cancel", { signal: controller.signal });

      expect(handle.status).toBe("aborted");
      await expect(handle.wait()).rejects.toMatchObject({
        name: "OboraError",
        code: OboraErrorCode.SDK_EXECUTION_CANCELLED,
        message: "signal abort",
      });
    } finally {
      restoreEnv();
    }
  });
});
