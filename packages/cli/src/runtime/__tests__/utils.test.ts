import { describe, expect, it } from "vitest";

import { deepFreeze, parseDuration } from "../utils.js";

describe("parseDuration", () => {
  it("parses supported duration units", () => {
    expect(parseDuration("1s")).toBe(1_000);
    expect(parseDuration("2m")).toBe(120_000);
    expect(parseDuration("3h")).toBe(10_800_000);
    expect(parseDuration("4d")).toBe(345_600_000);
  });

  it("rejects invalid duration formats", () => {
    expect(() => parseDuration("1ms")).toThrow("Invalid duration format");
    expect(() => parseDuration("abc")).toThrow("Invalid duration format");
  });
});

describe("deepFreeze", () => {
  it("returns primitives and null unchanged", () => {
    expect(deepFreeze(null)).toBeNull();
    expect(deepFreeze("value")).toBe("value");
  });

  it("recursively freezes object and symbol-key children", () => {
    const symbol = Symbol("secret");
    const value = {
      child: { count: 1 },
      [symbol]: { enabled: true },
    };

    const frozen = deepFreeze(value);

    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.child)).toBe(true);
    expect(Object.isFrozen(frozen[symbol])).toBe(true);
  });

  it("returns an already frozen object without traversing again", () => {
    const value = Object.freeze({ child: { count: 1 } });

    const frozen = deepFreeze(value);

    expect(frozen).toBe(value);
    expect(Object.isFrozen(frozen.child)).toBe(false);
  });
});
