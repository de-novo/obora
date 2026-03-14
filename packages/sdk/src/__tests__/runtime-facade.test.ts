import { describe, expect, it, vi } from "vitest";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
      "OBORA_LLM_PROVIDER",
      "OBORA_LLM_API_KEY",
      "OBORA_LLM_MODEL",
      "OBORA_LLM_BASE_URL",
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
      const runtime = new OboraRuntime({ config: {} });
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

  it("passes custom step tools from runtime config into StepExecutor", async () => {
    const runtime = new OboraRuntime({
      llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      stepTools: [
        {
          definition: {
            type: "function",
            function: {
              name: "echo_tool",
              description: "Echoes a provided value",
              parameters: {
                type: "object",
                properties: {
                  value: { type: "string" },
                },
                required: ["value"],
              },
            },
          },
          execute: async (args) => JSON.stringify({ echoed: args.value ?? null }),
        },
      ],
    });

    const adapterMock = {
      chatCompletion: vi.fn().mockImplementation(async ({ messages }) => {
        const toolResultMessage = messages.find(
          (message: { role: string }) => message.role === "tool",
        );
        if (!toolResultMessage) {
          return {
            model: "gpt-5",
            message: {
              role: "assistant",
              content: null,
              toolCalls: [
                {
                  id: "tool-echo-1",
                  type: "function",
                  function: {
                    name: "echo_tool",
                    arguments: JSON.stringify({ value: "hello-loop" }),
                  },
                },
              ],
            },
          };
        }

        return {
          model: "gpt-5",
          message: { role: "assistant", content: String(toolResultMessage.content) },
        };
      }),
    };

    vi.spyOn(
      runtime as unknown as {
        createLLMAdapter: () => Promise<typeof adapterMock>;
      },
      "createLLMAdapter",
    ).mockResolvedValue(adapterMock);

    runtime.define("custom-step-tool", {
      name: "custom-step-tool",
      steps: [
        {
          name: "run-tool",
          agent: "writer",
          input: { task: "Use echo_tool with the value hello-loop and return the tool result." },
        },
      ],
    });

    const handle = await runtime.run("custom-step-tool");
    const result = await handle.wait();

    expect(result.status).toBe("completed");
    expect(result.outputs["run-tool"]).toBe('{"echoed":"hello-loop"}');
  });

  it("smoke: runtime.run executes file_write tool call and creates docs/tool-smoke.md", async () => {
    const cwdBefore = process.cwd();
    const workspace = await mkdtemp(join(tmpdir(), "obora-runtime-tool-smoke-"));
    process.chdir(workspace);

    try {
      const runtime = new OboraRuntime({
        llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      });

      const adapterMock = {
        chatCompletion: vi.fn().mockImplementation(async ({ messages }) => {
          const toolResultMessage = messages.find(
            (message: { role: string }) => message.role === "tool",
          );
          if (!toolResultMessage) {
            return {
              model: "gpt-5",
              message: {
                role: "assistant",
                content: null,
                toolCalls: [
                  {
                    id: "tool-1",
                    type: "function",
                    function: {
                      name: "file_write",
                      arguments: JSON.stringify({
                        path: "docs/tool-smoke.md",
                        content: "# tool smoke\n",
                      }),
                    },
                  },
                ],
              },
              usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
            };
          }

          return {
            model: "gpt-5",
            message: { role: "assistant", content: "created" },
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          };
        }),
      };

      vi.spyOn(
        runtime as unknown as {
          createLLMAdapter: () => Promise<typeof adapterMock>;
        },
        "createLLMAdapter",
      ).mockResolvedValue(adapterMock);

      runtime.define("tool-smoke", {
        name: "tool-smoke",
        steps: [
          {
            name: "create-doc",
            agent: "writer",
            input: { task: "Create docs/tool-smoke.md using tool call" },
          },
        ],
      });

      const handle = await runtime.run("tool-smoke");
      const result = await handle.wait();

      expect(result.status).toBe("completed");
      expect(result.outputs["create-doc"]).toBe("created");
      expect(await readFile(join(workspace, "docs/tool-smoke.md"), "utf-8")).toBe("# tool smoke\n");
      expect(adapterMock.chatCompletion).toHaveBeenCalledTimes(2);
    } finally {
      process.chdir(cwdBefore);
    }
  });

  it("persists repair-loop summary into run metadata", async () => {
    const savedRuns: any[] = [];
    const storage = {
      async saveRun(record: any) { savedRuns.push(structuredClone(record)); },
      async getRun() { return null; },
      async listRuns() { return []; },
      async saveStep() { return; },
      async getSteps() { return []; },
      async saveArtifact(record: any) { return record; },
      async getArtifacts() { return []; },
      async deleteArtifact() { return; },
      async saveCheckpoint() { return; },
      async getLatestCheckpoint() { return null; },
      async saveCost() { return; },
      async getCosts() { return []; },
      async getRunCostSummary() { return { totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] }; },
      async saveAuditEvent() { return; },
      async getAuditTimeline() { return []; },
    };

    const runtime = new OboraRuntime({
      llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      audit: { enabled: true },
      persistence: { enabled: true, adapter: "custom", custom: { instance: storage as any } },
    });

    const auditTypes: string[] = [];
    runtime.on("workflow.validation_failed", (event) => {
      auditTypes.push(event.type);
    });
    runtime.on("workflow.validation_passed", (event) => {
      auditTypes.push(event.type);
    });
    runtime.on("workflow.repair_started", (event) => {
      auditTypes.push(event.type);
    });
    runtime.on("workflow.repair_completed", (event) => {
      auditTypes.push(event.type);
    });

    let callIndex = 0;
    const adapterMock = {
      chatCompletion: vi.fn().mockImplementation(async ({ messages }) => {
        callIndex += 1;
        const userPrompt = String(messages[1]?.content ?? "");

        if (callIndex === 1) {
          expect(userPrompt).not.toContain("Repair context:");
          return { message: { role: "assistant", content: "initial draft" } };
        }
        if (callIndex === 2) {
          return {
            message: {
              role: "assistant",
              content: JSON.stringify({
                passed: false,
                summary: "Fix TS1484 import type usage",
                failedChecks: [{ name: "typescript", message: "TS1484" }],
                signature: "ts1484",
              }),
            },
          };
        }
        if (callIndex === 3) {
          expect(userPrompt).toContain("Repair context:");
          expect(userPrompt).toContain("Fix TS1484 import type usage");
          return { message: { role: "assistant", content: "repaired draft" } };
        }
        return {
          message: {
            role: "assistant",
            content: JSON.stringify({
              passed: true,
              summary: "Validation passed",
              failedChecks: [],
              signature: "pass",
            }),
          },
        };
      }),
    };

    vi.spyOn(runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> }, "createLLMAdapter").mockResolvedValue(
      adapterMock,
    );

    runtime.define("validation-repair-loop", {
      name: "validation-repair-loop",
      steps: [
        {
          name: "build_or_repair",
          agent: "builder",
          config: { repair_loop: { enabled: true, validation_step: "validate", max_no_progress_iterations: 2, repeated_critical_issue_ceiling: 2 } },
          input: { task: "Build or repair the app" },
        },
        {
          name: "validate",
          agent: "validator",
          depends_on: ["build_or_repair"],
          config: { validation: { enabled: true, emit_structured_result: true } },
          on_fail: { goto: "build_or_repair", max_iterations: 3 },
          input: { task: "Validate the app and return structured JSON" },
        },
      ],
    });

    const handle = await runtime.run("validation-repair-loop");
    const result = await handle.wait();

    expect(result.status).toBe("completed");
    expect(result.outputs["build_or_repair"]).toBe("repaired draft");
    expect(result.outputs["validate"]).toMatchObject({ passed: true, summary: "Validation passed" });
    expect(adapterMock.chatCompletion).toHaveBeenCalledTimes(4);
    expect(auditTypes).toContain("workflow.validation_failed");
    expect(auditTypes).toContain("workflow.validation_passed");
    expect(auditTypes).toContain("workflow.repair_started");
    expect(auditTypes).toContain("workflow.repair_completed");

    const finalRun = savedRuns.at(-1);
    expect(finalRun?.metadata?.repairLoop).toMatchObject({
      validationFailed: 1,
      validationPassed: 1,
      repairStarted: 1,
      repairCompleted: 1,
      lastValidationSummary: "Validation passed",
      lastRepairStep: "build_or_repair",
      recentValidationFailures: [
        expect.objectContaining({
          stepName: "validate",
          summary: "Fix TS1484 import type usage",
        }),
      ],
    });
  });

  it("stops repair loop on repeated no-progress validation signatures", async () => {
    const runtime = new OboraRuntime({
      llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      audit: { enabled: true },
    });

    const auditTypes: string[] = [];
    runtime.on("workflow.repair_no_progress", (event) => {
      auditTypes.push(event.type);
    });

    const adapterMock = {
      chatCompletion: vi.fn().mockImplementation(async () => {
        const callIndex = adapterMock.chatCompletion.mock.calls.length;
        if (callIndex % 2 === 1) {
          return { message: { role: "assistant", content: `draft-${callIndex}` } };
        }
        return {
          message: {
            role: "assistant",
            content: JSON.stringify({
              passed: false,
              summary: "Still failing TS1484",
              failedChecks: [{ name: "typescript", message: "TS1484" }],
              signature: "same-ts1484",
            }),
          },
        };
      }),
    };

    vi.spyOn(runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> }, "createLLMAdapter").mockResolvedValue(
      adapterMock,
    );

    runtime.define("validation-no-progress", {
      name: "validation-no-progress",
      steps: [
        {
          name: "build_or_repair",
          agent: "builder",
          config: { repair_loop: { enabled: true, max_no_progress_iterations: 1 } },
          input: { task: "Build or repair the app" },
        },
        {
          name: "validate",
          agent: "validator",
          depends_on: ["build_or_repair"],
          config: { validation: { enabled: true, emit_structured_result: true } },
          on_fail: { goto: "build_or_repair", max_iterations: 5 },
          input: { task: "Validate the app and return structured JSON" },
        },
      ],
    });

    const handle = await runtime.run("validation-no-progress");
    await expect(handle.wait()).rejects.toThrow(/no progress/i);
    expect(auditTypes).toContain("workflow.repair_no_progress");
  });

  it("stops repair loop on repeated critical issue ceiling", async () => {
    const savedRuns: any[] = [];
    const storage = {
      async saveRun(record: any) { savedRuns.push(structuredClone(record)); },
      async getRun() { return null; },
      async listRuns() { return []; },
      async saveStep() { return; },
      async getSteps() { return []; },
      async saveArtifact(record: any) { return record; },
      async getArtifacts() { return []; },
      async deleteArtifact() { return; },
      async saveCheckpoint() { return; },
      async getLatestCheckpoint() { return null; },
      async saveCost() { return; },
      async getCosts() { return []; },
      async getRunCostSummary() { return { totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] }; },
      async saveAuditEvent() { return; },
      async getAuditTimeline() { return []; },
    };

    const runtime = new OboraRuntime({
      llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      audit: { enabled: true },
      persistence: { enabled: true, adapter: "custom", custom: { instance: storage as any } },
    });

    const adapterMock = {
      chatCompletion: vi.fn().mockImplementation(async () => {
        const callIndex = adapterMock.chatCompletion.mock.calls.length;
        if (callIndex % 2 === 1) {
          return { message: { role: "assistant", content: `draft-${callIndex}` } };
        }
        return {
          message: {
            role: "assistant",
            content: JSON.stringify({
              passed: false,
              summary: "Critical issue repeats",
              failedChecks: [{ name: "critical", message: "same blocker" }],
              signature: "same-critical-issue",
            }),
          },
        };
      }),
    };

    vi.spyOn(runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> }, "createLLMAdapter").mockResolvedValue(
      adapterMock,
    );

    runtime.define("validation-repeated-critical", {
      name: "validation-repeated-critical",
      steps: [
        {
          name: "build_or_repair",
          agent: "builder",
          config: { repair_loop: { enabled: true, repeated_critical_issue_ceiling: 1 } },
          input: { task: "Build or repair the app" },
        },
        {
          name: "validate",
          agent: "validator",
          depends_on: ["build_or_repair"],
          config: { validation: { enabled: true, emit_structured_result: true } },
          on_fail: { goto: "build_or_repair", max_iterations: 5 },
          input: { task: "Validate the app and return structured JSON" },
        },
      ],
    });

    const handle = await runtime.run("validation-repeated-critical");
    await expect(handle.wait()).rejects.toThrow(/repeated critical issue ceiling/i);
    const finalRun = savedRuns.at(-1);
    expect(finalRun?.metadata?.repairLoop).toMatchObject({
      repairNoProgress: 1,
      lastStopCategory: "repeated_critical_issue",
    });
  });

  it("emits warning when agent-specific provider is configured but cannot be resolved", async () => {
    const prevAnthropic = process.env.TEST_ANTHROPIC_KEY;
    const prevOpenAI = process.env.TEST_OPENAI_KEY;
    process.env.TEST_ANTHROPIC_KEY = "anthropic-key";
    delete process.env.TEST_OPENAI_KEY;

    try {
      const runtime = new OboraRuntime({
        llm: { provider: "anthropic", apiKey: "anthropic-key", model: "claude-opus-4-6" },
        config: {
          defaults: { provider: "anthropic" },
          providers: {
            anthropic: { authRef: "env:TEST_ANTHROPIC_KEY", defaultModel: "claude-opus-4-6" },
            openai: { authRef: "env:TEST_OPENAI_KEY", defaultModel: "gpt-5" },
          },
          agents: {
            architect: { provider: "openai", model: "gpt-5" },
          },
        },
      });

      const warnings: string[] = [];
      runtime.on("warning", (event) => {
        const payload = event.data as { message?: string };
        if (payload.message) warnings.push(payload.message);
      });

      const adapterMock = {
        chatCompletion: vi.fn().mockResolvedValue({ message: { role: "assistant", content: "ok" } }),
      };
      vi.spyOn(runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> }, "createLLMAdapter").mockResolvedValue(
        adapterMock,
      );

      runtime.define("agent-provider-fallback", {
        name: "agent-provider-fallback",
        steps: [{ name: "design", agent: "architect", input: { task: "Create architecture" } }],
      });

      const handle = await runtime.run("agent-provider-fallback");
      const result = await handle.wait();

      expect(result.status).toBe("completed");
      expect(warnings).toContain(
        "Agent 'architect' configured with provider 'openai' but API key not resolved. Falling back to default.",
      );
    } finally {
      if (prevAnthropic === undefined) {
        delete process.env.TEST_ANTHROPIC_KEY;
      } else {
        process.env.TEST_ANTHROPIC_KEY = prevAnthropic;
      }

      if (prevOpenAI === undefined) {
        delete process.env.TEST_OPENAI_KEY;
      } else {
        process.env.TEST_OPENAI_KEY = prevOpenAI;
      }
    }
  });

  it("does not reload config when runtime config object is already provided", async () => {
    const runtime = new OboraRuntime({
      config: {
        defaults: { provider: "anthropic" },
      },
      configPath: "/definitely/not/exist/config.yaml",
    });

    runtime.define("config-preloaded", { name: "config-preloaded", steps: [] });
    const handle = await runtime.run("config-preloaded");
    const result = await handle.wait();

    expect(result.status).toBe("completed");
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

  it("persists aborted status when execution is cancelled", async () => {
    const savedRuns: any[] = [];
    const storage = {
      async saveRun(record: any) { savedRuns.push(structuredClone(record)); },
      async getRun() { return null; },
      async listRuns() { return []; },
      async saveStep() { return; },
      async getSteps() { return []; },
      async saveArtifact(record: any) { return record; },
      async getArtifacts() { return []; },
      async deleteArtifact() { return; },
      async saveCheckpoint() { return; },
      async getLatestCheckpoint() { return null; },
      async saveCost() { return; },
      async getCosts() { return []; },
      async getRunCostSummary() { return { totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] }; },
      async saveAuditEvent() { return; },
      async getAuditTimeline() { return []; },
    };

    const runtime = new OboraRuntime({
      persistence: { enabled: true, adapter: "custom", custom: { instance: storage as any } },
    });
    runtime.define("cancel-persist", { name: "cancel-persist", steps: [] });

    const handle = await runtime.run("cancel-persist", { input: { value: 1 } });
    await handle.cancel("user abort");
    await expect(handle.wait()).rejects.toMatchObject({
      code: OboraErrorCode.SDK_EXECUTION_CANCELLED,
      message: "user abort",
    });

    const finalRun = savedRuns.at(-1);
    expect(finalRun?.status).toBe("aborted");
    expect(finalRun?.completedAt).toBeTruthy();
    expect(finalRun?.metadata?.errorCode).toBe(OboraErrorCode.SDK_EXECUTION_CANCELLED);
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
    expect(errors[0]!).toBeInstanceOf(OboraError);
    expect(errors[0]!.code).toBe(OboraErrorCode.SDK_EXECUTION_CANCELLED);
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

  it("keeps aborted status when cancel races with step completion", async () => {
    const savedRuns: any[] = [];
    const storage = {
      async saveRun(record: any) { savedRuns.push(structuredClone(record)); },
      async getRun() { return null; },
      async listRuns() { return []; },
      async saveStep() { return; },
      async getSteps() { return []; },
      async saveArtifact(record: any) { return record; },
      async getArtifacts() { return []; },
      async deleteArtifact() { return; },
      async saveCheckpoint() { return; },
      async getLatestCheckpoint() { return null; },
      async saveCost() { return; },
      async getCosts() { return []; },
      async getRunCostSummary() { return { totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] }; },
      async saveAuditEvent() { return; },
      async getAuditTimeline() { return []; },
    };

    const runtime = new OboraRuntime({
      llm: { provider: "test", apiKey: "test", model: "test" },
      persistence: { enabled: true, adapter: "custom", custom: { instance: storage as any } },
    });

    runtime.define("race-cancel", {
      name: "race-cancel",
      steps: [{ name: "s1", input: { task: "hello" } }],
    });

    runtime.registerAgent("writer", () => ({ role: "writer" }));

    const adapterMock = {
      chatCompletion: vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { message: { role: "assistant", content: "done" } };
      }),
    };

    vi.spyOn(runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> }, "createLLMAdapter").mockResolvedValue(adapterMock);

    const handle = await runtime.run("race-cancel");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await handle.cancel("manual abort");

    await expect(handle.wait()).rejects.toMatchObject({
      code: OboraErrorCode.SDK_EXECUTION_CANCELLED,
      message: "manual abort",
    });
    expect(handle.status).toBe("aborted");

    const finalRun = savedRuns.at(-1);
    expect(finalRun?.status).toBe("aborted");
    expect(finalRun?.completedAt).toBeTruthy();
    expect(finalRun?.metadata?.errorCode).toBe(OboraErrorCode.SDK_EXECUTION_CANCELLED);
  });

  it("marks run handle as suspended on budget exceed", async () => {
    const costs: any[] = [];
    const storage = {
      async saveRun() {}, async getRun() { return null; }, async listRuns() { return []; },
      async saveStep() {}, async getSteps() { return []; },
      async saveArtifact(record: any) { return record; }, async getArtifacts() { return []; }, async deleteArtifact() {},
      async saveCheckpoint() {}, async getLatestCheckpoint() { return null; },
      async saveCost(record: any) { costs.push(record); },
      async getCosts(runId: string, stepName?: string) { return costs.filter((c) => c.runId === runId && (!stepName || c.stepName === stepName)); },
      async getRunCostSummary(runId: string) {
        const rows = costs.filter((c) => c.runId === runId);
        return { totalTokens: rows.reduce((s, r) => s + r.totalTokens, 0), totalCostUsd: rows.reduce((s, r) => s + r.costUsd, 0), byStep: [], byModel: [] };
      },
      async saveAuditEvent() { return; },
      async getAuditTimeline() { return []; },
    };

    const runtime = new OboraRuntime({
      llm: { provider: "test", apiKey: "test", model: "gpt-4o" },
      persistence: { enabled: true, adapter: "custom", custom: { instance: storage as any } },
      config: {
        defaults: { provider: "test" },
        resources: {
          maxCostPerRun: 0.000001,
          onBudgetExceed: "block",
          pricing: [{ model: "gpt-4o", promptPer1kTokens: 1, completionPer1kTokens: 1 }],
        },
      },
    });
    runtime.define("budget-stop", { name: "budget-stop", steps: [{ name: "s1" }] });

    const adapterMock = {
      chatCompletion: vi.fn().mockResolvedValue({
        model: "gpt-4o",
        message: { role: "assistant", content: "ok" },
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      }),
    };
    vi.spyOn(runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> }, "createLLMAdapter").mockResolvedValue(adapterMock);

    const handle = await runtime.run("budget-stop");
    await expect(handle.wait()).rejects.toMatchObject({ code: OboraErrorCode.POLICY_RESOURCE_EXCEEDED });
    expect(handle.status).toBe("suspended");
  });

  it("provides run.cost() and step.cost() query APIs", async () => {
    const costs = [
      {
        id: "c1",
        runId: "run-cost-api",
        stepName: "draft",
        model: "gpt-4o",
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
        costUsd: 0.03,
        latencyMs: 10,
        createdAt: new Date().toISOString(),
      },
    ];

    const storage = {
      async getRun() { return null; },
      async listRuns() { return []; },
      async saveRun() { return; },
      async saveStep() { return; },
      async getSteps() { return []; },
      async saveArtifact(record: any) { return record; },
      async getArtifacts() { return []; },
      async deleteArtifact() { return; },
      async saveCheckpoint() { return; },
      async getLatestCheckpoint() { return null; },
      async saveCost() { return; },
      async getCosts(runId: string, stepName?: string) {
        return costs.filter((c) => c.runId === runId && (!stepName || c.stepName === stepName));
      },
      async getRunCostSummary(runId: string) {
        const rows = costs.filter((c) => c.runId === runId);
        return {
          totalTokens: rows.reduce((sum, r) => sum + r.totalTokens, 0),
          totalCostUsd: rows.reduce((sum, r) => sum + r.costUsd, 0),
          byStep: [{ stepName: "draft", tokens: 30, costUsd: 0.03 }],
          byModel: [{ model: "gpt-4o", tokens: 30, costUsd: 0.03 }],
        };
      },
      async saveAuditEvent() { return; },
      async getAuditTimeline() { return []; },
    };

    const runtime = new OboraRuntime({
      persistence: { enabled: true, adapter: "custom", custom: { instance: storage as any } },
    });

    const runCost = await runtime.runs.cost("run-cost-api");
    const stepCost = await runtime.step.cost("run-cost-api", "draft");

    expect(runCost.totalTokens).toBe(30);
    expect(stepCost.tokens).toBe(30);
    expect(stepCost.records).toHaveLength(1);
  });

  it("provides run.auditReplay(step?) API", async () => {
    const timeline = [{ id: "a1", runId: "run-a", stepName: "review", timestamp: new Date().toISOString(), category: "consensus", action: "consensus_vote", actor: "agent-a", detail: {} }];

    const storage = {
      async getRun(runId: string) { return runId === "run-a" ? { id: runId, workflowName: "wf", status: "completed", input: {}, startedAt: new Date().toISOString() } : null; },
      async listRuns() { return []; },
      async saveRun() { return; },
      async saveStep() { return; },
      async getSteps() { return []; },
      async saveArtifact(record: any) { return record; },
      async getArtifacts() { return []; },
      async deleteArtifact() { return; },
      async saveCheckpoint() { return; },
      async getLatestCheckpoint() { return null; },
      async saveCost() { return; },
      async getCosts() { return []; },
      async getRunCostSummary() { return { totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] }; },
      async saveAuditEvent() { return; },
      async getAuditTimeline(runId: string, stepName?: string) { return timeline.filter((e) => e.runId === runId && (!stepName || e.stepName === stepName)); },
    };

    const runtime = new OboraRuntime({ persistence: { enabled: true, adapter: "custom", custom: { instance: storage as any } } });
    const run = await runtime.getRun("run-a");
    const events = await run?.auditReplay("review");
    const events2 = await runtime.runs.auditReplay("run-a", "review");

    expect(events).toHaveLength(1);
    expect(events2).toHaveLength(1);
  });
});
