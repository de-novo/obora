import { describe, expect, it } from "vitest";

import { OboraErrorCode } from "../runtime.js";
import { MockAgent } from "../testing/mock-agent.js";
import { MockTool } from "../testing/mock-tool.js";
import { runWorkflowTest } from "../testing/test-runner.js";

describe("runWorkflowTest", () => {
  it("passes on matching completed status", async () => {
    const writer = new MockAgent("writer", (ctx) => ({ output: { step: ctx.stepName } }));

    const result = await runWorkflowTest({
      name: "status-pass",
      workflow: {
        name: "wf-status-pass",
        steps: [{ name: "draft", agent: "writer" }],
      },
      mocks: { agents: [writer] },
      expect: { status: "completed" },
    });

    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it("fails when expected status does not match", async () => {
    const writer = new MockAgent("writer", () => ({ output: "ok" }));

    const result = await runWorkflowTest({
      name: "status-fail",
      workflow: {
        name: "wf-status-fail",
        steps: [{ name: "draft", agent: "writer" }],
      },
      mocks: { agents: [writer] },
      expect: { status: "failed" },
    });

    expect(result.passed).toBe(false);
    expect(result.failures[0]?.field).toBe("status");
  });

  it("matches event expectations via contains", async () => {
    const writer = new MockAgent("writer", () => ({ output: { text: "hello" } }));

    const result = await runWorkflowTest({
      name: "event-contains",
      workflow: {
        name: "wf-event",
        steps: [{ name: "draft", agent: "writer" }],
      },
      mocks: { agents: [writer] },
      expect: {
        status: "completed",
        events: [
          {
            type: "step_end",
            contains: { stepName: "draft", status: "completed" },
          },
        ],
      },
    });

    expect(result.passed).toBe(true);
  });

  it("matches expected error codes", async () => {
    const result = await runWorkflowTest({
      name: "error-codes",
      workflow: {
        name: "wf-error",
        steps: [{ name: "missing-tool", tool: "search" }],
      },
      expect: {
        status: "failed",
        errors: [{ code: OboraErrorCode.ADAPTER_TOOL_NOT_FOUND }],
      },
    });

    expect(result.passed).toBe(true);
  });

  it("calls mock agents for agent steps", async () => {
    const writer = new MockAgent("writer", () => ({ output: "ok" }));

    const result = await runWorkflowTest({
      name: "agent-calls",
      workflow: {
        name: "wf-agent-calls",
        steps: [{ name: "draft", agent: "writer" }],
      },
      mocks: { agents: [writer] },
      expect: { status: "completed" },
    });

    expect(result.passed).toBe(true);
    expect(writer.callCount()).toBe(1);
    expect(writer.calledWith("draft")).toBe(true);
  });

  it("calls mock tools for tool steps", async () => {
    const formatter = new MockTool("format", (params) => ({ ok: true, params }));

    const result = await runWorkflowTest({
      name: "tool-calls",
      workflow: {
        name: "wf-tool-calls",
        steps: [{ name: "fmt", tool: "format", config: { input: { value: 7 } } }],
      },
      mocks: { tools: [formatter] },
      expect: {
        status: "completed",
        events: [{ type: "tool_call", contains: { tool: "format" } }],
      },
    });

    expect(result.passed).toBe(true);
    expect(formatter.callCount()).toBe(1);
    expect(formatter.calledWith({ value: 7 })).toBe(true);
  });

  it("includes duration in test result", async () => {
    const writer = new MockAgent("writer", () => ({ output: "ok" }));

    const result = await runWorkflowTest({
      name: "duration",
      workflow: {
        name: "wf-duration",
        steps: [{ name: "draft", agent: "writer" }],
      },
      mocks: { agents: [writer] },
      expect: { status: "completed" },
    });

    expect(result.duration).toBeTypeOf("number");
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });
});
