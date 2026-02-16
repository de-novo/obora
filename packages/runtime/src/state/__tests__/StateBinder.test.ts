import { describe, expect, it, vi } from "vitest";

import type { CellResult } from "../../cell/types.js";
import { DefaultStateBinder } from "../StateBinder.js";
import { StateManager } from "../StateManager.js";

function createCellResult(output: unknown): CellResult {
  const now = new Date();
  return {
    success: true,
    output,
    stateChanges: [],
    toolCalls: [],
    metrics: {
      startTime: now,
      endTime: now,
      durationMs: 0,
      toolCallCount: 0,
    },
  };
}

describe("DefaultStateBinder", () => {
  it("binds source value from CellResult into StateManager target path", async () => {
    const state = new StateManager();
    const binder = new DefaultStateBinder(state);

    await binder.bind(createCellResult({ files: ["index.ts", "app.ts"] }), [
      {
        source: "output.files",
        target: "knowledge.generated_code",
      },
    ]);

    expect(state.read("knowledge.generated_code")).toEqual(["index.ts", "app.ts"]);
  });

  it("supports safe condition expression parser and skips binding when condition is false", async () => {
    const state = new StateManager();
    const binder = new DefaultStateBinder(state);

    await binder.bind(createCellResult({ summary: null, score: 7 }), [
      {
        source: "output.summary",
        target: "knowledge.generation_summary",
        condition: "value != null && cellResult.output.score >= 9",
      },
    ]);

    expect(() => state.read("knowledge.generation_summary")).toThrowError("Path not found");
  });

  it("throws for unsupported condition tokens instead of executing arbitrary code", async () => {
    const state = new StateManager();
    const binder = new DefaultStateBinder(state);

    await expect(
      binder.bind(createCellResult({ summary: "ok" }), [
        {
          source: "output.summary",
          target: "knowledge.generation_summary",
          condition: "(() => true)()",
        },
      ])
    ).rejects.toThrow(/Unsupported token|Unexpected/);
  });

  it("applies built-in global transform function (JSON.parse)", async () => {
    const state = new StateManager();
    const binder = new DefaultStateBinder(state);

    await binder.bind(createCellResult({ payload: '{"score": 9, "approved": true}' }), [
      {
        source: "output.payload",
        target: "decisions.current",
        transform: "JSON.parse",
      },
    ]);

    expect(state.read("decisions.current")).toEqual({ score: 9, approved: true });
  });

  it("applies custom transform from registry", async () => {
    const state = new StateManager();
    const binder = new DefaultStateBinder(state, {
      transforms: {
        "normalize.file-list": (value) => {
          if (!Array.isArray(value)) {
            return [];
          }
          return value.map((item) => String(item).toLowerCase());
        },
      },
    });

    await binder.bind(createCellResult({ files: ["SRC/MAIN.TS", "README.MD"] }), [
      {
        source: "output.files",
        target: "knowledge.normalized_files",
        transform: "normalize.file-list",
      },
    ]);

    expect(state.read("knowledge.normalized_files")).toEqual(["src/main.ts", "readme.md"]);
  });

  it("supports JSONPath-lite array index access", async () => {
    const state = new StateManager();
    const binder = new DefaultStateBinder(state);

    await binder.bind(createCellResult({ reviews: [{ score: 8 }, { score: 10 }] }), [
      {
        source: "output.reviews[1].score",
        target: "decisions.voting.latest_score",
      },
    ]);

    expect(state.read("decisions.voting.latest_score")).toBe(10);
  });

  it("records state_change audit event when binding writes state", async () => {
    const state = new StateManager();
    const recordStateChange = vi.fn(async () => undefined);
    const binder = new DefaultStateBinder(state, {
      auditRecorder: {
        recordStateChange,
      },
    });

    await binder.bind(createCellResult({ score: 9 }), [
      {
        source: "output.score",
        target: "decisions.review.score",
      },
    ]);

    expect(recordStateChange).toHaveBeenCalledTimes(1);
    expect(recordStateChange).toHaveBeenCalledWith("decisions.review.score", undefined, 9);
  });

  it("records old and new values for repeated bindings", async () => {
    const state = new StateManager();
    const recordStateChange = vi.fn(async () => undefined);
    const binder = new DefaultStateBinder(state, {
      auditRecorder: {
        recordStateChange,
      },
    });

    await binder.bind(createCellResult({ score: 7 }), [
      {
        source: "output.score",
        target: "decisions.review.score",
      },
    ]);

    await binder.bind(createCellResult({ score: 10 }), [
      {
        source: "output.score",
        target: "decisions.review.score",
      },
    ]);

    expect(recordStateChange).toHaveBeenNthCalledWith(1, "decisions.review.score", undefined, 7);
    expect(recordStateChange).toHaveBeenNthCalledWith(2, "decisions.review.score", 7, 10);
  });
});
