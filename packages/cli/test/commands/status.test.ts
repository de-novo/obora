import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "pathe";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";

// Mock consola
vi.mock("consola", () => ({
  consola: {
    log: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    box: vi.fn(),
  },
}));

describe("status command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `obora-test-status-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("project detection", () => {
    it("should error if not an obora project", async () => {
      const { statusCommand } = await import("../../src/commands/status");
      const { consola } = await import("consola");

      const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit");
      });

      await expect(
        statusCommand.run?.({
          args: { dir: tempDir, json: false, history: false },
          cmd: statusCommand,
          rawArgs: [],
        } as any)
      ).rejects.toThrow("process.exit");

      expect(consola.error).toHaveBeenCalledWith(
        expect.stringContaining("No .obora/config.json found")
      );

      mockExit.mockRestore();
    });
  });

  describe("status display", () => {
    it("should display project status", async () => {
      // Create obora config
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

      // Create history file
      await fs.writeFile(
        join(configDir, "history.json"),
        JSON.stringify({ entries: [] })
      );

      const { statusCommand } = await import("../../src/commands/status");
      const { consola } = await import("consola");

      await statusCommand.run?.({
        args: { dir: tempDir, json: false, history: false },
        cmd: statusCommand,
        rawArgs: [],
      } as any);

      expect(consola.box).toHaveBeenCalled();
      const boxCall = (consola.box as any).mock.calls[0][0];
      expect(boxCall).toContain("Base: single");
      expect(boxCall).toContain("Package Manager: pnpm");
    });
  });

  describe("JSON output", () => {
    it("should output JSON when --json flag is set", async () => {
      // Create obora config
      const configDir = join(tempDir, ".obora");
      await fs.mkdir(configDir, { recursive: true });
      const config = {
        base: "monorepo",
        packageManager: "yarn",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-02T00:00:00.000Z",
        apps: {},
        slots: {},
      };
      await fs.writeFile(join(configDir, "config.json"), JSON.stringify(config));
      await fs.writeFile(join(configDir, "history.json"), JSON.stringify({ entries: [] }));

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const { statusCommand } = await import("../../src/commands/status");

      await statusCommand.run?.({
        args: { dir: tempDir, json: true, history: false },
        cmd: statusCommand,
        rawArgs: [],
      } as any);

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(output);
      expect(parsed.base).toBe("monorepo");
      expect(parsed.packageManager).toBe("yarn");

      consoleSpy.mockRestore();
    });
  });

  describe("history display", () => {
    it("should show history when --history flag is set", async () => {
      // Create obora config
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
              action: "create",
            },
            {
              timestamp: "2024-01-02T00:00:00.000Z",
              action: "add",
              preset: "drizzle",
              target: "database",
            },
          ],
        })
      );

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const { statusCommand } = await import("../../src/commands/status");

      await statusCommand.run?.({
        args: { dir: tempDir, json: false, history: true },
        cmd: statusCommand,
        rawArgs: [],
      } as any);

      // Should output history
      const historyCalls = consoleSpy.mock.calls.filter((call) =>
        call[0]?.includes?.("add") || call[0]?.includes?.("create")
      );
      expect(historyCalls.length).toBeGreaterThan(0);

      consoleSpy.mockRestore();
    });

    it("should show message when no history entries", async () => {
      // Create obora config with empty history
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
        JSON.stringify({ entries: [] })
      );

      const { statusCommand } = await import("../../src/commands/status");
      const { consola } = await import("consola");

      await statusCommand.run?.({
        args: { dir: tempDir, json: false, history: true },
        cmd: statusCommand,
        rawArgs: [],
      } as any);

      expect(consola.info).toHaveBeenCalledWith("No history entries.");
    });
  });

  describe("apps display", () => {
    it("should display apps section when apps exist", async () => {
      const configDir = join(tempDir, ".obora");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        join(configDir, "config.json"),
        JSON.stringify({
          base: "monorepo",
          packageManager: "pnpm",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
          apps: {
            "nextjs-web": { module: "nextjs-web", version: "1.0.0" },
          },
          slots: {},
        })
      );
      await fs.writeFile(join(configDir, "history.json"), JSON.stringify({ entries: [] }));

      const { statusCommand } = await import("../../src/commands/status");
      const { consola } = await import("consola");

      await statusCommand.run?.({
        args: { dir: tempDir, json: false, history: false },
        cmd: statusCommand,
        rawArgs: [],
      } as any);

      const boxCall = (consola.box as any).mock.calls[0][0];
      expect(boxCall).toContain("Apps:");
    });
  });

  describe("presets display", () => {
    it("should display presets section", async () => {
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
            auth: { preset: "clerk-nextjs", version: "5.0.0" },
          },
        })
      );
      await fs.writeFile(join(configDir, "history.json"), JSON.stringify({ entries: [] }));

      const { statusCommand } = await import("../../src/commands/status");
      const { consola } = await import("consola");

      await statusCommand.run?.({
        args: { dir: tempDir, json: false, history: false },
        cmd: statusCommand,
        rawArgs: [],
      } as any);

      const boxCall = (consola.box as any).mock.calls[0][0];
      expect(boxCall).toContain("Presets:");
      expect(boxCall).toContain("drizzle");
    });

    it("should show (empty) for null slots", async () => {
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
            database: null,
          },
        })
      );
      await fs.writeFile(join(configDir, "history.json"), JSON.stringify({ entries: [] }));

      const { statusCommand } = await import("../../src/commands/status");
      const { consola } = await import("consola");

      await statusCommand.run?.({
        args: { dir: tempDir, json: false, history: false },
        cmd: statusCommand,
        rawArgs: [],
      } as any);

      const boxCall = (consola.box as any).mock.calls[0][0];
      expect(boxCall).toContain("(empty)");
    });
  });
});
