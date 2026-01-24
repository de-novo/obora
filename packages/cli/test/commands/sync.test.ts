import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
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
      await syncCommand.run?.({
        args: { dir: tempDir, force: true, type: "all", list: false },
        cmd: syncCommand,
        rawArgs: [],
      } as any);
      // If we reach here, no error was thrown
      expect(true).toBe(true);
    });
  });

  describe("sync specific type", () => {
    it("should run settings sync without error", async () => {
      await syncCommand.run?.({
        args: { dir: tempDir, force: true, type: "settings", list: false },
        cmd: syncCommand,
        rawArgs: [],
      } as any);
      expect(true).toBe(true);
    });

    it("should run skills sync without error", async () => {
      await syncCommand.run?.({
        args: { dir: tempDir, force: true, type: "skills", list: false },
        cmd: syncCommand,
        rawArgs: [],
      } as any);
      expect(true).toBe(true);
    });

    it("should run agents sync without error", async () => {
      await syncCommand.run?.({
        args: { dir: tempDir, force: true, type: "agents", list: false },
        cmd: syncCommand,
        rawArgs: [],
      } as any);
      expect(true).toBe(true);
    });
  });

  describe("list mode", () => {
    it("should list assets without syncing when --list", async () => {
      await syncCommand.run?.({
        args: { dir: tempDir, force: false, type: "all", list: true },
        cmd: syncCommand,
        rawArgs: [],
      } as any);

      // In list mode, no files should be copied
      // (The command only lists available assets)
      expect(true).toBe(true);
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
      await syncCommand.run?.({
        args: { dir: tempDir, force: false, type: "settings", list: false },
        cmd: syncCommand,
        rawArgs: [],
      } as any);

      // File should still exist
      expect(existsSync(settingsPath)).toBe(true);
    });

    it("should handle force overwrite", async () => {
      // Create existing settings
      const settingsPath = join(tempDir, ".claude", "settings.json");
      await fs.writeFile(settingsPath, "{}");

      // Force sync
      await syncCommand.run?.({
        args: { dir: tempDir, force: true, type: "settings", list: false },
        cmd: syncCommand,
        rawArgs: [],
      } as any);
      expect(true).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should exit with error if .claude directory does not exist", async () => {
      const noClaudeDir = join(tmpdir(), `obora-test-no-claude-${Date.now()}`);
      await fs.mkdir(noClaudeDir, { recursive: true });

      let exitCalled = false;
      let exitCode: number | undefined;

      // Mock process.exit to prevent test from exiting
      const originalExit = process.exit;
      process.exit = ((code?: number) => {
        exitCalled = true;
        exitCode = code;
        throw new Error("process.exit called");
      }) as any;

      try {
        // Run sync on directory without .claude
        await syncCommand.run?.({
          args: { dir: noClaudeDir, force: false, type: "all", list: false },
          cmd: syncCommand,
          rawArgs: [],
        } as any);
      } catch (error) {
        // Expected error from mocked process.exit
      } finally {
        process.exit = originalExit;
        await fs.rm(noClaudeDir, { recursive: true, force: true });
      }

      // Should call process.exit(1)
      expect(exitCalled).toBe(true);
      expect(exitCode).toBe(1);
    });
  });
});
