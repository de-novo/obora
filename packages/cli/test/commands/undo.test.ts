import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "pathe";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";

// Mock consola (both named and default export)
const mockConsola = {
  log: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  box: vi.fn(),
};
vi.mock("consola", () => ({
  default: mockConsola,
  consola: mockConsola,
}));

// Mock prompts
vi.mock("prompts", () => ({
  default: vi.fn().mockResolvedValue({ confirm: true }),
}));

describe("undo command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `obora-test-undo-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("project detection", () => {
    it("should error if not an obora project", async () => {
      const { undoCommand } = await import("../../src/commands/undo");
      const { consola } = await import("consola");

      const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit");
      });

      await expect(
        undoCommand.run?.({
          args: { dir: tempDir, yes: true, "delete-files": false },
          cmd: undoCommand,
          rawArgs: [],
        } as any)
      ).rejects.toThrow("process.exit");

      mockExit.mockRestore();
    });
  });

  describe("no undoable operations", () => {
    it("should show message when no undoable operations", async () => {
      // Create obora config with no undoable history
      const configDir = join(tempDir, ".obora");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        join(configDir, "config.json"),
        JSON.stringify({
          base: "single",
          packageManager: "pnpm",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
          apps: {},
          slots: {},
        })
      );
      await fs.writeFile(
        join(configDir, "history.json"),
        JSON.stringify({
          entries: [
            {
              timestamp: "2024-01-01T00:00:00.000Z",
              action: "create", // Not undoable
            },
          ],
        })
      );

      const { undoCommand } = await import("../../src/commands/undo");
      const { consola } = await import("consola");

      await undoCommand.run?.({
        args: { dir: tempDir, yes: true, "delete-files": false },
        cmd: undoCommand,
        rawArgs: [],
      } as any);

      expect(consola.info).toHaveBeenCalledWith("No undoable operations found.");
    });
  });

  describe("undo confirmation", () => {
    it("should show operation details before undo", async () => {
      // Create obora config with undoable history
      const configDir = join(tempDir, ".obora");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        join(configDir, "config.json"),
        JSON.stringify({
          base: "single",
          packageManager: "pnpm",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
          apps: {},
          slots: {
            database: { preset: "drizzle", version: "0.38.0" },
          },
        })
      );
      await fs.writeFile(
        join(configDir, "history.json"),
        JSON.stringify({
          entries: [
            {
              timestamp: "2024-01-02T00:00:00.000Z",
              action: "add",
              preset: "drizzle",
              target: "database",
              undoData: {
                configChanges: {
                  slot: "database",
                  preset: "drizzle",
                  previousSlotConfig: null,
                },
              },
            },
          ],
        })
      );

      const { undoCommand } = await import("../../src/commands/undo");
      const { consola } = await import("consola");

      await undoCommand.run?.({
        args: { dir: tempDir, yes: true, "delete-files": false },
        cmd: undoCommand,
        rawArgs: [],
      } as any);

      expect(consola.box).toHaveBeenCalledWith(expect.stringContaining("Last operation"));
    });

    it("should cancel when user declines", async () => {
      const prompts = await import("prompts");
      (prompts.default as any).mockResolvedValueOnce({ confirm: false });

      const configDir = join(tempDir, ".obora");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        join(configDir, "config.json"),
        JSON.stringify({
          base: "single",
          packageManager: "pnpm",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
          apps: {},
          slots: { database: { preset: "drizzle", version: "0.38.0" } },
        })
      );
      await fs.writeFile(
        join(configDir, "history.json"),
        JSON.stringify({
          entries: [
            {
              timestamp: "2024-01-02T00:00:00.000Z",
              action: "add",
              preset: "drizzle",
              target: "database",
              undoData: {
                configChanges: { slot: "database", preset: "drizzle", previousSlotConfig: null },
              },
            },
          ],
        })
      );

      const { undoCommand } = await import("../../src/commands/undo");
      const { consola } = await import("consola");

      await undoCommand.run?.({
        args: { dir: tempDir, yes: false, "delete-files": false },
        cmd: undoCommand,
        rawArgs: [],
      } as any);

      expect(consola.info).toHaveBeenCalledWith("Cancelled.");
    });
  });

  describe("undo execution", () => {
    it("should restore slot to null when previous config was null", async () => {
      const configDir = join(tempDir, ".obora");
      await fs.mkdir(configDir, { recursive: true });

      const config = {
        base: "single",
        packageManager: "pnpm",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z",
        apps: {},
        slots: {
          database: { preset: "drizzle", version: "0.38.0" },
        },
      };
      await fs.writeFile(join(configDir, "config.json"), JSON.stringify(config));
      await fs.writeFile(
        join(configDir, "history.json"),
        JSON.stringify({
          entries: [
            {
              timestamp: "2024-01-02T00:00:00.000Z",
              action: "add",
              preset: "drizzle",
              target: "database",
              undoData: {
                configChanges: {
                  slot: "database",
                  preset: "drizzle",
                  previousSlotConfig: null,
                },
              },
            },
          ],
        })
      );

      const { undoCommand } = await import("../../src/commands/undo");
      const { consola } = await import("consola");

      await undoCommand.run?.({
        args: { dir: tempDir, yes: true, "delete-files": false },
        cmd: undoCommand,
        rawArgs: [],
      } as any);

      expect(consola.success).toHaveBeenCalledWith("Restored configuration");
      expect(consola.success).toHaveBeenCalledWith("Undo completed!");

      // Verify config was updated
      const updatedConfig = JSON.parse(
        await fs.readFile(join(configDir, "config.json"), "utf-8")
      );
      expect(updatedConfig.slots.database).toBeNull();
    });

    it("should show added files message", async () => {
      const configDir = join(tempDir, ".obora");
      await fs.mkdir(configDir, { recursive: true });

      await fs.writeFile(
        join(configDir, "config.json"),
        JSON.stringify({
          base: "single",
          packageManager: "pnpm",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
          apps: {},
          slots: { database: { preset: "drizzle", version: "0.38.0" } },
        })
      );
      await fs.writeFile(
        join(configDir, "history.json"),
        JSON.stringify({
          entries: [
            {
              timestamp: "2024-01-02T00:00:00.000Z",
              action: "add",
              preset: "drizzle",
              target: "database",
              undoData: {
                configChanges: { slot: "database", preset: "drizzle", previousSlotConfig: null },
                addedFiles: ["src/lib/db.ts", "drizzle.config.ts"],
              },
            },
          ],
        })
      );

      const { undoCommand } = await import("../../src/commands/undo");
      const { consola } = await import("consola");

      await undoCommand.run?.({
        args: { dir: tempDir, yes: true, "delete-files": false },
        cmd: undoCommand,
        rawArgs: [],
      } as any);

      // Should show box with added files
      expect(consola.box).toHaveBeenCalledWith(
        expect.stringContaining("The following files were added")
      );
    });

    it("should show added dependencies message", async () => {
      const configDir = join(tempDir, ".obora");
      await fs.mkdir(configDir, { recursive: true });

      await fs.writeFile(
        join(configDir, "config.json"),
        JSON.stringify({
          base: "single",
          packageManager: "pnpm",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
          apps: {},
          slots: { database: { preset: "drizzle", version: "0.38.0" } },
        })
      );
      await fs.writeFile(
        join(configDir, "history.json"),
        JSON.stringify({
          entries: [
            {
              timestamp: "2024-01-02T00:00:00.000Z",
              action: "add",
              preset: "drizzle",
              target: "database",
              undoData: {
                configChanges: { slot: "database", preset: "drizzle", previousSlotConfig: null },
                addedDependencies: ["drizzle-orm", "drizzle-kit"],
              },
            },
          ],
        })
      );

      const { undoCommand } = await import("../../src/commands/undo");
      const { consola } = await import("consola");

      await undoCommand.run?.({
        args: { dir: tempDir, yes: true, "delete-files": false },
        cmd: undoCommand,
        rawArgs: [],
      } as any);

      expect(consola.box).toHaveBeenCalledWith(
        expect.stringContaining("The following dependencies were added")
      );
    });
  });

  describe("delete-files option", () => {
    it("should delete files when --delete-files is set", async () => {
      const configDir = join(tempDir, ".obora");
      await fs.mkdir(configDir, { recursive: true });

      // Create a file that would be deleted
      const testFile = join(tempDir, "test-file.ts");
      await fs.writeFile(testFile, "export const test = 1;");

      await fs.writeFile(
        join(configDir, "config.json"),
        JSON.stringify({
          base: "single",
          packageManager: "pnpm",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
          apps: {},
          slots: { database: { preset: "drizzle", version: "0.38.0" } },
        })
      );
      await fs.writeFile(
        join(configDir, "history.json"),
        JSON.stringify({
          entries: [
            {
              timestamp: "2024-01-02T00:00:00.000Z",
              action: "add",
              preset: "drizzle",
              target: "database",
              undoData: {
                configChanges: { slot: "database", preset: "drizzle", previousSlotConfig: null },
                addedFiles: [testFile],
              },
            },
          ],
        })
      );

      const { undoCommand } = await import("../../src/commands/undo");
      const { consola } = await import("consola");

      await undoCommand.run?.({
        args: { dir: tempDir, yes: true, "delete-files": true },
        cmd: undoCommand,
        rawArgs: [],
      } as any);

      expect(consola.info).toHaveBeenCalledWith("Deleting added files...");
      expect(consola.success).toHaveBeenCalledWith(`Deleted: ${testFile}`);

      // Verify file was deleted
      const fileExists = await fs
        .stat(testFile)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(false);
    });
  });
});
