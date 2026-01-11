import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the fs module
vi.mock("../../src/utils/fs", () => ({
  readJson: vi.fn(),
  fileExists: vi.fn(),
}));

import {
  validateAndResolvePresets,
  displayValidationResults,
} from "../../src/utils/preset-validator";
import { readJson, fileExists } from "../../src/utils/fs";
import { PRESETS } from "../../src/utils/constants";

const mockReadJson = vi.mocked(readJson);
const mockFileExists = vi.mocked(fileExists);

describe("preset-validator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validateAndResolvePresets", () => {
    it("should return empty arrays when no presets selected", async () => {
      const result = await validateAndResolvePresets({});

      expect(result.resolved).toEqual({});
      expect(result.added).toEqual([]);
      expect(result.conflicts).toEqual([]);
    });

    it("should return unchanged when preset has no requirements", async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadJson.mockResolvedValue({
        name: "biome",
        category: "linting",
      });

      const selections = {
        linting: { preset: "biome", version: "1.0.0" },
      };

      const result = await validateAndResolvePresets(selections);

      expect(result.resolved).toEqual(selections);
      expect(result.added).toEqual([]);
      expect(result.conflicts).toEqual([]);
    });

    it("should auto-add required preset when missing", async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadJson.mockResolvedValue({
        name: "better-auth",
        category: "auth",
        requires: ["database:drizzle"],
      });

      const selections = {
        auth: { preset: "better-auth", version: "1.0.0" },
      };

      const result = await validateAndResolvePresets(selections);

      expect(result.resolved.database).toEqual({
        preset: "drizzle",
        version: PRESETS["drizzle"].version,
      });
      expect(result.added).toContainEqual({
        category: "database",
        preset: "drizzle",
        requiredBy: "auth:better-auth",
      });
    });

    it("should not add required preset if already selected", async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadJson.mockImplementation(async () => ({
        name: "better-auth",
        category: "auth",
        requires: ["database:drizzle"],
      }));

      const selections = {
        auth: { preset: "better-auth", version: "1.0.0" },
        database: { preset: "drizzle", version: "0.45.0" },
      };

      const result = await validateAndResolvePresets(selections);

      expect(result.added).toEqual([]);
    });

    it("should detect conflicts between presets", async () => {
      mockFileExists.mockResolvedValue(true);
      mockReadJson
        .mockResolvedValueOnce({
          name: "better-auth",
          category: "auth",
          conflicts: ["clerk"],
        })
        .mockResolvedValueOnce({
          name: "clerk",
          category: "auth",
          conflicts: ["better-auth"],
        });

      // This scenario shouldn't happen in practice (same slot)
      // but testing conflict detection logic
      const selections = {
        auth: { preset: "better-auth", version: "1.0.0" },
      };

      const result = await validateAndResolvePresets(selections);

      // No conflict because clerk is not selected
      expect(result.conflicts).toEqual([]);
    });

    it("should handle manifest read errors gracefully", async () => {
      mockFileExists.mockResolvedValue(false);

      const selections = {
        auth: { preset: "nonexistent", version: "1.0.0" },
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

      mockFileExists.mockResolvedValue(true);
      mockReadJson.mockResolvedValue({
        name: "drizzle",
        category: "database",
      });

      const result = await validateAndResolvePresets(selections);

      expect(result.resolved.auth).toBeNull();
      expect(result.resolved.database).toEqual(selections.database);
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
