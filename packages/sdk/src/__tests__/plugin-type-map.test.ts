import { describe, expect, it } from "vitest";

import { PLUGIN_TYPES } from "../plugin-types.js";
import { resolvePluginType } from "../plugin-type-map.js";

describe("plugin type map", () => {
  it("resolves all 8 aliases", () => {
    expect(resolvePluginType("pattern")).toBe("pattern");
    expect(resolvePluginType("policy")).toBe("policy-rule");
    expect(resolvePluginType("tool")).toBe("tool");
    expect(resolvePluginType("agent")).toBe("agent");
    expect(resolvePluginType("audit")).toBe("audit-store");
    expect(resolvePluginType("recovery")).toBe("recovery-strategy");
    expect(resolvePluginType("gate")).toBe("consensus-rule");
    expect(resolvePluginType("state")).toBe("state-transform");
  });

  it("passes through canonical plugin types", () => {
    for (const type of PLUGIN_TYPES) {
      expect(resolvePluginType(type)).toBe(type);
    }
  });

  it("throws SDK_9001 on unknown type", () => {
    expect(() => resolvePluginType("unknown-type")).toThrowError(/Unknown plugin type/);

    try {
      resolvePluginType("unknown-type");
    } catch (error) {
      expect((error as { code?: string }).code).toBe("SDK_9001");
    }
  });
});
