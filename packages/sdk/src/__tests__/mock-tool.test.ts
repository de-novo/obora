import { describe, expect, it } from "vitest";

import { MockTool } from "../testing/mock-tool.js";
import type { ToolContext } from "../testing/mock-tool.js";

const baseContext: ToolContext = {
  executionId: "exec-1",
  stepName: "tool-step",
};

describe("MockTool", () => {
  it("execute() delegates to executor", async () => {
    const tool = new MockTool("format", (params, ctx) => ({
      params,
      step: ctx.stepName,
    }));

    const result = await tool.execute({ value: 42 }, baseContext);

    expect(result).toEqual({
      params: { value: 42 },
      step: "tool-step",
    });
  });

  it("tracks calls with calls/calledWith/callCount", async () => {
    const tool = new MockTool("format", (params) => params);

    await tool.execute({ value: 1 }, baseContext);
    await tool.execute({ value: 2 }, baseContext);

    expect(tool.calls).toHaveLength(2);
    expect(tool.calledWith({ value: 1 })).toBe(true);
    expect(tool.calledWith({ value: 3 })).toBe(false);
    expect(tool.callCount()).toBe(2);
  });

  it("reset() clears call log", async () => {
    const tool = new MockTool("format", (params) => params);

    await tool.execute({ value: 1 }, baseContext);
    expect(tool.callCount()).toBe(1);

    tool.reset();
    expect(tool.callCount()).toBe(0);
    expect(tool.calls).toHaveLength(0);
  });

  it("supports async executor", async () => {
    const tool = new MockTool("format", async (params) => ({
      ok: true,
      params,
    }));

    const result = await tool.execute({ value: "async" }, baseContext);

    expect(result).toEqual({
      ok: true,
      params: { value: "async" },
    });
  });
});
