import { describe, expect, it } from "vitest";

import { PLUGIN_TYPES, validatePluginMetadata } from "../index.js";

describe("plugin metadata validation", () => {
  const packageName = "@acme/obora-plugin";

  it("passes valid metadata", () => {
    const metadata = validatePluginMetadata(packageName, {
      type: "tool",
      exports: "./dist/index.js",
      name: "acme-tool",
    });

    expect(metadata).toEqual({
      type: "tool",
      exports: "./dist/index.js",
      name: "acme-tool",
    });
  });

  it("throws SDK_9001 when obora field is missing", () => {
    expect(() => validatePluginMetadata(packageName, undefined)).toThrowError(
      /missing or invalid "obora" field/,
    );

    try {
      validatePluginMetadata(packageName, undefined);
    } catch (error) {
      expect((error as { code?: string }).code).toBe("SDK_9001");
    }
  });

  it("throws for invalid type and lists valid types", () => {
    expect(() =>
      validatePluginMetadata(packageName, {
        type: "policy",
        exports: "./dist/index.js",
        name: "invalid-plugin",
      }),
    ).toThrowError(`Must be one of: ${PLUGIN_TYPES.join(", ")}`);
  });

  it("throws when exports is missing", () => {
    expect(() =>
      validatePluginMetadata(packageName, {
        type: "tool",
        name: "missing-exports",
      }),
    ).toThrowError(/"obora.exports" is required/);
  });

  it("throws when name is missing", () => {
    expect(() =>
      validatePluginMetadata(packageName, {
        type: "tool",
        exports: "./dist/index.js",
      }),
    ).toThrowError(/"obora.name" is required/);
  });

  it("accepts all valid plugin types", () => {
    for (const type of PLUGIN_TYPES) {
      const metadata = validatePluginMetadata(packageName, {
        type,
        exports: "./dist/index.js",
        name: `plugin-${type}`,
      });

      expect(metadata.type).toBe(type);
    }
  });

  it("rejects alias types", () => {
    const aliases = ["policy", "audit", "recovery", "consensus", "transform"];

    for (const alias of aliases) {
      expect(() =>
        validatePluginMetadata(packageName, {
          type: alias,
          exports: "./dist/index.js",
          name: `alias-${alias}`,
        }),
      ).toThrowError(/invalid type/);
    }
  });
});
