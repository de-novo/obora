import { describe, expect, it } from "vitest";
import {
  deleteByPath,
  getByPath,
  getParentPath,
  isSubPath,
  isValidPath,
  joinPath,
  normalizePath,
  parsePath,
  setByPath,
} from "../path-utils";

describe("path-utils", () => {
  it("reads object, map, and array paths while rejecting dangerous segments", () => {
    const source = {
      state: {
        context: {
          nested: new Map<string, unknown>([
            ["items", [{ name: "first" }, { name: "second" }]],
          ]),
        },
      },
    };

    expect(getByPath(source, "")).toBe(source);
    expect(getByPath<string>(source, "state.context.nested.items.1.name")).toBe("second");
    expect(getByPath(source, "state.context.nested.items.0.name.extra")).toBeUndefined();
    expect(getByPath(source, "state.context.nested.items.2.name")).toBeUndefined();
    expect(getByPath(source, "state.context.nested.items.bad.name")).toBeUndefined();
    expect(getByPath(42, "state.context")).toBeUndefined();
    expect(() => getByPath(source, "state.__proto__.polluted")).toThrow(
      /Invalid path segment/
    );
  });

  it("sets paths immutably and creates missing branches", () => {
    const source = {
      state: {
        context: {
          count: 1,
          replaceMe: "leaf",
        },
      },
    };

    const updated = setByPath(source, "state.context.count", 2);
    expect(updated).toEqual({
      state: {
        context: {
          count: 2,
          replaceMe: "leaf",
        },
      },
    });
    expect(source.state.context.count).toBe(1);

    expect(setByPath(source, "state.context.created.value", "ok")).toMatchObject({
      state: { context: { created: { value: "ok" } } },
    });
    expect(setByPath(source, "state.context.replaceMe.child", true)).toMatchObject({
      state: { context: { replaceMe: { child: true } } },
    });
    expect(setByPath(source, "", { replaced: true })).toEqual({ replaced: true });
    expect(setByPath(42, "state.context.count", 3)).toBe(42);
    expect(() => setByPath(source, "state.constructor.value", 1)).toThrow(
      /Invalid path segment/
    );
  });

  it("deletes paths immutably and preserves source when traversal is impossible", () => {
    const source = {
      state: {
        context: {
          removeMe: true,
          keepMe: true,
          scalar: 1,
        },
      },
      meta: { version: 1 },
    };

    const rootDeleted = deleteByPath(source, "meta");
    expect(rootDeleted).toEqual({
      state: {
        context: {
          removeMe: true,
          keepMe: true,
          scalar: 1,
        },
      },
    });
    expect(source.meta).toEqual({ version: 1 });

    expect(deleteByPath(source, "state.context.removeMe")).toEqual({
      state: {
        context: {
          keepMe: true,
          scalar: 1,
        },
      },
      meta: { version: 1 },
    });
    expect(deleteByPath(source, "")).toBe(source);
    expect(deleteByPath(source, "state.missing.value")).toBe(source);
    expect(deleteByPath(source, "state.context.scalar.value")).toBe(source);
    expect(deleteByPath(42, "state.context")).toBe(42);
    expect(() => deleteByPath(source, "state.prototype.value")).toThrow(
      /Invalid path segment/
    );
  });

  it("normalizes, parses, joins, and compares valid blackboard paths", () => {
    expect(normalizePath(" . state .. context . value . ")).toBe("state.context.value");
    expect(parsePath(".state..context.value.")).toEqual({
      section: "state",
      segments: ["context", "value"],
      full: "state.context.value",
    });
    expect(parsePath("knowledge.facts")).toEqual({
      section: "knowledge",
      segments: ["facts"],
      full: "knowledge.facts",
    });
    expect(() => parsePath("")).toThrow(/Invalid path/);
    expect(() => parsePath("runtime.state")).toThrow(/Invalid section/);

    expect(isValidPath("state.context")).toBe(true);
    expect(isValidPath("state.__proto__")).toBe(false);
    expect(isValidPath("runtime.state")).toBe(false);
    expect(joinPath(" state. ", ".context", "..value ")).toBe("state.context.value");
    expect(isSubPath("state.context", "state.context.value")).toBe(true);
    expect(isSubPath("state.context", "state.context")).toBe(false);
    expect(isSubPath("state.context", "state.contextual.value")).toBe(false);
    expect(getParentPath("state.context.value")).toBe("state.context");
    expect(getParentPath("state.context.value", 2)).toBe("state");
    expect(getParentPath("state.context", 3)).toBe("");
  });
});
