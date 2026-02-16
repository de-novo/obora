import { describe, expect, it } from "vitest";

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

  it("supports condition expression and skips binding when condition is false", async () => {
    const state = new StateManager();
    const binder = new DefaultStateBinder(state);

    await binder.bind(createCellResult({ summary: null }), [
      {
        source: "output.summary",
        target: "knowledge.generation_summary",
        condition: "value != null",
      },
    ]);

    expect(() => state.read("knowledge.generation_summary")).toThrowError("Path not found");
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
});
