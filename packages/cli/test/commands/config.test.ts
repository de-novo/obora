import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "pathe";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { homedir } from "node:os";

// Mock consola
vi.mock("consola", () => ({
  default: {
    log: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
  consola: {
    log: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock global-config module
const mockPreferences: Record<string, unknown> = {};
vi.mock("../../src/utils/global-config", () => ({
  getPreference: vi.fn((key: string) => mockPreferences[key]),
  setPreference: vi.fn((key: string, value: unknown) => {
    mockPreferences[key] = value;
  }),
  getAllPreferences: vi.fn(() => ({ ...mockPreferences })),
  clearAllPreferences: vi.fn(() => {
    Object.keys(mockPreferences).forEach((key) => delete mockPreferences[key]);
  }),
  deletePreference: vi.fn((key: string) => {
    delete mockPreferences[key];
  }),
}));

describe("config command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear mock preferences
    Object.keys(mockPreferences).forEach((key) => delete mockPreferences[key]);
  });

  describe("parseValue", () => {
    it("should validate packageManager values", async () => {
      const { configCommand } = await import("../../src/commands/config");

      // Valid package manager
      await configCommand.run?.({
        args: { key: "packageManager", value: "pnpm", list: false, reset: false, delete: false },
        cmd: configCommand,
        rawArgs: [],
      } as any);

      const { setPreference } = await import("../../src/utils/global-config");
      expect(setPreference).toHaveBeenCalledWith("packageManager", "pnpm");
    });

    it("should reject invalid packageManager values", async () => {
      const { configCommand } = await import("../../src/commands/config");
      const consola = (await import("consola")).default;

      await configCommand.run?.({
        args: { key: "packageManager", value: "invalid", list: false, reset: false, delete: false },
        cmd: configCommand,
        rawArgs: [],
      } as any);

      expect(consola.error).toHaveBeenCalledWith(
        expect.stringContaining("Invalid package manager")
      );
    });

    it("should validate defaultBase values", async () => {
      const { configCommand } = await import("../../src/commands/config");

      await configCommand.run?.({
        args: { key: "defaultBase", value: "monorepo", list: false, reset: false, delete: false },
        cmd: configCommand,
        rawArgs: [],
      } as any);

      const { setPreference } = await import("../../src/utils/global-config");
      expect(setPreference).toHaveBeenCalledWith("defaultBase", "monorepo");
    });

    it("should parse preferredPresets as array", async () => {
      const { configCommand } = await import("../../src/commands/config");

      await configCommand.run?.({
        args: { key: "preferredPresets", value: "biome,drizzle,clerk", list: false, reset: false, delete: false },
        cmd: configCommand,
        rawArgs: [],
      } as any);

      const { setPreference } = await import("../../src/utils/global-config");
      expect(setPreference).toHaveBeenCalledWith("preferredPresets", ["biome", "drizzle", "clerk"]);
    });

    it("should parse telemetry as boolean", async () => {
      const { configCommand } = await import("../../src/commands/config");

      await configCommand.run?.({
        args: { key: "telemetry", value: "true", list: false, reset: false, delete: false },
        cmd: configCommand,
        rawArgs: [],
      } as any);

      const { setPreference } = await import("../../src/utils/global-config");
      expect(setPreference).toHaveBeenCalledWith("telemetry", true);
    });
  });

  describe("list preferences", () => {
    it("should show message when no preferences set", async () => {
      const { configCommand } = await import("../../src/commands/config");
      const consola = (await import("consola")).default;

      await configCommand.run?.({
        args: { list: true, reset: false, delete: false },
        cmd: configCommand,
        rawArgs: [],
      } as any);

      expect(consola.info).toHaveBeenCalledWith("No preferences set.");
    });

    it("should list all preferences when set", async () => {
      mockPreferences.packageManager = "pnpm";
      mockPreferences.defaultBase = "monorepo";

      const { configCommand } = await import("../../src/commands/config");
      const consola = (await import("consola")).default;

      await configCommand.run?.({
        args: { list: true, reset: false, delete: false },
        cmd: configCommand,
        rawArgs: [],
      } as any);

      expect(consola.info).toHaveBeenCalledWith("Global preferences:\n");
      expect(consola.log).toHaveBeenCalledWith(expect.stringContaining("packageManager"));
    });
  });

  describe("reset preferences", () => {
    it("should clear all preferences on reset", async () => {
      mockPreferences.packageManager = "pnpm";

      const { configCommand } = await import("../../src/commands/config");
      const { clearAllPreferences } = await import("../../src/utils/global-config");
      const consola = (await import("consola")).default;

      await configCommand.run?.({
        args: { reset: true, list: false, delete: false },
        cmd: configCommand,
        rawArgs: [],
      } as any);

      expect(clearAllPreferences).toHaveBeenCalled();
      expect(consola.success).toHaveBeenCalledWith("All preferences have been reset.");
    });
  });

  describe("get preference", () => {
    it("should show value when preference is set", async () => {
      mockPreferences.packageManager = "yarn";

      const { configCommand } = await import("../../src/commands/config");
      const consola = (await import("consola")).default;

      await configCommand.run?.({
        args: { key: "packageManager", list: false, reset: false, delete: false },
        cmd: configCommand,
        rawArgs: [],
      } as any);

      expect(consola.info).toHaveBeenCalledWith("packageManager: yarn");
    });

    it("should show (not set) when preference is not set", async () => {
      const { configCommand } = await import("../../src/commands/config");
      const consola = (await import("consola")).default;

      await configCommand.run?.({
        args: { key: "packageManager", list: false, reset: false, delete: false },
        cmd: configCommand,
        rawArgs: [],
      } as any);

      expect(consola.info).toHaveBeenCalledWith("packageManager: (not set)");
    });
  });

  describe("delete preference", () => {
    it("should delete a preference", async () => {
      mockPreferences.packageManager = "pnpm";

      const { configCommand } = await import("../../src/commands/config");
      const consola = (await import("consola")).default;

      await configCommand.run?.({
        args: { key: "packageManager", delete: true, list: false, reset: false },
        cmd: configCommand,
        rawArgs: [],
      } as any);

      expect(consola.success).toHaveBeenCalledWith("Deleted preference: packageManager");
    });
  });

  describe("invalid key", () => {
    it("should reject invalid keys", async () => {
      const { configCommand } = await import("../../src/commands/config");
      const consola = (await import("consola")).default;

      await configCommand.run?.({
        args: { key: "invalidKey", list: false, reset: false, delete: false },
        cmd: configCommand,
        rawArgs: [],
      } as any);

      expect(consola.error).toHaveBeenCalledWith("Invalid key: invalidKey");
    });
  });

  describe("help output", () => {
    it("should show usage when no key provided", async () => {
      const { configCommand } = await import("../../src/commands/config");
      const consola = (await import("consola")).default;

      await configCommand.run?.({
        args: { list: false, reset: false, delete: false },
        cmd: configCommand,
        rawArgs: [],
      } as any);

      expect(consola.info).toHaveBeenCalledWith("Usage:");
    });
  });
});
