import { describe, expect, it } from "vitest";

import { Agent } from "../agent.js";
import type { AgentContext } from "../agent.js";
import { MockAgent } from "../testing/mock-agent.js";

const baseContext: AgentContext = {
  executionId: "exec-1",
  stepName: "draft",
  input: { topic: "mock" },
};

describe("MockAgent", () => {
  it("extends Agent", () => {
    const agent = new MockAgent("mock-agent");

    expect(agent).toBeInstanceOf(Agent);
  });

  it("execute() uses step-specific handler", async () => {
    const agent = new MockAgent("mock-agent").onStep("draft", (ctx) => ({
      output: `handled:${ctx.stepName}`,
    }));

    const result = await agent.execute(baseContext);

    expect(result).toEqual({ output: "handled:draft" });
  });

  it("execute() falls back to default handler", async () => {
    const agent = new MockAgent("mock-agent", (ctx) => ({
      output: `default:${ctx.stepName}`,
    }));

    const result = await agent.execute(baseContext);

    expect(result).toEqual({ output: "default:draft" });
  });

  it("execute() returns unhandled result when no handler exists", async () => {
    const agent = new MockAgent("mock-agent");

    const result = await agent.execute(baseContext);

    expect(result).toEqual({
      output: null,
      metadata: {
        mock: true,
        unhandled: true,
      },
    });
  });

  it("tracks calls with calls/calledWith/callCount", async () => {
    const agent = new MockAgent("mock-agent", () => ({ output: "ok" }));

    await agent.execute({ ...baseContext, stepName: "draft" });
    await agent.execute({ ...baseContext, stepName: "review" });
    await agent.execute({ ...baseContext, stepName: "draft" });

    expect(agent.calls).toHaveLength(3);
    expect(agent.calledWith("draft")).toBe(true);
    expect(agent.calledWith("publish")).toBe(false);
    expect(agent.callCount()).toBe(3);
    expect(agent.callCount("draft")).toBe(2);
    expect(agent.callCount("review")).toBe(1);
  });

  it("reset() clears call log", async () => {
    const agent = new MockAgent("mock-agent", () => ({ output: "ok" }));

    await agent.execute(baseContext);
    expect(agent.callCount()).toBe(1);

    agent.reset();
    expect(agent.callCount()).toBe(0);
    expect(agent.calls).toHaveLength(0);
  });

  it("onStep() is chainable", () => {
    const agent = new MockAgent("mock-agent");

    const chained = agent.onStep("a", () => ({ output: 1 })).onStep("b", () => ({ output: 2 }));

    expect(chained).toBe(agent);
  });
});
