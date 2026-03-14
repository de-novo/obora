import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { Agent, type AgentContext } from "../agent.js";
import { Policy } from "../policy.js";
import { OboraError, OboraErrorCode, OboraRuntime } from "../runtime.js";
import { Workflow } from "../workflow.js";

describe("builder API", () => {
  function withNoLLMEnv() {
    const keys = [
      "OPENAI_API_KEY",
      "ANTHROPIC_API_KEY",
      "GOOGLE_API_KEY",
      "XAI_API_KEY",
      "ZAI_API_KEY",
    ] as const;
    const backup = new Map<string, string | undefined>();
    for (const key of keys) {
      backup.set(key, process.env[key]);
      delete process.env[key];
    }

    return () => {
      for (const [key, value] of backup.entries()) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    };
  }
  it("Policy.create validates valid/invalid inputs", () => {
    const policy = Policy.create({
      version: "1",
      tools: {
        browser: { allowed: true },
      },
    });

    expect(policy.version).toBe("1");
    expect(() => Policy.create(null)).toThrowError(OboraError);
    expect(() => Policy.create(null)).toThrowError("Invalid policy definition");

    try {
      Policy.create(null);
    } catch (error) {
      expect((error as OboraError).code).toBe(OboraErrorCode.SDK_INVALID_POLICY);
    }

    expect(() => Policy.create({ rules: "not-array" })).toThrowError(OboraError);
    expect(() => Policy.create({ rules: "not-array" })).toThrowError("Policy rules must be an array");
  });

  it("Workflow.create validates valid/invalid inputs", () => {
    const workflow = Workflow.create({
      name: "demo",
      steps: [{ name: "step-1", tool: "echo" }],
    });

    expect(workflow.name).toBe("demo");
    expect(() => Workflow.create({ steps: [] })).toThrowError(OboraError);
    expect(() => Workflow.create({ name: "demo" })).toThrowError(OboraError);

    try {
      Workflow.create({ steps: [] });
    } catch (error) {
      expect((error as OboraError).code).toBe(OboraErrorCode.SDK_INVALID_WORKFLOW);
      expect((error as OboraError).message).toBe("Workflow must have a name");
    }

    try {
      Workflow.create({ name: "demo" });
    } catch (error) {
      expect((error as OboraError).code).toBe(OboraErrorCode.SDK_INVALID_WORKFLOW);
      expect((error as OboraError).message).toBe("Workflow must have steps array");
    }

    expect(() => Workflow.create({ name: "demo", steps: [{}] })).toThrowError(OboraError);
    expect(() => Workflow.create({ name: "demo", steps: [{}] })).toThrowError(
      "Each workflow step must have a string name",
    );
  });

  it("Workflow.fromYaml loads workflow from YAML", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-sdk-workflow-"));
    const path = join(dir, "workflow.yaml");
    await writeFile(path, "name: yaml-demo\nsteps:\n  - name: first\n");

    const workflow = await Workflow.fromYaml(path);
    expect(workflow.name).toBe("yaml-demo");
    expect(workflow.steps).toEqual([{ name: "first" }]);
  });

  it("Workflow.create expands one-file validation-repair mode", () => {
    const workflow = Workflow.create({
      name: "one-file-validation-repair",
      mode: "validation-repair",
      agents: {
        repair: "builder",
        validator: "validator",
      },
      prompts: {
        repair: "Repair the artifact.",
        validate: "Validate and emit structured result.",
      },
      loop: {
        max_iterations: 4,
        no_progress_ceiling: 2,
        repeated_critical_issue_ceiling: 2,
      },
      archive: { enabled: true },
      output: { root: "./tmp-output" },
    });

    expect(workflow.name).toBe("one-file-validation-repair");
    expect(workflow.variables).toMatchObject({
      output_root: "./tmp-output",
      archive_enabled: true,
    });
    expect(Workflow.getStopSemantics({
      mode: "validation-repair",
      loop: { max_iterations: 4, no_progress_ceiling: 2, repeated_critical_issue_ceiling: 2 },
      output: { root: "./tmp-output" },
      archive: { enabled: true },
    })).toMatchObject({
      output: { root: "./tmp-output" },
      archive: { enabled: true },
    });
    expect(workflow.steps).toHaveLength(2);
    expect(workflow.steps[0]).toMatchObject({
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
      input: { task: "Repair the artifact." },
    });
    expect(workflow.steps[1]).toMatchObject({
      name: "validate",
      agent: "validator",
      depends_on: ["build_or_repair"],
      config: {
        validation: {
          enabled: true,
          emit_structured_result: true,
        },
      },
      on_fail: {
        goto: "build_or_repair",
        max_iterations: 4,
      },
      input: { task: "Validate and emit structured result." },
    });
  });

  it("Workflow builder addStep supports onFail config", () => {
    const workflow = new Workflow("sdk-back-edge")
      .addStep({ id: "implement", actor: "coder" })
      .addStep({
        id: "verify",
        actor: "verifier",
        depends: ["implement"],
        onFail: {
          goto: "implement",
          maxIterations: 3,
          escalateOnExhaust: "human",
          cooldownMs: 25,
          resetState: true,
          maxCost: 0.1,
          maxCostEscalation: null,
        },
      })
      .toDefinition();

    expect(workflow.steps[1]!.on_fail).toEqual({
      goto: "implement",
      max_iterations: 3,
      escalate_on_exhaust: "human",
      cooldown_ms: 25,
      reset_state: true,
      max_cost: 0.1,
      max_cost_escalation: null,
    });
  });

  it("Workflow builder omits maxCostEscalation as null (inherit escalateOnExhaust)", () => {
    const workflow = new Workflow("sdk-back-edge-inherit")
      .addStep({ id: "implement", actor: "coder" })
      .addStep({
        id: "verify",
        actor: "verifier",
        depends: ["implement"],
        onFail: {
          goto: "implement",
          maxIterations: 2,
          escalateOnExhaust: "dlq",
          maxCost: 0.05,
        },
      })
      .toDefinition();

    expect(workflow.steps[1]!.on_fail?.max_cost_escalation).toBeNull();
    expect(workflow.steps[1]!.on_fail?.escalate_on_exhaust).toBe("dlq");
  });

  it("Policy.fromYaml loads policy from YAML", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-sdk-policy-"));
    const path = join(dir, "policy.yaml");
    await writeFile(path, "version: v1\ntools:\n  web_search:\n    allowed: true\n");

    const policy = await Policy.fromYaml(path);
    expect(policy.version).toBe("v1");
    expect(policy.tools?.web_search?.allowed).toBe(true);
  });

  it("Agent subclass can be instantiated and execute", async () => {
    class EchoAgent extends Agent {
      readonly name = "echo";

      async execute(ctx: AgentContext) {
        return {
          output: {
            executionId: ctx.executionId,
            stepName: ctx.stepName,
            input: ctx.input,
          },
          metadata: {
            agent: this.name,
          },
        };
      }
    }

    const agent = new EchoAgent();
    const result = await agent.execute({
      executionId: "exec-1",
      stepName: "step-1",
      input: { hello: "world" },
    });

    expect(agent.name).toBe("echo");
    expect(result.output).toEqual({
      executionId: "exec-1",
      stepName: "step-1",
      input: { hello: "world" },
    });
    expect(result.metadata).toEqual({ agent: "echo" });
  });

  it("OboraRuntime.loadWorkflow integrates with run", async () => {
    const restoreEnv = withNoLLMEnv();
    try {
      const dir = await mkdtemp(join(tmpdir(), "obora-sdk-runtime-"));
      const workflowPath = join(dir, "runtime-workflow.yaml");
      const policyPath = join(dir, "runtime-policy.yaml");

      await writeFile(workflowPath, "name: runtime-loaded\nsteps:\n  - name: first\n");
      await writeFile(policyPath, "version: v1\ntools:\n  any:\n    allowed: true\n");

      const runtime = new OboraRuntime({
        policyPath,
        llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      });
      const adapterMock = {
        chatCompletion: vi.fn().mockResolvedValue({
          message: { role: "assistant", content: "ok" },
          model: "gpt-5",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        }),
      };
      vi.spyOn(runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> }, "createLLMAdapter").mockResolvedValue(adapterMock);
      await runtime.loadWorkflow(workflowPath);

      const handle = await runtime.run("runtime-loaded", { input: { a: 1 } });
      const execution = await handle.wait();

      expect(execution.workflowName).toBe("runtime-loaded");
      expect(execution.status).toBe("completed");
    } finally {
      restoreEnv();
    }
  });

  it("OboraRuntime.loadWorkflow runs one-file validation-repair YAML", async () => {
    const restoreEnv = withNoLLMEnv();
    try {
      const dir = await mkdtemp(join(tmpdir(), "obora-sdk-one-file-"));
      const workflowPath = join(dir, "one-file-validation-repair.yaml");
      const policyPath = join(dir, "runtime-policy.yaml");

      await writeFile(
        workflowPath,
        [
          "name: runtime-one-file-validation-repair",
          "mode: validation-repair",
          "agents:",
          "  repair: builder",
          "  validator: validator",
          "prompts:",
          "  repair: Repair the artifact.",
          "  validate: Validate and emit structured result.",
          "loop:",
          "  max_iterations: 4",
          "  no_progress_ceiling: 2",
          "  repeated_critical_issue_ceiling: 2",
          "",
        ].join("\n"),
      );
      await writeFile(policyPath, "version: v1\ntools:\n  any:\n    allowed: true\n");

      const runtime = new OboraRuntime({
        policyPath,
        llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      });
      const adapterMock = {
        chatCompletion: vi.fn().mockImplementation(async ({ messages }: any) => {
          const last = messages?.[messages.length - 1]?.content ?? "";
          if (String(last).includes("structured result")) {
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
              model: "gpt-5",
              usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
            };
          }
          return {
            message: { role: "assistant", content: "repaired" },
            model: "gpt-5",
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          };
        }),
      };
      vi.spyOn(runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> }, "createLLMAdapter").mockResolvedValue(adapterMock);
      await runtime.loadWorkflow(workflowPath);

      const handle = await runtime.run("runtime-one-file-validation-repair", { input: { a: 1 } });
      const execution = await handle.wait();

      expect(execution.workflowName).toBe("runtime-one-file-validation-repair");
      expect(execution.status).toBe("completed");
      expect(execution.stepOrder).toEqual(["build_or_repair", "validate"]);
    } finally {
      restoreEnv();
    }
  });

  it("OboraRuntime.loadWorkflow runs one-file research-loop YAML", async () => {
    const restoreEnv = withNoLLMEnv();
    try {
      const dir = await mkdtemp(join(tmpdir(), "obora-sdk-one-file-research-"));
      const workflowPath = join(dir, "one-file-research-loop.yaml");
      const policyPath = join(dir, "runtime-policy.yaml");

      await writeFile(
        workflowPath,
        [
          "name: runtime-one-file-research-loop",
          "mode: research-loop",
          "problem:",
          "  statement: Evaluate one-file workflow UX.",
          "  goal: Produce a bounded research conclusion.",
          "agents:",
          "  researcher: researcher",
          "  reviewer: reviewer",
          "loop:",
          "  max_iterations: 3",
          "archive:",
          "  enabled: true",
          "output:",
          "  root: ./research-output",
          "",
        ].join("\n"),
      );
      await writeFile(policyPath, "version: v1\ntools:\n  any:\n    allowed: true\n");

      const runtime = new OboraRuntime({
        policyPath,
        llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      });
      const adapterMock = {
        chatCompletion: vi.fn().mockResolvedValue({
          message: { role: "assistant", content: "ok" },
          model: "gpt-5",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        }),
      };
      vi.spyOn(runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> }, "createLLMAdapter").mockResolvedValue(adapterMock);
      await runtime.loadWorkflow(workflowPath);

      const handle = await runtime.run("runtime-one-file-research-loop", { input: { a: 1 } });
      const execution = await handle.wait();

      expect(execution.workflowName).toBe("runtime-one-file-research-loop");
      expect(execution.status).toBe("completed");
      expect(execution.stepOrder).toEqual(["problem_frame", "research", "review"]);
    } finally {
      restoreEnv();
    }
  });

  it("OboraRuntime.loadWorkflow runs one-file proof-loop YAML", async () => {
    const restoreEnv = withNoLLMEnv();
    try {
      const dir = await mkdtemp(join(tmpdir(), "obora-sdk-one-file-proof-"));
      const workflowPath = join(dir, "one-file-proof-loop.yaml");
      const policyPath = join(dir, "runtime-policy.yaml");

      await writeFile(
        workflowPath,
        [
          "name: runtime-one-file-proof-loop",
          "mode: proof-loop",
          "problem:",
          "  statement: Prove that the sum of cubes identity holds.",
          "  domain: positive integers",
          "  goal: Produce a bounded proof-search conclusion.",
          "agents:",
          "  framer: framer",
          "  prover: prover",
          "  reviewer: reviewer",
          "loop:",
          "  max_iterations: 3",
          "archive:",
          "  enabled: true",
          "output:",
          "  root: ./proof-output",
          "",
        ].join("\n"),
      );
      await writeFile(policyPath, "version: v1\ntools:\n  any:\n    allowed: true\n");

      const runtime = new OboraRuntime({
        policyPath,
        llm: { provider: "openai", apiKey: "test-key", model: "gpt-5" },
      });
      const adapterMock = {
        chatCompletion: vi.fn().mockResolvedValue({
          message: { role: "assistant", content: "ok" },
          model: "gpt-5",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        }),
      };
      vi.spyOn(runtime as unknown as { createLLMAdapter: () => Promise<typeof adapterMock> }, "createLLMAdapter").mockResolvedValue(adapterMock);
      await runtime.loadWorkflow(workflowPath);

      const handle = await runtime.run("runtime-one-file-proof-loop", { input: { a: 1 } });
      const execution = await handle.wait();

      expect(execution.workflowName).toBe("runtime-one-file-proof-loop");
      expect(execution.status).toBe("completed");
      expect(execution.stepOrder).toEqual(["problem_frame", "known_results_audit", "proof_attempt", "review"]);
    } finally {
      restoreEnv();
    }
  });

  it("loadWorkflow throws OboraError for invalid YAML workflow", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-sdk-invalid-workflow-"));
    const workflowPath = join(dir, "invalid-workflow.yaml");
    await writeFile(workflowPath, "steps:\n  - name: missing-name\n");

    await expect(new OboraRuntime().loadWorkflow(workflowPath)).rejects.toMatchObject({
      name: "OboraError",
      code: OboraErrorCode.SDK_INVALID_WORKFLOW,
    });
  });
});
