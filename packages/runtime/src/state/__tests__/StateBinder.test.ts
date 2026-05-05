import { describe, expect, it, vi } from "vitest";

import type { CellResult } from "../../cell/types.js";
import { __internal, DefaultStateBinder } from "../StateBinder.js";
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

  it("covers path helpers for empty, array, primitive, and missing function paths", () => {
    const source = {
      output: {
        items: [{ name: "first" }],
        count: 1,
      },
    };

    expect(__internal.parsePath("output.items[0].name")).toEqual(["output", "items", "0", "name"]);
    expect(__internal.parsePath("")).toEqual([]);
    expect(__internal.getByPath(source, "")).toBe(source);
    expect(__internal.getByPath(source, "output.items[0].name")).toBe("first");
    expect(__internal.getByPath(source, "output.items.foo.name")).toBeUndefined();
    expect(__internal.getByPath(source, "output.count.value")).toBeUndefined();
    expect(__internal.getByPath({ output: null }, "output.value")).toBeUndefined();
    expect(__internal.resolvePathFunction("JSON.parse")).toBe(JSON.parse);
    expect(__internal.resolvePathFunction("JSON.parse.missing")).toBeUndefined();
    expect(__internal.resolvePathFunction("Math.missing.deep")).toBeUndefined();
  });

  it("evaluates boolean, null, unary, parenthesized, and escaped string conditions", async () => {
    const state = new StateManager();
    const binder = new DefaultStateBinder(state);

    await binder.bind(createCellResult({ score: 5, flag: false, label: "can't ship" }), [
      {
        source: "output.score",
        target: "decisions.review.score",
        condition:
          "!(value < 5) && (value <= 5 || value == 7) && cellResult.output.flag == false && null == null",
      },
      {
        source: "output.label",
        target: "decisions.review.label",
        condition: "value == 'can\\'t ship'",
      },
    ]);

    expect(state.read("decisions.review.score")).toBe(5);
    expect(state.read("decisions.review.label")).toBe("can't ship");
  });

  it("surfaces condition parser and transform errors without writing state", async () => {
    const state = new StateManager();
    const binder = new DefaultStateBinder(state);

    await expect(
      binder.bind(createCellResult({ score: 5 }), [
        {
          source: "output.score",
          target: "decisions.review.score",
          condition: "'unterminated",
        },
      ])
    ).rejects.toThrow("Unterminated string literal");
    await expect(
      binder.bind(createCellResult({ score: 5 }), [
        {
          source: "output.score",
          target: "decisions.review.score",
          condition: "(value == 5",
        },
      ])
    ).rejects.toThrow("Missing closing ')'");
    await expect(
      binder.bind(createCellResult({ score: 5 }), [
        {
          source: "output.score",
          target: "decisions.review.score",
          condition: "value == 5 true",
        },
      ])
    ).rejects.toThrow("Unexpected trailing token");
    await expect(
      binder.bind(createCellResult({ score: 5 }), [
        {
          source: "output.score",
          target: "decisions.review.score",
          transform: "No.such.transform",
        },
      ])
    ).rejects.toThrow("Unknown transform");
    expect(() => state.read("decisions.review.score")).toThrow("Path not found");
  });

  it("uses injected condition evaluators before applying transforms", async () => {
    const state = new StateManager();
    const evaluateCondition = vi.fn(() => false);
    const transform = vi.fn((value: unknown) => value);
    const binder = new DefaultStateBinder(state, {
      evaluateCondition,
      transforms: { identity: transform },
    });

    await binder.bind(createCellResult({ score: 5 }), [
      {
        source: "output.score",
        target: "decisions.review.score",
        transform: "identity",
        condition: "custom-condition",
      },
    ]);

    expect(evaluateCondition).toHaveBeenCalledWith(
      "custom-condition",
      5,
      expect.objectContaining({ output: { score: 5 } }),
      expect.objectContaining({ target: "decisions.review.score" }),
    );
    expect(transform).not.toHaveBeenCalled();
    expect(() => state.read("decisions.review.score")).toThrow("Path not found");
  });
});
