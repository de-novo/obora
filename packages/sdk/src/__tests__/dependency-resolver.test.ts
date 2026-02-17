import { describe, expect, it } from "vitest";

import { groupByParallelizableLevels, topologicalSort } from "../dependency-resolver.js";

describe("dependency-resolver", () => {
  it("sorts steps by dependency", () => {
    const sorted = topologicalSort([
      { name: "c", depends_on: ["b"] },
      { name: "a" },
      { name: "b", depends_on: ["a"] },
    ]);

    expect(sorted.map((step) => step.name)).toEqual(["a", "b", "c"]);
  });

  it("groups parallelizable levels", () => {
    const groups = groupByParallelizableLevels([
      { name: "a" },
      { name: "b" },
      { name: "c", depends_on: ["a", "b"] },
    ]);

    expect(groups.map((group) => group.map((step) => step.name))).toEqual([["a", "b"], ["c"]]);
  });

  it("throws on duplicate step names", () => {
    expect(() => topologicalSort([
      { name: "a" },
      { name: "a" },
    ])).toThrow("Duplicate workflow step name");
  });

  it("throws on cycle", () => {
    expect(() => topologicalSort([
      { name: "a", depends_on: ["b"] },
      { name: "b", depends_on: ["a"] },
    ])).toThrow("Circular dependency");
  });
});
