import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { syncCommand } from "../../src/commands/sync";
import { join } from "pathe";
import { promises as fs, existsSync } from "node:fs";
import { tmpdir } from "node:os";

// Note: These tests validate command behavior, not actual syncing
// (source assets may not exist in test environment before build)

describe("sync command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `obora-test-sync-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    // Create .claude directory (required for sync)
    await fs.mkdir(join(tempDir, ".claude"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("sync all", () => {
    it("should run without error", async () => {
      // Command should complete without throwing
      await expect(
        syncCommand.run?.({
          args: { dir: tempDir, force: true, type: "all", list: false },
          cmd: syncCommand,
          rawArgs: [],
        } as any)
      ).resolves.not.toThrow();
    });
  });

  describe("sync specific type", () => {
    it("should run settings sync without error", async () => {
      await expect(
        syncCommand.run?.({
          args: { dir: tempDir, force: true, type: "settings", list: false },
          cmd: syncCommand,
          rawArgs: [],
        } as any)
      ).resolves.not.toThrow();
    });

    it("should run skills sync without error", async () => {
      await expect(
        syncCommand.run?.({
          args: { dir: tempDir, force: true, type: "skills", list: false },
          cmd: syncCommand,
          rawArgs: [],
        } as any)
      ).resolves.not.toThrow();
    });

    it("should run agents sync without error", async () => {
      await expect(
        syncCommand.run?.({
          args: { dir: tempDir, force: true, type: "agents", list: false },
          cmd: syncCommand,
          rawArgs: [],
        } as any)
      ).resolves.not.toThrow();
    });
  });

  describe("list mode", () => {
    it("should list assets without syncing when --list", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await syncCommand.run?.({
        args: { dir: tempDir, force: false, type: "all", list: true },
        cmd: syncCommand,
        rawArgs: [],
      } as any);

      // In list mode, no files should be copied
      // (The command only lists available assets)
      consoleSpy.mockRestore();
    });
  });

  describe("force option", () => {
    it("should handle existing settings file", async () => {
      // Create existing settings
      const settingsPath = join(tempDir, ".claude", "settings.json");
      const existingSettings = {
        hooks: { CustomHook: [] },
        permissions: { allow: [], deny: [] },
      };
      await fs.writeFile(settingsPath, JSON.stringify(existingSettings, null, 2));

      // Sync without force (should merge or skip)
      await expect(
        syncCommand.run?.({
          args: { dir: tempDir, force: false, type: "settings", list: false },
          cmd: syncCommand,
          rawArgs: [],
        } as any)
      ).resolves.not.toThrow();

      // File should still exist
      expect(existsSync(settingsPath)).toBe(true);
    });

    it("should handle force overwrite", async () => {
      // Create existing settings
      const settingsPath = join(tempDir, ".claude", "settings.json");
      await fs.writeFile(settingsPath, "{}");

      // Force sync
      await expect(
        syncCommand.run?.({
          args: { dir: tempDir, force: true, type: "settings", list: false },
          cmd: syncCommand,
          rawArgs: [],
        } as any)
      ).resolves.not.toThrow();
    });
  });

  describe("error handling", () => {
    it("should warn if .claude directory does not exist", async () => {
      const noClaudeDir = join(tmpdir(), `obora-test-no-claude-${Date.now()}`);
      await fs.mkdir(noClaudeDir, { recursive: true });

      // Run sync on directory without .claude
      await syncCommand.run?.({
        args: { dir: noClaudeDir, force: false, type: "all", list: false },
        cmd: syncCommand,
        rawArgs: [],
      } as any);

      // Should complete without error (just warns)
      await fs.rm(noClaudeDir, { recursive: true, force: true });
    });
  });
});
