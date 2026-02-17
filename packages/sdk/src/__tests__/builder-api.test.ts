import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { Agent, type AgentContext } from "../agent.js";
import { Policy } from "../policy.js";
import { OboraError, OboraErrorCode, OboraRuntime } from "../runtime.js";
import { Workflow } from "../workflow.js";

describe("builder API", () => {
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

  it("Policy.fromYaml loads policy from YAML", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-sdk-policy-"));
    const path = join(dir, "policy.yaml");
    await writeFile(path, "version: v1\ntools:\n  web_search:\n    allowed: true\n");

    const policy = await Policy.fromYaml(path);
    expect(policy.version).toBe("v1");
    expect(policy.tools?.web_search.allowed).toBe(true);
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
    const dir = await mkdtemp(join(tmpdir(), "obora-sdk-runtime-"));
    const workflowPath = join(dir, "runtime-workflow.yaml");
    const policyPath = join(dir, "runtime-policy.yaml");

    await writeFile(workflowPath, "name: runtime-loaded\nsteps:\n  - name: first\n");
    await writeFile(policyPath, "version: v1\ntools:\n  any:\n    allowed: true\n");

    const runtime = new OboraRuntime({ policyPath });
    await runtime.loadWorkflow(workflowPath);

    const handle = await runtime.run("runtime-loaded", { input: { a: 1 } });
    const execution = await handle.wait();

    expect(execution.workflowName).toBe("runtime-loaded");
    expect(execution.status).toBe("completed");
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
