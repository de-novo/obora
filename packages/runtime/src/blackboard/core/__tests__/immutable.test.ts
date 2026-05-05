import { describe, expect, it } from "vitest";

import { deepClone, deepFreeze, immutableUpdate, mapToObject, merge, objectToMap } from "../immutable";

describe("immutable utilities", () => {
  it("deep clones dates, maps, sets, arrays, and circular object references", () => {
    interface CircularRecord {
      name: string;
      createdAt: Date;
      map: Map<string, { value: number }>;
      set: Set<{ value: number }>;
      list: Array<{ value: number }>;
      self?: CircularRecord;
    }
    const original: CircularRecord = {
      name: "runtime",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      map: new Map([["item", { value: 1 }]]),
      set: new Set([{ value: 2 }]),
      list: [{ value: 3 }],
    };
    original.self = original;

    const cloned = deepClone(original);
    cloned.createdAt.setUTCFullYear(2030);
    cloned.map.get("item")!.value = 10;
    [...cloned.set][0].value = 20;
    cloned.list[0].value = 30;

    expect(cloned).not.toBe(original);
    expect(cloned.self).toBe(cloned);
    expect(original.createdAt.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(original.map.get("item")?.value).toBe(1);
    expect([...original.set][0].value).toBe(2);
    expect(original.list[0].value).toBe(3);
  });

  it("deep freezes nested objects", () => {
    const frozen = deepFreeze({ nested: { value: 1 }, list: [{ value: 2 }] });

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.nested)).toBe(true);
    expect(Object.isFrozen(frozen.list)).toBe(true);
    expect(Object.isFrozen(frozen.list[0])).toBe(true);
    expect(() => {
      frozen.nested.value = 2;
    }).toThrow(TypeError);
  });

  it("updates missing and existing paths without mutating the original object", () => {
    const original = { state: { count: 1 } };

    const updatedExisting = immutableUpdate(original, "state.count", (value) => Number(value) + 1);
    const updatedMissing = immutableUpdate(original, "state.details.enabled", () => true);

    expect(updatedExisting).toEqual({ state: { count: 2 } });
    expect(updatedMissing).toEqual({ state: { count: 1, details: { enabled: true } } });
    expect(original).toEqual({ state: { count: 1 } });
  });

  it("converts maps and objects while preserving typed keys", () => {
    const map = new Map<"a" | "b", number>([
      ["a", 1],
      ["b", 2],
    ]);
    const object = mapToObject(map);

    expect(object).toEqual({ a: 1, b: 2 });
    expect(objectToMap(object)).toEqual(map);
  });

  it("merges nested records immutably and clones source values", () => {
    const source = { nested: { b: 2 }, list: [1, 2] };
    const result = merge({ nested: { a: 1 }, keep: true } as Record<string, unknown>, source);

    expect(result).toEqual({ nested: { a: 1, b: 2 }, keep: true, list: [1, 2] });
    expect(result.nested).not.toBe(source.nested);
    expect(result.list).not.toBe(source.list);
  });
});
