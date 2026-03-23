import { describe, expect, it, vi } from "vitest";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { OboraError, OboraErrorCode, OboraRuntime } from "../runtime.js";
import type { LoadedPlugin } from "../plugin-types.js";
import {
  mergeSharedMemorySnapshots,
  type MemoryScope,
  type SharedMemorySnapshot,
  type SharedMemoryStore,
} from "../shared-memory/store.js";

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

function appendHookCommand(label: string, stdout?: string): string {
  const stdoutStatement = stdout ? `process.stdout.write('${stdout}');` : "";
  return `node -e \"const fs=require('node:fs');fs.appendFileSync('hook-order.log','${label}\\n');${stdoutStatement}\"`;
}

function createInMemorySharedMemoryStore(): SharedMemoryStore {
  const data = new Map<string, SharedMemorySnapshot>();

  return {
    async load(scope: MemoryScope) {
      return data.get(`${scope.level}:${scope.key}`) ?? null;
    },
    async save(scope: MemoryScope, snapshot: SharedMemorySnapshot) {
      data.set(`${scope.level}:${scope.key}`, snapshot);
    },
    async merge(scope: MemoryScope, snapshot: SharedMemorySnapshot) {
      const existing = await this.load(scope);
      await this.save(scope, mergeSharedMemorySnapshots(existing, snapshot));
    },
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
      "Workflow must have a name"
    );
  });

  it("throws on duplicate step names in workflow definition", () => {
    const runtime = new OboraRuntime();

    expect(() =>
      runtime.define("dup-steps", {
        name: "dup-steps",
        steps: [{ name: "a" }, { name: "a" }],
      })
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
          (message: { role: string }) => message.role === "tool"
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
      "createLLMAdapter"
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
            (message: { role: string }) => message.role === "tool"
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
        "createLLMAdapter"
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

  it("runs workflow hooks in lifecycle order", async () => {
    const cwdBefore = process.cwd();
    const workspace = await mkdtemp(join(tmpdir(), "obora-runtime-hooks-"));
    process.chdir(workspace);

    try {
      const runtime = new OboraRuntime({
        llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      });

      const validatePrompts: string[] = [];
      let validationAttempt = 0;
      const adapterMock = {
        chatCompletion: vi.fn().mockImplementation(async ({ messages }) => {
          const userPrompt = String(
            messages.find((message: { role: string }) => message.role === "user")?.content ?? ""
          );

          if (userPrompt.includes("Step: implement")) {
            return {
              model: "gpt-5",
              message: { role: "assistant", content: "implemented" },
              usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
            };
          }

          if (userPrompt.includes("Step: validate")) {
            validatePrompts.push(userPrompt);
            validationAttempt += 1;
            return {
              model: "gpt-5",
              message: {
                role: "assistant",
                content: JSON.stringify({
                  passed: validationAttempt > 1,
                  summary: validationAttempt > 1 ? "passed" : "failed",
                  failedChecks:
                    validationAttempt > 1 ? [] : [{ name: "tests", message: "still failing" }],
                  signature: validationAttempt > 1 ? "pass" : "fail",
                }),
              },
              usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
            };
          }

          throw new Error(`Unexpected prompt: ${userPrompt}`);
        }),
      };

      vi.spyOn(
        runtime as unknown as {
          createLLMAdapter: () => Promise<typeof adapterMock>;
        },
        "createLLMAdapter"
      ).mockResolvedValue(adapterMock);

      runtime.define("hook-order", {
        name: "hook-order",
        hooks: {
          pre_step: { shell: appendHookCommand("global-pre-step") },
          post_step: { shell: appendHookCommand("global-post-step") },
          pre_validation: { shell: appendHookCommand("global-pre-validation", "validator-pre") },
          post_cycle: { shell: appendHookCommand("global-post-cycle") },
        },
        steps: [
          {
            name: "implement",
            agent: "builder",
            input: { task: "Implement the change." },
          },
          {
            name: "validate",
            agent: "validator",
            depends_on: ["implement"],
            hooks: {
              post_step: { shell: appendHookCommand("step-post-step") },
            },
            config: {
              validation: {
                enabled: true,
                emit_structured_result: true,
              },
            },
            on_fail: {
              goto: "implement",
              max_iterations: 2,
              escalate_on_exhaust: "fail",
            },
            input: { task: "Validate the change." },
          },
        ],
      });

      const handle = await runtime.run("hook-order");
      const result = await handle.wait();

      expect(result.status).toBe("completed");
      expect(validatePrompts).toHaveLength(2);
      expect(validatePrompts[0]).toContain("validator-pre");
      expect(validatePrompts[1]).toContain("validator-pre");

      const hookOrder = (await readFile(join(workspace, "hook-order.log"), "utf-8"))
        .trim()
        .split("\n");
      expect(hookOrder).toEqual([
        "global-pre-step",
        "global-post-step",
        "global-pre-step",
        "global-pre-validation",
        "step-post-step",
        "global-post-cycle",
        "global-pre-step",
        "global-post-step",
        "global-pre-step",
        "global-pre-validation",
        "step-post-step",
      ]);
    } finally {
      process.chdir(cwdBefore);
    }
  });

  it("persists repair-loop summary into run metadata", async () => {
    const savedRuns: any[] = [];
    const storage = {
      async saveRun(record: any) {
        savedRuns.push(structuredClone(record));
      },
      async getRun() {
        return null;
      },
      async listRuns() {
        return [];
      },
      async saveStep() {
        return;
      },
      async getSteps() {
        return [];
      },
      async saveArtifact(record: any) {
        return record;
      },
      async getArtifacts() {
        return [];
      },
      async deleteArtifact() {
        return;
      },
      async saveCheckpoint() {
        return;
      },
      async getLatestCheckpoint() {
        return null;
      },
      async saveCost() {
        return;
      },
      async getCosts() {
        return [];
      },
      async getRunCostSummary() {
        return { totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] };
      },
      async saveAuditEvent() {
        return;
      },
      async getAuditTimeline() {
        return [];
      },
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

    vi.spyOn(
      runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> },
      "createLLMAdapter"
    ).mockResolvedValue(adapterMock);

    runtime.define("validation-repair-loop", {
      name: "validation-repair-loop",
      steps: [
        {
          name: "build_or_repair",
          agent: "builder",
          config: {
            repair_loop: {
              enabled: true,
              validation_step: "validate",
              max_no_progress_iterations: 2,
              repeated_critical_issue_ceiling: 2,
            },
          },
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
    expect(result.outputs["validate"]).toMatchObject({
      passed: true,
      summary: "Validation passed",
    });
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

  it("injects reflector hints into later repair attempts after repeated failures", async () => {
    const runtime = new OboraRuntime({
      llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      audit: { enabled: true },
    });

    const repairEvents: Array<{ attempt?: number; reflectorHint?: string }> = [];
    runtime.on("workflow.repair_started", (event) => {
      const data = event.data as { attempt?: number; reflectorHint?: string } | undefined;
      repairEvents.push({ attempt: data?.attempt, reflectorHint: data?.reflectorHint });
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
                summary: "backup restore logic failed in CLI path",
                failedChecks: [{ name: "implementation_bug: backup", message: "backup restore path broken" }],
                signature: "backup-cli-1",
              }),
            },
          };
        }
        if (callIndex === 3) {
          expect(userPrompt).toContain("Repair context:");
          expect(userPrompt).toContain("Reflector analysis:");
          expect(userPrompt).toContain("implementation_bug");
          return { message: { role: "assistant", content: "repair attempt two" } };
        }
        if (callIndex === 4) {
          return {
            message: {
              role: "assistant",
              content: JSON.stringify({
                passed: false,
                summary: "backup restore logic still failing in CLI path",
                failedChecks: [{ name: "implementation_bug: restore", message: "backup restore path still broken" }],
                signature: "backup-cli-2",
              }),
            },
          };
        }
        if (callIndex === 5) {
          expect(userPrompt).toContain("Repair context:");
          expect(userPrompt).toContain("Reflector analysis:");
          expect(userPrompt.toLowerCase()).toContain("backup");
          return { message: { role: "assistant", content: "repair attempt three" } };
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

    vi.spyOn(
      runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> },
      "createLLMAdapter"
    ).mockResolvedValue(adapterMock);

    runtime.define("validation-repair-reflector", {
      name: "validation-repair-reflector",
      steps: [
        {
          name: "build_or_repair",
          agent: "builder",
          config: {
            repair_loop: {
              enabled: true,
              validation_step: "validate",
              max_no_progress_iterations: 4,
              repeated_critical_issue_ceiling: 4,
            },
          },
          input: { task: "Build or repair the app" },
        },
        {
          name: "validate",
          agent: "validator",
          depends_on: ["build_or_repair"],
          config: { validation: { enabled: true, emit_structured_result: true } },
          on_fail: { goto: "build_or_repair", max_iterations: 4 },
          input: { task: "Validate the app and return structured JSON" },
        },
      ],
    });

    const handle = await runtime.run("validation-repair-reflector");
    const result = await handle.wait();

    expect(result.status).toBe("completed");
    expect(result.outputs["build_or_repair"]).toBe("repair attempt three");
    expect(adapterMock.chatCompletion).toHaveBeenCalledTimes(6);
    expect(repairEvents).toHaveLength(2);
    expect(repairEvents[0]?.attempt).toBe(2);
    expect(repairEvents[0]?.reflectorHint).toBeDefined();
    expect(repairEvents[0]?.reflectorHint).toContain("implementation_bug");
    expect(repairEvents[1]?.attempt).toBe(3);
    expect(repairEvents[1]?.reflectorHint).toBeDefined();
    expect(repairEvents[1]?.reflectorHint?.toLowerCase()).toContain("backup");
  });

  it("aborts repair loop when reflector abort action matches", async () => {
    const runtime = new OboraRuntime({
      llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      audit: { enabled: true },
    });

    let callIndex = 0;
    const adapterMock = {
      chatCompletion: vi.fn().mockImplementation(async () => {
        callIndex += 1;
        if (callIndex === 1) {
          return { message: { role: "assistant", content: "initial draft" } };
        }
        return {
          message: {
            role: "assistant",
            content: JSON.stringify({
              passed: false,
              summary: "backup restore logic failed",
              failedChecks: [{ name: "implementation_bug: backup", message: "backup restore path broken" }],
              signature: "backup-fail-1",
            }),
          },
        };
      }),
    };

    vi.spyOn(
      runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> },
      "createLLMAdapter"
    ).mockResolvedValue(adapterMock);

    runtime.define("validation-repair-reflector-abort", {
      name: "validation-repair-reflector-abort",
      reflector: {
        rules: [
          {
            name: "abort_on_backup",
            when: { keywords_include: ["backup"], min_failures: 1 },
            actions: [{ type: "abort", reason: "reflector requested abort on backup failures" }],
          },
        ],
      },
      steps: [
        {
          name: "build_or_repair",
          agent: "builder",
          config: {
            repair_loop: {
              enabled: true,
              validation_step: "validate",
              max_no_progress_iterations: 4,
              repeated_critical_issue_ceiling: 4,
            },
          },
          input: { task: "Build or repair the app" },
        },
        {
          name: "validate",
          agent: "validator",
          depends_on: ["build_or_repair"],
          config: { validation: { enabled: true, emit_structured_result: true } },
          on_fail: { goto: "build_or_repair", max_iterations: 4 },
          input: { task: "Validate the app and return structured JSON" },
        },
      ],
    });

    const handle = await runtime.run("validation-repair-reflector-abort");
    await expect(handle.wait()).rejects.toThrow(/reflector requested abort/i);
    expect(adapterMock.chatCompletion).toHaveBeenCalledTimes(2);
  });

  it("persists shared memory and injects it into the next execution prompt", async () => {
    const store = createInMemorySharedMemoryStore();

    // Run 1 — produces a validation failure fact that gets persisted
    const runtime1 = new OboraRuntime({
      llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      sharedMemory: {
        enabled: true,
        adapter: "custom",
        custom: { instance: store },
        file: { projectKey: "test-project", scopes: ["project"] },
      },
    });

    let run1CallIndex = 0;
    const adapter1 = {
      chatCompletion: vi.fn().mockImplementation(async () => {
        run1CallIndex += 1;
        if (run1CallIndex === 1) {
          return { message: { role: "assistant", content: "build v1" } };
        }
        return {
          message: {
            role: "assistant",
            content: JSON.stringify({
              passed: true,
              summary: "All passed",
              failedChecks: [],
              signature: "pass",
            }),
          },
        };
      }),
    };

    vi.spyOn(
      runtime1 as unknown as { createLLMAdapter: () => Promise<typeof adapter1> },
      "createLLMAdapter"
    ).mockResolvedValue(adapter1);

    runtime1.define("shared-mem-run1", {
      name: "shared-mem-run1",
      sharedMemory: { enabled: true, projectKey: "test-project", scopes: ["project"] },
      steps: [
        { name: "build", agent: "builder", input: { task: "Build app" } },
        {
          name: "validate",
          agent: "validator",
          depends_on: ["build"],
          config: { validation: { enabled: true, emit_structured_result: true } },
          input: { task: "Validate" },
        },
      ],
    });

    const handle1 = await runtime1.run("shared-mem-run1");
    await handle1.wait();

    // Verify something was saved
    const saved = await store.load({ level: "project", key: "test-project" });
    expect(saved).not.toBeNull();

    // Run 2 — should see shared memory in prompt
    const runtime2 = new OboraRuntime({
      llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      sharedMemory: {
        enabled: true,
        adapter: "custom",
        custom: { instance: store },
        file: { projectKey: "test-project", scopes: ["project"] },
      },
    });

    const adapter2 = {
      chatCompletion: vi.fn().mockImplementation(async () => {
        return { message: { role: "assistant", content: "build v2" } };
      }),
    };

    vi.spyOn(
      runtime2 as unknown as { createLLMAdapter: () => Promise<typeof adapter2> },
      "createLLMAdapter"
    ).mockResolvedValue(adapter2);

    runtime2.define("shared-mem-run2", {
      name: "shared-mem-run2",
      sharedMemory: { enabled: true, projectKey: "test-project", scopes: ["project"] },
      steps: [{ name: "build", agent: "builder", input: { task: "Build app v2" } }],
    });

    const handle2 = await runtime2.run("shared-mem-run2");
    await handle2.wait();

    // The second run's prompt should contain shared memory context
    const call = adapter2.chatCompletion.mock.calls[0]?.[0];
    const userPrompt = String(call?.messages?.[1]?.content ?? "");
    expect(userPrompt).toContain("Shared memory context:");
    expect(userPrompt).toContain("test-project");
  });

  it("merges runtime and config shared-memory settings instead of dropping nested file config", async () => {
    const store = createInMemorySharedMemoryStore();

    const runtime = new OboraRuntime({
      llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      config: {
        sharedMemory: {
          enabled: true,
          file: { projectKey: "config-project", scopes: ["project"] },
        },
      },
      sharedMemory: {
        enabled: true,
        adapter: "custom",
        custom: { instance: store },
      },
    });

    const adapter = {
      chatCompletion: vi.fn().mockImplementation(async () => {
        return { message: { role: "assistant", content: "done" } };
      }),
    };

    vi.spyOn(
      runtime as unknown as { createLLMAdapter: () => Promise<typeof adapter> },
      "createLLMAdapter"
    ).mockResolvedValue(adapter);

    runtime.define("shared-mem-config-merge", {
      name: "shared-mem-config-merge",
      steps: [{ name: "build", agent: "builder", input: { task: "Build app" } }],
    });

    const handle = await runtime.run("shared-mem-config-merge");
    await handle.wait();

    expect(await store.load({ level: "project", key: "config-project" })).not.toBeNull();
  });

  it("imports shared-memory scopes by specificity so workflow overrides project and global facts", async () => {
    const store = createInMemorySharedMemoryStore();

    await store.save(
      { level: "global", key: "global" },
      {
        knowledge: {
          facts: [
            {
              id: "fact-1",
              content: "global guidance",
              category: "lesson",
              tags: ["global"],
              confidence: 0.5,
              createdAt: new Date().toISOString(),
            },
          ],
        },
        decisions: { history: [] },
        context: { projectFacts: { owner: "global" } },
      },
    );
    await store.save(
      { level: "project", key: "test-project" },
      {
        knowledge: {
          facts: [
            {
              id: "fact-1",
              content: "project guidance",
              category: "lesson",
              tags: ["project"],
              confidence: 0.7,
              createdAt: new Date().toISOString(),
            },
          ],
        },
        decisions: { history: [] },
        context: { projectFacts: { owner: "project" } },
      },
    );
    await store.save(
      { level: "workflow", key: "shared-mem-priority" },
      {
        knowledge: {
          facts: [
            {
              id: "fact-1",
              content: "workflow guidance",
              category: "lesson",
              tags: ["workflow"],
              confidence: 0.9,
              createdAt: new Date().toISOString(),
            },
          ],
        },
        decisions: { history: [] },
        context: { projectFacts: { owner: "workflow" } },
      },
    );

    const runtime = new OboraRuntime({
      llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      sharedMemory: {
        enabled: true,
        adapter: "custom",
        custom: { instance: store },
        file: { projectKey: "test-project", scopes: ["workflow", "global", "project"] },
      },
    });

    const adapter = {
      chatCompletion: vi.fn().mockImplementation(async () => {
        return { message: { role: "assistant", content: "done" } };
      }),
    };

    vi.spyOn(
      runtime as unknown as { createLLMAdapter: () => Promise<typeof adapter> },
      "createLLMAdapter"
    ).mockResolvedValue(adapter);

    runtime.define("shared-mem-priority", {
      name: "shared-mem-priority",
      steps: [{ name: "build", agent: "builder", input: { task: "Build with shared memory" } }],
    });

    const handle = await runtime.run("shared-mem-priority");
    await handle.wait();

    const call = adapter.chatCompletion.mock.calls[0]?.[0];
    const userPrompt = String(call?.messages?.[1]?.content ?? "");
    expect(userPrompt).toContain('"importedScopes": [\n    "global:global",\n    "project:test-project",\n    "workflow:shared-mem-priority"');
    expect(userPrompt).toContain("workflow guidance");
    expect(userPrompt).toContain('"owner": "workflow"');
    expect(userPrompt).toContain('"provenance"');
    expect(userPrompt).toContain('"fact-1": "workflow:shared-mem-priority"');
  });

  it("projects repair-loop events into the staging TKG store", async () => {
    const store = {
      _data: new Map<string, { nodes: any[] }>(),
      async load(scope: MemoryScope) {
        return (this as any)._data.get(`${scope.level}:${scope.key}`) ?? null;
      },
      async save(scope: MemoryScope, snapshot: { nodes: any[] }) {
        (this as any)._data.set(`${scope.level}:${scope.key}`, snapshot);
      },
      async append(scope: MemoryScope, nodes: any[]) {
        const existing = (await this.load(scope)) ?? { nodes: [] };
        await this.save(scope, { nodes: [...existing.nodes, ...nodes] });
      },
    };

    const runtime = new OboraRuntime({
      llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      tkgProjection: {
        enabled: true,
        adapter: "custom",
        custom: { instance: store as any },
        file: { projectKey: "test-project", scopes: ["project"] },
      },
    });

    let callIndex = 0;
    const adapterMock = {
      chatCompletion: vi.fn().mockImplementation(async () => {
        callIndex += 1;
        if (callIndex === 1) {
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

    vi.spyOn(
      runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> },
      "createLLMAdapter"
    ).mockResolvedValue(adapterMock);

    runtime.define("tkg-projection-run", {
      name: "tkg-projection-run",
      tkgProjection: { enabled: true, projectKey: "test-project", scopes: ["project"] },
      steps: [
        {
          name: "build_or_repair",
          agent: "builder",
          config: {
            repair_loop: {
              enabled: true,
              validation_step: "validate",
            },
          },
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

    const handle = await runtime.run("tkg-projection-run");
    const result = await handle.wait();

    const snapshot = await (store as any).load({ level: "project", key: "test-project" });
    expect(snapshot?.nodes.map((node: { eventType: string }) => node.eventType)).toEqual([
      "workflow.validation_failed",
      "workflow.back_edge_triggered",
      "workflow.repair_started",
      "workflow.repair_completed",
      "workflow.validation_passed",
    ]);
    expect(snapshot?.nodes[0]?.summary).toContain("Fix TS1484 import type usage");
    expect(snapshot?.nodes[2]?.relations).toContainEqual({
      type: "caused_by",
      target: snapshot!.nodes[0]!.id,
    });
    expect(snapshot?.nodes[3]?.relations).toContainEqual({
      type: "completes",
      target: snapshot!.nodes[2]!.id,
    });
    expect(snapshot?.nodes[4]?.relations).toContainEqual({
      type: "resolves",
      target: snapshot!.nodes[0]!.id,
    });
    expect(result.outputs.__tkg_projection__).toEqual({
      projectedNodeCount: 5,
      projectedScopes: ["project:test-project"],
      eventTypes: [
        "workflow.validation_failed",
        "workflow.back_edge_triggered",
        "workflow.repair_started",
        "workflow.repair_completed",
        "workflow.validation_passed",
      ],
    });
    expect(result.outputs.__tkg_promotion__).toMatchObject({
      trigger: "execution_end",
      scope: "project:test-project",
      minConfidence: 0.8,
      allowedEventTypes: ["workflow.validation_passed", "workflow.repair_completed"],
      candidateCount: 2,
      promotableCount: 1,
      reviewCandidateCount: 1,
      conflictCount: 2,
      reviewQueueCount: 1,
    });
  });

  it("merges runtime and config tkgProjection settings instead of dropping nested file config", async () => {
    const store = {
      _data: new Map<string, { nodes: any[] }>(),
      async load(scope: MemoryScope) {
        return (this as any)._data.get(`${scope.level}:${scope.key}`) ?? null;
      },
      async save(scope: MemoryScope, snapshot: { nodes: any[] }) {
        (this as any)._data.set(`${scope.level}:${scope.key}`, snapshot);
      },
      async append(scope: MemoryScope, nodes: any[]) {
        const existing = (await this.load(scope)) ?? { nodes: [] };
        await this.save(scope, { nodes: [...existing.nodes, ...nodes] });
      },
    };

    const runtime = new OboraRuntime({
      llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      config: {
        tkgProjection: {
          enabled: true,
          file: { projectKey: "config-tkg-project", scopes: ["project"] },
        },
      },
      tkgProjection: {
        enabled: true,
        adapter: "custom",
        custom: { instance: store as any },
      },
    });

    let callIndex = 0;
    const adapterMock = {
      chatCompletion: vi.fn().mockImplementation(async () => {
        callIndex += 1;
        if (callIndex === 1) {
          return { message: { role: "assistant", content: "build ok" } };
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

    vi.spyOn(
      runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> },
      "createLLMAdapter"
    ).mockResolvedValue(adapterMock);

    runtime.define("tkg-config-merge", {
      name: "tkg-config-merge",
      tkgProjection: { enabled: true },
      steps: [
        { name: "build", agent: "builder", input: { task: "Build app" } },
        {
          name: "validate",
          agent: "validator",
          depends_on: ["build"],
          config: { validation: { enabled: true, emit_structured_result: true } },
          input: { task: "Validate app" },
        },
      ],
    });

    const handle = await runtime.run("tkg-config-merge");
    await handle.wait();

    const snapshot = await (store as any).load({ level: "project", key: "config-tkg-project" });
    expect(snapshot).not.toBeNull();
    expect(snapshot.nodes.map((node: { eventType: string }) => node.eventType)).toEqual([
      "workflow.validation_passed",
    ]);
  });

  it("stores blocking promotion conflicts in the TKG review queue", async () => {
    const stagingStore = {
      _data: new Map<string, { nodes: any[] }>(),
      async load(scope: MemoryScope) {
        return (this as any)._data.get(`${scope.level}:${scope.key}`) ?? null;
      },
      async save(scope: MemoryScope, snapshot: { nodes: any[] }) {
        (this as any)._data.set(`${scope.level}:${scope.key}`, snapshot);
      },
      async append(scope: MemoryScope, nodes: any[]) {
        const existing = (await this.load(scope)) ?? { nodes: [] };
        await this.save(scope, { nodes: [...existing.nodes, ...nodes] });
      },
    };
    const reviewQueueStore = {
      _data: new Map<string, { items: any[] }>(),
      async load(scope: MemoryScope) {
        return (this as any)._data.get(`${scope.level}:${scope.key}`) ?? null;
      },
      async save(scope: MemoryScope, snapshot: { items: any[] }) {
        (this as any)._data.set(`${scope.level}:${scope.key}`, snapshot);
      },
      async enqueue(scope: MemoryScope, item: any) {
        const existing = (await this.load(scope)) ?? { items: [] };
        await this.save(scope, { items: [...existing.items, item] });
      },
    };

    const runtime = new OboraRuntime({
      llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      tkgProjection: {
        enabled: true,
        adapter: "custom",
        custom: { instance: stagingStore as any },
        file: { projectKey: "test-project", scopes: ["project"] },
        reviewQueue: {
          enabled: true,
          adapter: "custom",
          custom: { instance: reviewQueueStore as any },
        },
      },
    });

    let callIndex = 0;
    const adapterMock = {
      chatCompletion: vi.fn().mockImplementation(async () => {
        callIndex += 1;
        if (callIndex === 1) {
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

    vi.spyOn(
      runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> },
      "createLLMAdapter"
    ).mockResolvedValue(adapterMock);

    runtime.define("tkg-review-queue-run", {
      name: "tkg-review-queue-run",
      tkgProjection: {
        enabled: true,
        projectKey: "test-project",
        scopes: ["project"],
        reviewQueue: { enabled: true },
      },
      steps: [
        {
          name: "build_or_repair",
          agent: "builder",
          config: {
            repair_loop: {
              enabled: true,
              validation_step: "validate",
            },
          },
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

    const handle = await runtime.run("tkg-review-queue-run");
    const result = await handle.wait();

    const snapshot = await (reviewQueueStore as any).load({ level: "project", key: "test-project" });
    expect(snapshot?.items).toHaveLength(1);
    expect(snapshot?.items[0]?.workflowName).toBe("tkg-review-queue-run");
    expect(snapshot?.items[0]?.candidateNodeIds).toHaveLength(1);
    expect(snapshot?.items[0]?.conflicts).toHaveLength(1);
    expect(snapshot?.items[0]?.conflicts[0]?.type).toBe("contradiction");
    expect(result.outputs.__tkg_review_queue__).toEqual({
      trigger: "execution_end",
      scope: "project:test-project",
      queuedItems: 1,
    });
  });

  it("applies promotable TKG candidates into shared memory when conflicts do not block promotion", async () => {
    const sharedMemoryStore = createInMemorySharedMemoryStore();
    const stagingStore = {
      _data: new Map<string, { nodes: any[] }>(),
      async load(scope: MemoryScope) {
        return (this as any)._data.get(`${scope.level}:${scope.key}`) ?? null;
      },
      async save(scope: MemoryScope, snapshot: { nodes: any[] }) {
        (this as any)._data.set(`${scope.level}:${scope.key}`, snapshot);
      },
      async append(scope: MemoryScope, nodes: any[]) {
        const existing = (await this.load(scope)) ?? { nodes: [] };
        await this.save(scope, { nodes: [...existing.nodes, ...nodes] });
      },
    };

    const runtime = new OboraRuntime({
      llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      sharedMemory: {
        enabled: true,
        adapter: "custom",
        custom: { instance: sharedMemoryStore },
        file: { projectKey: "test-project", scopes: ["project"] },
      },
      tkgProjection: {
        enabled: true,
        adapter: "custom",
        custom: { instance: stagingStore as any },
        file: { projectKey: "test-project", scopes: ["project"] },
      },
    });

    let callIndex = 0;
    const adapterMock = {
      chatCompletion: vi.fn().mockImplementation(async () => {
        callIndex += 1;
        if (callIndex === 1) {
          return { message: { role: "assistant", content: "build ok" } };
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

    vi.spyOn(
      runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> },
      "createLLMAdapter"
    ).mockResolvedValue(adapterMock);

    runtime.define("tkg-promotion-apply-run", {
      name: "tkg-promotion-apply-run",
      sharedMemory: { enabled: true, projectKey: "test-project", scopes: ["project"] },
      tkgProjection: { enabled: true, projectKey: "test-project", scopes: ["project"] },
      steps: [
        { name: "build", agent: "builder", input: { task: "Build app" } },
        {
          name: "validate",
          agent: "validator",
          depends_on: ["build"],
          config: { validation: { enabled: true, emit_structured_result: true } },
          input: { task: "Validate app" },
        },
      ],
    });

    const handle = await runtime.run("tkg-promotion-apply-run");
    const result = await handle.wait();

    const stored = await sharedMemoryStore.load({ level: "project", key: "test-project" });
    expect(stored?.knowledge.facts.some((fact) => fact.category === "tkg-promotion")).toBe(true);
    expect(result.outputs.__tkg_promotion_apply__).toEqual({
      trigger: "execution_end",
      scopes: ["project:test-project"],
      appliedFactCount: 1,
      appliedNodeIds: [expect.stringMatching(/^tkg-promotion:/)],
    });
  });

  it("uses configured tkg promotion policy for apply scopes and thresholds", async () => {
    const sharedMemoryStore = createInMemorySharedMemoryStore();
    const stagingStore = {
      _data: new Map<string, { nodes: any[] }>(),
      async load(scope: MemoryScope) {
        return (this as any)._data.get(`${scope.level}:${scope.key}`) ?? null;
      },
      async save(scope: MemoryScope, snapshot: { nodes: any[] }) {
        (this as any)._data.set(`${scope.level}:${scope.key}`, snapshot);
      },
      async append(scope: MemoryScope, nodes: any[]) {
        const existing = (await this.load(scope)) ?? { nodes: [] };
        await this.save(scope, { nodes: [...existing.nodes, ...nodes] });
      },
    };

    const runtime = new OboraRuntime({
      llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      config: {
        tkgProjection: {
          enabled: true,
          file: { projectKey: "test-project", scopes: ["project"] },
          promotion: {
            minConfidence: 0.9,
            allowedEventTypes: ["workflow.validation_passed"],
            applyScopes: ["global"],
          },
        },
      },
      sharedMemory: {
        enabled: true,
        adapter: "custom",
        custom: { instance: sharedMemoryStore },
      },
      tkgProjection: {
        enabled: true,
        adapter: "custom",
        custom: { instance: stagingStore as any },
      },
    });

    let callIndex = 0;
    const adapterMock = {
      chatCompletion: vi.fn().mockImplementation(async () => {
        callIndex += 1;
        if (callIndex === 1) {
          return { message: { role: "assistant", content: "build ok" } };
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

    vi.spyOn(
      runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> },
      "createLLMAdapter"
    ).mockResolvedValue(adapterMock);

    runtime.define("tkg-promotion-policy-run", {
      name: "tkg-promotion-policy-run",
      sharedMemory: { enabled: true, projectKey: "test-project", scopes: ["project"] },
      tkgProjection: { enabled: true },
      steps: [
        { name: "build", agent: "builder", input: { task: "Build app" } },
        {
          name: "validate",
          agent: "validator",
          depends_on: ["build"],
          config: { validation: { enabled: true, emit_structured_result: true } },
          input: { task: "Validate app" },
        },
      ],
    });

    const handle = await runtime.run("tkg-promotion-policy-run");
    const result = await handle.wait();

    const globalSnapshot = await sharedMemoryStore.load({ level: "global", key: "global" });
    const projectSnapshot = await sharedMemoryStore.load({ level: "project", key: "test-project" });
    expect(globalSnapshot?.knowledge.facts.some((fact) => fact.category === "tkg-promotion")).toBe(true);
    expect(projectSnapshot?.knowledge.facts.some((fact) => fact.category === "tkg-promotion")).toBe(false);
    expect(result.outputs.__tkg_promotion_apply__).toEqual({
      trigger: "execution_end",
      scopes: ["global:global"],
      appliedFactCount: 1,
      appliedNodeIds: [expect.stringMatching(/^tkg-promotion:/)],
    });
    expect(result.outputs.__tkg_promotion__).toMatchObject({
      minConfidence: 0.9,
      allowedEventTypes: ["workflow.validation_passed"],
    });
  });

  it("flushes TKG promotion on validation_passed trigger before execution_end", async () => {
    const sharedMemoryStore = createInMemorySharedMemoryStore();
    const stagingStore = {
      _data: new Map<string, { nodes: any[] }>(),
      async load(scope: MemoryScope) {
        return (this as any)._data.get(`${scope.level}:${scope.key}`) ?? null;
      },
      async save(scope: MemoryScope, snapshot: { nodes: any[] }) {
        (this as any)._data.set(`${scope.level}:${scope.key}`, snapshot);
      },
      async append(scope: MemoryScope, nodes: any[]) {
        const existing = (await this.load(scope)) ?? { nodes: [] };
        await this.save(scope, { nodes: [...existing.nodes, ...nodes] });
      },
    };

    const runtime = new OboraRuntime({
      llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      sharedMemory: {
        enabled: true,
        adapter: "custom",
        custom: { instance: sharedMemoryStore },
        file: { projectKey: "test-project", scopes: ["project"] },
      },
      tkgProjection: {
        enabled: true,
        adapter: "custom",
        custom: { instance: stagingStore as any },
        file: { projectKey: "test-project", scopes: ["project"] },
        promotion: {
          triggers: ["workflow.validation_passed"],
        },
      },
    });

    let callIndex = 0;
    const adapterMock = {
      chatCompletion: vi.fn().mockImplementation(async () => {
        callIndex += 1;
        if (callIndex === 1) {
          return { message: { role: "assistant", content: "build ok" } };
        }
        if (callIndex === 2) {
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
        }
        throw new Error("late failure");
      }),
    };

    vi.spyOn(
      runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> },
      "createLLMAdapter"
    ).mockResolvedValue(adapterMock);

    runtime.define("tkg-triggered-flush-run", {
      name: "tkg-triggered-flush-run",
      sharedMemory: { enabled: true, projectKey: "test-project", scopes: ["project"] },
      tkgProjection: {
        enabled: true,
        projectKey: "test-project",
        scopes: ["project"],
        promotion: { triggers: ["workflow.validation_passed"] },
      },
      steps: [
        { name: "build", agent: "builder", input: { task: "Build app" } },
        {
          name: "validate",
          agent: "validator",
          depends_on: ["build"],
          config: { validation: { enabled: true, emit_structured_result: true } },
          input: { task: "Validate app" },
        },
        { name: "finalize", agent: "builder", depends_on: ["validate"], input: { task: "Fail late" } },
      ],
    });

    const handle = await runtime.run("tkg-triggered-flush-run");
    await expect(handle.wait()).rejects.toThrow(/late failure/i);

    const stored = await sharedMemoryStore.load({ level: "project", key: "test-project" });
    expect(stored?.knowledge.facts.some((fact) => fact.category === "tkg-promotion")).toBe(true);
  });

  it("captures rollback snapshots before applying TKG promotion into shared memory", async () => {
    const sharedMemoryStore = createInMemorySharedMemoryStore();
    const rollbackStore = {
      _data: new Map<string, { entries: any[] }>(),
      async load(scope: MemoryScope) {
        return (this as any)._data.get(`${scope.level}:${scope.key}`) ?? null;
      },
      async save(scope: MemoryScope, snapshot: { entries: any[] }) {
        (this as any)._data.set(`${scope.level}:${scope.key}`, snapshot);
      },
      async append(scope: MemoryScope, entry: any) {
        const existing = (await this.load(scope)) ?? { entries: [] };
        await this.save(scope, { entries: [...existing.entries, entry] });
      },
    };
    const stagingStore = {
      _data: new Map<string, { nodes: any[] }>(),
      async load(scope: MemoryScope) {
        return (this as any)._data.get(`${scope.level}:${scope.key}`) ?? null;
      },
      async save(scope: MemoryScope, snapshot: { nodes: any[] }) {
        (this as any)._data.set(`${scope.level}:${scope.key}`, snapshot);
      },
      async append(scope: MemoryScope, nodes: any[]) {
        const existing = (await this.load(scope)) ?? { nodes: [] };
        await this.save(scope, { nodes: [...existing.nodes, ...nodes] });
      },
    };

    await sharedMemoryStore.save(
      { level: "project", key: "test-project" },
      {
        knowledge: {
          facts: [
            {
              id: "existing-fact",
              content: "pre-existing shared memory fact",
              category: "lesson",
              tags: ["baseline"],
              confidence: 0.7,
              createdAt: new Date().toISOString(),
            },
          ],
        },
        decisions: { history: [] },
        context: { projectFacts: { baseline: true } },
      },
    );

    const runtime = new OboraRuntime({
      llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      sharedMemory: {
        enabled: true,
        adapter: "custom",
        custom: { instance: sharedMemoryStore },
        file: { projectKey: "test-project", scopes: ["project"] },
      },
      tkgProjection: {
        enabled: true,
        adapter: "custom",
        custom: { instance: stagingStore as any },
        file: { projectKey: "test-project", scopes: ["project"] },
        rollback: {
          enabled: true,
          adapter: "custom",
          custom: { instance: rollbackStore as any },
        },
      },
    });

    let callIndex = 0;
    const adapterMock = {
      chatCompletion: vi.fn().mockImplementation(async () => {
        callIndex += 1;
        if (callIndex === 1) {
          return { message: { role: "assistant", content: "build ok" } };
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

    vi.spyOn(
      runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> },
      "createLLMAdapter"
    ).mockResolvedValue(adapterMock);

    runtime.define("tkg-rollback-run", {
      name: "tkg-rollback-run",
      sharedMemory: { enabled: true, projectKey: "test-project", scopes: ["project"] },
      tkgProjection: {
        enabled: true,
        projectKey: "test-project",
        scopes: ["project"],
        rollback: { enabled: true },
      },
      steps: [
        { name: "build", agent: "builder", input: { task: "Build app" } },
        {
          name: "validate",
          agent: "validator",
          depends_on: ["build"],
          config: { validation: { enabled: true, emit_structured_result: true } },
          input: { task: "Validate app" },
        },
      ],
    });

    const handle = await runtime.run("tkg-rollback-run");
    const result = await handle.wait();

    const rollbackSnapshot = await (rollbackStore as any).load({ level: "project", key: "test-project" });
    expect(rollbackSnapshot?.entries).toHaveLength(1);
    expect(rollbackSnapshot?.entries[0]?.snapshot.knowledge.facts[0]?.id).toBe("existing-fact");
    expect(result.outputs.__tkg_promotion_rollback__).toEqual({
      trigger: "execution_end",
      capturedSnapshots: 1,
      scopes: ["project:test-project"],
      rollbackIds: [expect.any(String)],
    });
  });

  it("lists and resolves TKG review queue items through the runtime facade API", async () => {
    const reviewQueueData = new Map<string, { items: any[] }>();
    const reviewQueueStore = {
      async load(scope: MemoryScope) {
        return reviewQueueData.get(`${scope.level}:${scope.key}`) ?? null;
      },
      async save(scope: MemoryScope, snapshot: { items: any[] }) {
        reviewQueueData.set(`${scope.level}:${scope.key}`, snapshot);
      },
      async enqueue(scope: MemoryScope, item: any) {
        const existing = (await this.load(scope)) ?? { items: [] };
        await this.save(scope, { items: [...existing.items, item] });
      },
      async resolve(scope: MemoryScope, itemId: string, resolution: any) {
        const existing = (await this.load(scope)) ?? { items: [] };
        await this.save(scope, {
          items: existing.items.map((item) => item.id === itemId ? {
            ...item,
            status: resolution.status,
            resolution,
          } : item),
        });
      },
    };

    await reviewQueueStore.save(
      { level: "project", key: "test-project" },
      {
        items: [
          {
            id: "review-1",
            createdAt: new Date().toISOString(),
            scope: "project:test-project",
            workflowName: "runtime-review-queue",
            status: "open",
            candidateNodeIds: ["n1"],
            conflicts: [],
            summary: {
              candidateCount: 1,
              promotableCount: 0,
              reviewCandidateCount: 1,
              conflictCount: 1,
              reviewQueueCount: 1,
            },
          },
        ],
      },
    );

    const runtime = new OboraRuntime({
      tkgProjection: {
        enabled: true,
        file: { projectKey: "test-project", scopes: ["project"] },
        reviewQueue: {
          enabled: true,
          adapter: "custom",
          custom: { instance: reviewQueueStore as any },
        },
      },
    });

    runtime.define("runtime-review-queue", {
      name: "runtime-review-queue",
      tkgProjection: {
        enabled: true,
        projectKey: "test-project",
        scopes: ["project"],
        reviewQueue: { enabled: true },
      },
      steps: [{ name: "build", agent: "builder", input: { task: "Build app" } }],
    });

    const items = await runtime.listOpenTKGReviewQueueItems("runtime-review-queue");
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe("review-1");

    const summary = await runtime.resolveTKGReviewQueueItem("runtime-review-queue", "review-1", {
      status: "approved",
      actor: "cto",
      note: "safe to promote",
    });

    expect(summary).toEqual({
      resolved: true,
      scope: "project:test-project",
      itemId: "review-1",
      status: "approved",
    });
    const updated = await reviewQueueStore.load({ level: "project", key: "test-project" });
    expect(updated?.items[0]?.status).toBe("approved");
  });

  it("restores the latest TKG rollback snapshot through the runtime facade API", async () => {
    const sharedMemoryStore = createInMemorySharedMemoryStore();
    const rollbackStore = {
      async load() {
        return {
          entries: [
            {
              id: "rollback-1",
              createdAt: new Date().toISOString(),
              executionId: "exec-1",
              workflowName: "runtime-rollback",
              scope: "project:test-project",
              reason: "pre-tkg-promotion-apply",
              snapshot: {
                knowledge: {
                  facts: [
                    {
                      id: "restored-fact",
                      content: "restored shared memory fact",
                      category: "lesson",
                      tags: ["restored"],
                      confidence: 0.9,
                      createdAt: new Date().toISOString(),
                    },
                  ],
                },
                decisions: { history: [] },
                context: { projectFacts: { restored: true } },
              },
            },
          ],
        };
      },
      async save() {},
      async append() {},
    };

    const runtime = new OboraRuntime({
      sharedMemory: {
        enabled: true,
        adapter: "custom",
        custom: { instance: sharedMemoryStore },
        file: { projectKey: "test-project", scopes: ["project"] },
      },
      tkgProjection: {
        enabled: true,
        file: { projectKey: "test-project", scopes: ["project"] },
        rollback: {
          enabled: true,
          adapter: "custom",
          custom: { instance: rollbackStore as any },
        },
      },
    });

    runtime.define("runtime-rollback", {
      name: "runtime-rollback",
      sharedMemory: { enabled: true, projectKey: "test-project", scopes: ["project"] },
      tkgProjection: {
        enabled: true,
        projectKey: "test-project",
        scopes: ["project"],
        rollback: { enabled: true },
      },
      steps: [{ name: "build", agent: "builder", input: { task: "Build app" } }],
    });

    const summary = await runtime.restoreLatestTKGRollback("runtime-rollback");
    const restored = await sharedMemoryStore.load({ level: "project", key: "test-project" });

    expect(summary).toEqual({
      restored: true,
      scope: "project:test-project",
      rollbackId: "rollback-1",
      restoredFactCount: 1,
    });
    expect(restored?.knowledge.facts[0]?.id).toBe("restored-fact");
  });

  it("reapplies approved TKG review queue items through the runtime facade API", async () => {
    const sharedMemoryData = new Map<string, SharedMemorySnapshot>();
    const sharedMemoryStore: SharedMemoryStore = {
      async load(scope: MemoryScope) {
        return sharedMemoryData.get(`${scope.level}:${scope.key}`) ?? null;
      },
      async save(scope: MemoryScope, snapshot: SharedMemorySnapshot) {
        sharedMemoryData.set(`${scope.level}:${scope.key}`, snapshot);
      },
      async merge(scope: MemoryScope, snapshot: SharedMemorySnapshot) {
        const existing = await this.load(scope);
        await this.save(scope, mergeSharedMemorySnapshots(existing, snapshot));
      },
    };
    const stagingStore = {
      async load() {
        return {
          nodes: [
            {
              id: "n2",
              eventType: "workflow.validation_passed",
              executionId: "exec-1",
              workflowName: "runtime-reapply",
              stepName: "validate",
              timestamp: new Date().toISOString(),
              summary: "Validation passed",
              attributes: {},
              relations: [],
            },
          ],
        };
      },
      async save() {},
    };
    const reviewQueueStore = {
      async load() {
        return {
          items: [
            {
              id: "review-1",
              createdAt: new Date().toISOString(),
              scope: "project:test-project",
              workflowName: "runtime-reapply",
              status: "approved" as const,
              candidateNodeIds: ["n2"],
              conflicts: [],
              summary: {
                candidateCount: 1,
                promotableCount: 1,
                reviewCandidateCount: 1,
                conflictCount: 0,
                reviewQueueCount: 1,
              },
              resolution: {
                status: "approved" as const,
                resolvedAt: new Date().toISOString(),
              },
            },
          ],
        };
      },
      async save() {},
    };

    const runtime = new OboraRuntime({
      sharedMemory: {
        enabled: true,
        adapter: "custom",
        custom: { instance: sharedMemoryStore },
        file: { projectKey: "test-project", scopes: ["project"] },
      },
      tkgProjection: {
        enabled: true,
        adapter: "custom",
        custom: { instance: stagingStore as any },
        file: { projectKey: "test-project", scopes: ["project"] },
        reviewQueue: {
          enabled: true,
          adapter: "custom",
          custom: { instance: reviewQueueStore as any },
        },
      },
    });

    runtime.define("runtime-reapply", {
      name: "runtime-reapply",
      sharedMemory: { enabled: true, projectKey: "test-project", scopes: ["project"] },
      tkgProjection: { enabled: true, projectKey: "test-project", scopes: ["project"] },
      steps: [{ name: "build", agent: "builder", input: { task: "Build app" } }],
    });

    const summary = await runtime.reapplyApprovedTKGReviewQueueItems("runtime-reapply", {
      sourceExecutionId: "exec-reapply",
    });

    const stored = await sharedMemoryStore.load({ level: "project", key: "test-project" });
    expect(stored?.knowledge.facts.map((fact) => fact.id)).toEqual(["tkg-promotion:n2"]);
    expect(stored?.decisions.history.map((decision) => decision.id)).toEqual([
      "tkg-review-resolution:review-1:approved",
    ]);
    expect(summary).toEqual({
      appliedFactCount: 1,
      appliedNodeIds: ["tkg-promotion:n2"],
      approvedItemCount: 1,
      approvedItemIds: ["review-1"],
      appliedDecisionCount: 1,
      scopes: ["project:test-project"],
    });
  });

  it("force_target reroutes next back-edge to the specified step", async () => {
    const runtime = new OboraRuntime({
      llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      audit: { enabled: true },
    });

    const stepsSeen: string[] = [];
    runtime.on("step_start", (event) => {
      const data = event.data as { stepName?: string } | undefined;
      if (data?.stepName) stepsSeen.push(data.stepName);
    });

    let callIndex = 0;
    const adapterMock = {
      chatCompletion: vi.fn().mockImplementation(async ({ messages }) => {
        callIndex += 1;
        const userPrompt = String(messages[1]?.content ?? "");

        if (callIndex === 1) {
          expect(userPrompt).toContain("Step: design");
          return { message: { role: "assistant", content: "design v1" } };
        }
        if (callIndex === 2) {
          expect(userPrompt).toContain("Step: build_or_repair");
          return { message: { role: "assistant", content: "build v1" } };
        }
        if (callIndex === 3) {
          expect(userPrompt).toContain("Step: validate");
          return {
            message: {
              role: "assistant",
              content: JSON.stringify({
                passed: false,
                summary: "backup restore logic failed in CLI path",
                failedChecks: [{ name: "implementation_bug: backup", message: "backup restore path broken" }],
                signature: "backup-force-1",
              }),
            },
          };
        }
        if (callIndex === 4) {
          expect(userPrompt).toContain("Step: build_or_repair");
          expect(userPrompt).toContain("Reflector analysis:");
          return { message: { role: "assistant", content: "build v2" } };
        }
        if (callIndex === 5) {
          expect(userPrompt).toContain("Step: validate");
          return {
            message: {
              role: "assistant",
              content: JSON.stringify({
                passed: false,
                summary: "backup restore logic still failing in CLI path",
                failedChecks: [{ name: "implementation_bug: restore", message: "backup restore path still broken" }],
                signature: "backup-force-2",
              }),
            },
          };
        }
        if (callIndex === 6) {
          expect(userPrompt).toContain("Step: design");
          return { message: { role: "assistant", content: "design v2" } };
        }
        if (callIndex === 7) {
          expect(userPrompt).toContain("Step: build_or_repair");
          return { message: { role: "assistant", content: "build v3" } };
        }
        expect(userPrompt).toContain("Step: validate");
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

    vi.spyOn(
      runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> },
      "createLLMAdapter"
    ).mockResolvedValue(adapterMock);

    runtime.define("validation-repair-reflector-force-target", {
      name: "validation-repair-reflector-force-target",
      reflector: {
        rules: [
          {
            name: "reroute_to_design_on_backup",
            when: { keywords_include: ["backup"], min_failures: 1 },
            actions: [{ type: "force_target", target: "design" }],
          },
        ],
      },
      steps: [
        {
          name: "design",
          agent: "architect",
          input: { task: "Design the app" },
        },
        {
          name: "build_or_repair",
          agent: "builder",
          depends_on: ["design"],
          config: {
            repair_loop: {
              enabled: true,
              validation_step: "validate",
              max_no_progress_iterations: 4,
              repeated_critical_issue_ceiling: 4,
            },
          },
          input: { task: "Build or repair the app" },
        },
        {
          name: "validate",
          agent: "validator",
          depends_on: ["build_or_repair"],
          config: { validation: { enabled: true, emit_structured_result: true } },
          on_fail: { goto: "build_or_repair", max_iterations: 4 },
          input: { task: "Validate the app and return structured JSON" },
        },
      ],
    });

    const handle = await runtime.run("validation-repair-reflector-force-target");
    const result = await handle.wait();

    expect(result.status).toBe("completed");
    expect(result.outputs.design).toBe("design v2");
    expect(result.outputs.build_or_repair).toBe("build v3");
    expect(adapterMock.chatCompletion).toHaveBeenCalledTimes(8);
    expect(stepsSeen).toEqual([
      "design",
      "build_or_repair",
      "validate",
      "build_or_repair",
      "validate",
      "design",
      "build_or_repair",
      "validate",
    ]);
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

    vi.spyOn(
      runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> },
      "createLLMAdapter"
    ).mockResolvedValue(adapterMock);

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
      async saveRun(record: any) {
        savedRuns.push(structuredClone(record));
      },
      async getRun() {
        return null;
      },
      async listRuns() {
        return [];
      },
      async saveStep() {
        return;
      },
      async getSteps() {
        return [];
      },
      async saveArtifact(record: any) {
        return record;
      },
      async getArtifacts() {
        return [];
      },
      async deleteArtifact() {
        return;
      },
      async saveCheckpoint() {
        return;
      },
      async getLatestCheckpoint() {
        return null;
      },
      async saveCost() {
        return;
      },
      async getCosts() {
        return [];
      },
      async getRunCostSummary() {
        return { totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] };
      },
      async saveAuditEvent() {
        return;
      },
      async getAuditTimeline() {
        return [];
      },
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

    vi.spyOn(
      runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> },
      "createLLMAdapter"
    ).mockResolvedValue(adapterMock);

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
        chatCompletion: vi
          .fn()
          .mockResolvedValue({ message: { role: "assistant", content: "ok" } }),
      };
      vi.spyOn(
        runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> },
        "createLLMAdapter"
      ).mockResolvedValue(adapterMock);

      runtime.define("agent-provider-fallback", {
        name: "agent-provider-fallback",
        steps: [{ name: "design", agent: "architect", input: { task: "Create architecture" } }],
      });

      const handle = await runtime.run("agent-provider-fallback");
      const result = await handle.wait();

      expect(result.status).toBe("completed");
      expect(warnings).toContain(
        "Agent 'architect' configured with provider 'openai' but API key not resolved. Falling back to default."
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
      async saveRun(record: any) {
        savedRuns.push(structuredClone(record));
      },
      async getRun() {
        return null;
      },
      async listRuns() {
        return [];
      },
      async saveStep() {
        return;
      },
      async getSteps() {
        return [];
      },
      async saveArtifact(record: any) {
        return record;
      },
      async getArtifacts() {
        return [];
      },
      async deleteArtifact() {
        return;
      },
      async saveCheckpoint() {
        return;
      },
      async getLatestCheckpoint() {
        return null;
      },
      async saveCost() {
        return;
      },
      async getCosts() {
        return [];
      },
      async getRunCostSummary() {
        return { totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] };
      },
      async saveAuditEvent() {
        return;
      },
      async getAuditTimeline() {
        return [];
      },
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
      async saveRun(record: any) {
        savedRuns.push(structuredClone(record));
      },
      async getRun() {
        return null;
      },
      async listRuns() {
        return [];
      },
      async saveStep() {
        return;
      },
      async getSteps() {
        return [];
      },
      async saveArtifact(record: any) {
        return record;
      },
      async getArtifacts() {
        return [];
      },
      async deleteArtifact() {
        return;
      },
      async saveCheckpoint() {
        return;
      },
      async getLatestCheckpoint() {
        return null;
      },
      async saveCost() {
        return;
      },
      async getCosts() {
        return [];
      },
      async getRunCostSummary() {
        return { totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] };
      },
      async saveAuditEvent() {
        return;
      },
      async getAuditTimeline() {
        return [];
      },
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

    vi.spyOn(
      runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> },
      "createLLMAdapter"
    ).mockResolvedValue(adapterMock);

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
      async saveRun() {},
      async getRun() {
        return null;
      },
      async listRuns() {
        return [];
      },
      async saveStep() {},
      async getSteps() {
        return [];
      },
      async saveArtifact(record: any) {
        return record;
      },
      async getArtifacts() {
        return [];
      },
      async deleteArtifact() {},
      async saveCheckpoint() {},
      async getLatestCheckpoint() {
        return null;
      },
      async saveCost(record: any) {
        costs.push(record);
      },
      async getCosts(runId: string, stepName?: string) {
        return costs.filter((c) => c.runId === runId && (!stepName || c.stepName === stepName));
      },
      async getRunCostSummary(runId: string) {
        const rows = costs.filter((c) => c.runId === runId);
        return {
          totalTokens: rows.reduce((s, r) => s + r.totalTokens, 0),
          totalCostUsd: rows.reduce((s, r) => s + r.costUsd, 0),
          byStep: [],
          byModel: [],
        };
      },
      async saveAuditEvent() {
        return;
      },
      async getAuditTimeline() {
        return [];
      },
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
    vi.spyOn(
      runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> },
      "createLLMAdapter"
    ).mockResolvedValue(adapterMock);

    const handle = await runtime.run("budget-stop");
    await expect(handle.wait()).rejects.toMatchObject({
      code: OboraErrorCode.POLICY_RESOURCE_EXCEEDED,
    });
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
      async getRun() {
        return null;
      },
      async listRuns() {
        return [];
      },
      async saveRun() {
        return;
      },
      async saveStep() {
        return;
      },
      async getSteps() {
        return [];
      },
      async saveArtifact(record: any) {
        return record;
      },
      async getArtifacts() {
        return [];
      },
      async deleteArtifact() {
        return;
      },
      async saveCheckpoint() {
        return;
      },
      async getLatestCheckpoint() {
        return null;
      },
      async saveCost() {
        return;
      },
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
      async saveAuditEvent() {
        return;
      },
      async getAuditTimeline() {
        return [];
      },
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
    const timeline = [
      {
        id: "a1",
        runId: "run-a",
        stepName: "review",
        timestamp: new Date().toISOString(),
        category: "consensus",
        action: "consensus_vote",
        actor: "agent-a",
        detail: {},
      },
    ];

    const storage = {
      async getRun(runId: string) {
        return runId === "run-a"
          ? {
              id: runId,
              workflowName: "wf",
              status: "completed",
              input: {},
              startedAt: new Date().toISOString(),
            }
          : null;
      },
      async listRuns() {
        return [];
      },
      async saveRun() {
        return;
      },
      async saveStep() {
        return;
      },
      async getSteps() {
        return [];
      },
      async saveArtifact(record: any) {
        return record;
      },
      async getArtifacts() {
        return [];
      },
      async deleteArtifact() {
        return;
      },
      async saveCheckpoint() {
        return;
      },
      async getLatestCheckpoint() {
        return null;
      },
      async saveCost() {
        return;
      },
      async getCosts() {
        return [];
      },
      async getRunCostSummary() {
        return { totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] };
      },
      async saveAuditEvent() {
        return;
      },
      async getAuditTimeline(runId: string, stepName?: string) {
        return timeline.filter((e) => e.runId === runId && (!stepName || e.stepName === stepName));
      },
    };

    const runtime = new OboraRuntime({
      persistence: { enabled: true, adapter: "custom", custom: { instance: storage as any } },
    });
    const run = await runtime.getRun("run-a");
    const events = await run?.auditReplay("review");
    const events2 = await runtime.runs.auditReplay("run-a", "review");

    expect(events).toHaveLength(1);
    expect(events2).toHaveLength(1);
  });
});
