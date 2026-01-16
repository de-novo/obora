import { describe, it, expect, vi } from "vitest";
import { createPresetValidator, displayValidationResults } from "../validator.js";
import type { PresetInfo } from "../types.js";

describe("validator", () => {
  const mockPresetRegistry: Record<string, PresetInfo> = {
    drizzle: {
      name: "drizzle",
      category: "database",
      description: "Drizzle ORM",
      version: "0.45.0",
    },
    clerk: {
      name: "clerk",
      category: "auth",
      description: "Clerk Auth",
      version: "1.0.0",
    },
    biome: {
      name: "biome",
      category: "linting",
      description: "Biome linter",
      version: "1.0.0",
    },
  };

  describe("createPresetValidator", () => {
    it("should create validator with config", () => {
      const validator = createPresetValidator({
        presetsDir: "/presets",
        presetRegistry: mockPresetRegistry,
      });

      expect(validator).toHaveProperty("validateAndResolvePresets");
      expect(validator).toHaveProperty("readPresetManifest");
    });
  });

  describe("validateAndResolvePresets", () => {
    it("should return empty result for empty selections", async () => {
      const validator = createPresetValidator({
        presetsDir: "/presets",
        presetRegistry: mockPresetRegistry,
        fileExists: vi.fn().mockResolvedValue(false),
        readJson: vi.fn(),
      });

      const result = await validator.validateAndResolvePresets({});

      expect(result.resolved).toEqual({});
      expect(result.added).toEqual([]);
      expect(result.conflicts).toEqual([]);
      expect(result.missingCapabilities).toEqual([]);
      expect(result.capabilityConflicts).toEqual([]);
    });

    it("should return unchanged selections when preset has no requirements", async () => {
      const mockFileExists = vi.fn().mockResolvedValue(true);
      const mockReadJson = vi.fn().mockResolvedValue({
        name: "biome",
        category: "linting",
      });

      const validator = createPresetValidator({
        presetsDir: "/presets",
        presetRegistry: mockPresetRegistry,
        fileExists: mockFileExists,
        readJson: mockReadJson,
      });

      const selections = {
        linting: { preset: "biome", version: "1.0.0" },
      };

      const result = await validator.validateAndResolvePresets(selections);

      expect(result.resolved).toEqual(selections);
      expect(result.added).toEqual([]);
      expect(result.conflicts).toEqual([]);
    });

    it("should auto-add required preset when missing", async () => {
      const mockFileExists = vi.fn().mockResolvedValue(true);
      const mockReadJson = vi.fn().mockResolvedValue({
        name: "clerk",
        category: "auth",
        requires: ["database:drizzle"],
      });

      const validator = createPresetValidator({
        presetsDir: "/presets",
        presetRegistry: mockPresetRegistry,
        fileExists: mockFileExists,
        readJson: mockReadJson,
      });

      const selections = {
        auth: { preset: "clerk", version: "1.0.0" },
      };

      const result = await validator.validateAndResolvePresets(selections);

      expect(result.resolved.database).toEqual({
        preset: "drizzle",
        version: "0.45.0",
      });
      expect(result.added).toContainEqual({
        category: "database",
        preset: "drizzle",
        requiredBy: "auth:clerk",
      });
    });

    it("should not add preset if already selected", async () => {
      const mockFileExists = vi.fn().mockResolvedValue(true);
      const mockReadJson = vi.fn().mockResolvedValue({
        name: "clerk",
        category: "auth",
        requires: ["database:drizzle"],
      });

      const validator = createPresetValidator({
        presetsDir: "/presets",
        presetRegistry: mockPresetRegistry,
        fileExists: mockFileExists,
        readJson: mockReadJson,
      });

      const selections = {
        auth: { preset: "clerk", version: "1.0.0" },
        database: { preset: "drizzle", version: "0.45.0" },
      };

      const result = await validator.validateAndResolvePresets(selections);

      expect(result.added).toEqual([]);
    });

    it("should detect conflicts between presets", async () => {
      const mockFileExists = vi.fn().mockResolvedValue(true);
      const mockReadJson = vi
        .fn()
        .mockResolvedValueOnce({
          name: "clerk",
          category: "auth",
          conflicts: ["better-auth"],
        })
        .mockResolvedValueOnce({
          name: "better-auth",
          category: "auth2",
        });

      const validator = createPresetValidator({
        presetsDir: "/presets",
        presetRegistry: {
          ...mockPresetRegistry,
          "better-auth": {
            name: "better-auth",
            category: "auth2",
            description: "Better Auth",
            version: "1.0.0",
          },
        },
        fileExists: mockFileExists,
        readJson: mockReadJson,
      });

      const selections = {
        auth: { preset: "clerk", version: "1.0.0" },
        auth2: { preset: "better-auth", version: "1.0.0" },
      };

      const result = await validator.validateAndResolvePresets(selections);

      expect(result.conflicts).toContainEqual({
        preset1: "auth:clerk",
        preset2: "auth2:better-auth",
      });
    });

    it("should handle null selections", async () => {
      const mockFileExists = vi.fn().mockResolvedValue(true);
      const mockReadJson = vi.fn().mockResolvedValue({
        name: "biome",
        category: "linting",
      });

      const validator = createPresetValidator({
        presetsDir: "/presets",
        presetRegistry: mockPresetRegistry,
        fileExists: mockFileExists,
        readJson: mockReadJson,
      });

      const selections = {
        auth: null,
        linting: { preset: "biome", version: "1.0.0" },
      };

      const result = await validator.validateAndResolvePresets(selections);

      expect(result.resolved.auth).toBeNull();
      expect(result.resolved.linting).toEqual(selections.linting);
    });

    it("should detect missing capabilities", async () => {
      const mockFileExists = vi.fn().mockResolvedValue(true);
      const mockReadJson = vi.fn().mockResolvedValue({
        name: "clerk",
        category: "auth",
        requiresCapabilities: ["database"],
      });

      const validator = createPresetValidator({
        presetsDir: "/presets",
        presetRegistry: mockPresetRegistry,
        fileExists: mockFileExists,
        readJson: mockReadJson,
      });

      const selections = {
        auth: { preset: "clerk", version: "1.0.0" },
      };

      const result = await validator.validateAndResolvePresets(selections);

      expect(result.missingCapabilities).toContainEqual({
        preset: "auth:clerk",
        capability: "database",
      });
    });

    it("should detect capability conflicts", async () => {
      const mockFileExists = vi.fn().mockResolvedValue(true);
      const mockReadJson = vi
        .fn()
        .mockResolvedValueOnce({
          name: "clerk",
          category: "auth",
          incompatibleCapabilities: ["custom-auth"],
        })
        .mockResolvedValueOnce({
          name: "custom",
          category: "auth2",
          capabilities: ["custom-auth"],
        });

      const validator = createPresetValidator({
        presetsDir: "/presets",
        presetRegistry: {
          ...mockPresetRegistry,
          custom: {
            name: "custom",
            category: "auth2",
            description: "Custom Auth",
            version: "1.0.0",
          },
        },
        fileExists: mockFileExists,
        readJson: mockReadJson,
      });

      const selections = {
        auth: { preset: "clerk", version: "1.0.0" },
        auth2: { preset: "custom", version: "1.0.0" },
      };

      const result = await validator.validateAndResolvePresets(selections);

      expect(result.capabilityConflicts).toContainEqual({
        preset: "auth:clerk",
        capability: "custom-auth",
        providedBy: "auth2:custom",
      });
    });

    it("should gracefully handle manifest read errors", async () => {
      const mockFileExists = vi.fn().mockResolvedValue(false);
      const mockReadJson = vi.fn();

      const validator = createPresetValidator({
        presetsDir: "/presets",
        presetRegistry: mockPresetRegistry,
        fileExists: mockFileExists,
        readJson: mockReadJson,
      });

      const selections = {
        auth: { preset: "nonexistent", version: "1.0.0" },
      };

      const result = await validator.validateAndResolvePresets(selections);

      expect(result.resolved).toEqual(selections);
      expect(result.added).toEqual([]);
    });
  });

  describe("displayValidationResults", () => {
    it("should not throw with empty arrays", () => {
      expect(() => displayValidationResults([], [])).not.toThrow();
    });

    it("should not throw with added presets", () => {
      const added = [
        { category: "database", preset: "drizzle", requiredBy: "auth:clerk" },
      ];
      expect(() => displayValidationResults(added, [])).not.toThrow();
    });

    it("should not throw with conflicts", () => {
      const conflicts = [
        { preset1: "auth:clerk", preset2: "auth:better-auth" },
      ];
      expect(() => displayValidationResults([], conflicts)).not.toThrow();
    });

    it("should not throw with missing capabilities", () => {
      const missingCapabilities = [
        { preset: "auth:clerk", capability: "database" },
      ];
      expect(() =>
        displayValidationResults([], [], missingCapabilities)
      ).not.toThrow();
    });

    it("should not throw with capability conflicts", () => {
      const capabilityConflicts = [
        { preset: "auth:clerk", capability: "custom-auth", providedBy: "auth2:custom" },
      ];
      expect(() =>
        displayValidationResults([], [], [], capabilityConflicts)
      ).not.toThrow();
    });
  });
});
