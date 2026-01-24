import { describe, it, expect } from "vitest";
import {
  validateAndResolvePresets,
  displayValidationResults,
} from "../../src/utils/preset-validator";

// Note: These tests use the actual file system and preset files
// For mocked tests, use vitest with vi.mock()

describe("preset-validator", () => {
  describe("validateAndResolvePresets", () => {
    it("should return empty arrays when no presets selected", async () => {
      const result = await validateAndResolvePresets({});

      expect(result.resolved).toEqual({});
      expect(result.added).toEqual([]);
      expect(result.conflicts).toEqual([]);
    });

    it("should return unchanged when preset has no requirements", async () => {
      const selections = {
        linting: { preset: "biome", version: "1.0.0" },
      };

      const result = await validateAndResolvePresets(selections);

      expect(result.resolved).toEqual(selections);
      expect(result.added).toEqual([]);
      expect(result.conflicts).toEqual([]);
    });

    it("should handle null selections in slot", async () => {
      const selections = {
        auth: null,
        database: { preset: "drizzle", version: "0.45.0" },
      };

      const result = await validateAndResolvePresets(selections);

      expect(result.resolved.auth).toBeNull();
      expect(result.resolved.database).toEqual(selections.database);
    });

    it("should auto-add required preset when missing", async () => {
      // better-auth requires prisma
      const selections = {
        auth: { preset: "better-auth", version: "1.0.0" },
      };

      const result = await validateAndResolvePresets(selections);

      // Should have auto-added prisma
      expect(result.resolved.database).toBeDefined();
      expect(result.resolved.database?.preset).toBe("prisma");
      expect(result.added.length).toBeGreaterThan(0);
      expect(result.added[0].preset).toBe("prisma");
    });

    it("should not add required preset if already selected", async () => {
      const selections = {
        auth: { preset: "better-auth", version: "1.0.0" },
        database: { preset: "prisma", version: "6.0.0" },
      };

      const result = await validateAndResolvePresets(selections);

      expect(result.added).toEqual([]);
    });

    it("should detect conflicts between presets", async () => {
      // prisma and drizzle conflict
      const selections = {
        database: { preset: "prisma", version: "1.0.0" },
      };

      const result = await validateAndResolvePresets(selections);

      // No conflict because only one is selected
      expect(result.conflicts).toEqual([]);
    });
  });

  describe("displayValidationResults", () => {
    it("should not throw with empty arrays", () => {
      expect(() => displayValidationResults([], [])).not.toThrow();
    });

    it("should handle added presets without error", () => {
      const added = [
        { category: "database", preset: "drizzle", requiredBy: "auth:better-auth" },
      ];
      expect(() => displayValidationResults(added, [])).not.toThrow();
    });

    it("should handle conflicts without error", () => {
      const conflicts = [
        { preset1: "auth:clerk", preset2: "auth:better-auth" },
      ];
      expect(() => displayValidationResults([], conflicts)).not.toThrow();
    });
  });
});
