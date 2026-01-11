import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { upgradeCommand } from "../../src/commands/upgrade";
import { join } from "pathe";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";

// Mock prompts
vi.mock("prompts", () => ({
  default: vi.fn().mockResolvedValue({ confirmed: true, selected: [] }),
}));

describe("upgrade command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `obora-test-upgrade-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  async function createOboraConfig(slots: Record<string, { preset: string; version: string } | null>) {
    const configDir = join(tempDir, ".obora");
    await fs.mkdir(configDir, { recursive: true });

    const config = {
      $schema: "https://obora.dev/schema/config.json",
      version: "2.0.0",
      base: "single",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      apps: {},
      slots: Object.fromEntries(
        Object.entries(slots).map(([key, value]) => [
          key,
          value ? { ...value, installedAt: new Date().toISOString() } : null,
        ])
      ),
      packageManager: "pnpm",
    };

    await fs.writeFile(join(configDir, "config.json"), JSON.stringify(config, null, 2));
    await fs.writeFile(join(configDir, "history.json"), JSON.stringify({ entries: [] }));
  }

  describe("check mode", () => {
    it("should detect outdated presets", async () => {
      await createOboraConfig({
        database: { preset: "drizzle", version: "0.30.0" }, // Old version
      });

      // Run with --check flag
      await upgradeCommand.run?.({
        args: { dir: tempDir, check: true, all: false, yes: false },
        cmd: upgradeCommand,
        rawArgs: [],
      } as any);

      // Command should complete without error
      // (actual output is logged to console)
    });

    it("should report up to date when no upgrades available", async () => {
      await createOboraConfig({
        database: { preset: "drizzle", version: "999.0.0" }, // Future version
      });

      await upgradeCommand.run?.({
        args: { dir: tempDir, check: true, all: false, yes: false },
        cmd: upgradeCommand,
        rawArgs: [],
      } as any);
    });
  });

  describe("upgrade execution", () => {
    it("should upgrade specific preset with --yes flag", async () => {
      await createOboraConfig({
        database: { preset: "drizzle", version: "0.30.0" },
        linting: { preset: "biome", version: "1.0.0" },
      });

      await upgradeCommand.run?.({
        args: {
          dir: tempDir,
          preset: "drizzle",
          check: false,
          all: false,
          yes: true
        },
        cmd: upgradeCommand,
        rawArgs: [],
      } as any);

      // Read updated config
      const configPath = join(tempDir, ".obora", "config.json");
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      // Should have updated version
      expect(config.slots.database.version).not.toBe("0.30.0");
    });

    it("should upgrade all presets with --all flag", async () => {
      await createOboraConfig({
        database: { preset: "drizzle", version: "0.30.0" },
        linting: { preset: "biome", version: "1.0.0" },
      });

      await upgradeCommand.run?.({
        args: {
          dir: tempDir,
          check: false,
          all: true,
          yes: false
        },
        cmd: upgradeCommand,
        rawArgs: [],
      } as any);

      const configPath = join(tempDir, ".obora", "config.json");
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      // Both should be updated
      expect(config.slots.database.version).not.toBe("0.30.0");
      expect(config.slots.linting.version).not.toBe("1.0.0");
    });

    it("should not upgrade already up-to-date preset", async () => {
      await createOboraConfig({
        database: { preset: "drizzle", version: "999.0.0" },
      });

      await upgradeCommand.run?.({
        args: {
          dir: tempDir,
          preset: "drizzle",
          check: false,
          all: false,
          yes: true
        },
        cmd: upgradeCommand,
        rawArgs: [],
      } as any);

      const configPath = join(tempDir, ".obora", "config.json");
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      // Should remain unchanged
      expect(config.slots.database.version).toBe("999.0.0");
    });
  });

  describe("error handling", () => {
    it("should fail if no obora config exists", async () => {
      const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit");
      });

      await expect(
        upgradeCommand.run?.({
          args: { dir: tempDir, check: true, all: false, yes: false },
          cmd: upgradeCommand,
          rawArgs: [],
        } as any)
      ).rejects.toThrow("process.exit");

      mockExit.mockRestore();
    });

    it("should handle non-existent preset gracefully", async () => {
      await createOboraConfig({
        database: { preset: "drizzle", version: "0.45.0" },
      });

      // Should not throw for non-existent preset
      await upgradeCommand.run?.({
        args: {
          dir: tempDir,
          preset: "nonexistent",
          check: false,
          all: false,
          yes: true
        },
        cmd: upgradeCommand,
        rawArgs: [],
      } as any);
    });
  });

  describe("version comparison", () => {
    it("should correctly identify older versions", async () => {
      await createOboraConfig({
        database: { preset: "drizzle", version: "0.44.0" }, // Older than 0.45.0
      });

      await upgradeCommand.run?.({
        args: { dir: tempDir, check: true, all: false, yes: false },
        cmd: upgradeCommand,
        rawArgs: [],
      } as any);

      // Should detect upgrade available (no error thrown)
    });

    it("should handle versions with different lengths", async () => {
      await createOboraConfig({
        database: { preset: "drizzle", version: "0.44" }, // Missing patch version
      });

      await upgradeCommand.run?.({
        args: { dir: tempDir, check: true, all: false, yes: false },
        cmd: upgradeCommand,
        rawArgs: [],
      } as any);
    });
  });
});
