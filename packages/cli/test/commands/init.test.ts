import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initCommand } from "../../src/commands/init";
import { join } from "pathe";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";

// Mock prompts
vi.mock("prompts", () => ({
  default: vi.fn().mockResolvedValue({ confirmed: true }),
}));

describe("init command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `obora-test-init-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("detection logic", () => {
    it("should detect pnpm from lockfile", async () => {
      await fs.writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "test" }));
      await fs.writeFile(join(tempDir, "pnpm-lock.yaml"), "");

      // Run with --yes flag
      await initCommand.run?.({
        args: { dir: tempDir, force: false, yes: true },
        cmd: initCommand,
        rawArgs: [],
      } as any);

      const configPath = join(tempDir, ".obora", "config.json");
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      expect(config.packageManager).toBe("pnpm");
    });

    it("should detect yarn from lockfile", async () => {
      await fs.writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "test" }));
      await fs.writeFile(join(tempDir, "yarn.lock"), "");

      await initCommand.run?.({
        args: { dir: tempDir, force: false, yes: true },
        cmd: initCommand,
        rawArgs: [],
      } as any);

      const configPath = join(tempDir, ".obora", "config.json");
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      expect(config.packageManager).toBe("yarn");
    });

    it("should detect monorepo from workspaces field", async () => {
      await fs.writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "test",
          workspaces: ["packages/*"],
        })
      );

      await initCommand.run?.({
        args: { dir: tempDir, force: false, yes: true },
        cmd: initCommand,
        rawArgs: [],
      } as any);

      const configPath = join(tempDir, ".obora", "config.json");
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      expect(config.base).toBe("monorepo");
    });

    it("should detect single from no workspaces", async () => {
      await fs.writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "test" }));

      await initCommand.run?.({
        args: { dir: tempDir, force: false, yes: true },
        cmd: initCommand,
        rawArgs: [],
      } as any);

      const configPath = join(tempDir, ".obora", "config.json");
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      expect(config.base).toBe("single");
    });

    it("should detect drizzle preset from dependencies", async () => {
      await fs.writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "test",
          dependencies: {
            "drizzle-orm": "^0.30.0",
          },
        })
      );

      await initCommand.run?.({
        args: { dir: tempDir, force: false, yes: true },
        cmd: initCommand,
        rawArgs: [],
      } as any);

      const configPath = join(tempDir, ".obora", "config.json");
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      expect(config.slots.database).toEqual(
        expect.objectContaining({ preset: "drizzle" })
      );
    });

    it("should detect multiple presets", async () => {
      await fs.writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "test",
          dependencies: {
            "drizzle-orm": "^0.30.0",
            "@clerk/nextjs": "^5.0.0",
          },
          devDependencies: {
            "@biomejs/biome": "^1.9.0",
          },
        })
      );

      await initCommand.run?.({
        args: { dir: tempDir, force: false, yes: true },
        cmd: initCommand,
        rawArgs: [],
      } as any);

      const configPath = join(tempDir, ".obora", "config.json");
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      expect(config.slots.database?.preset).toBe("drizzle");
      expect(config.slots.auth?.preset).toBe("clerk-nextjs");
      expect(config.slots.linting?.preset).toBe("biome");
    });

    it("should detect Next.js app", async () => {
      await fs.writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "my-nextjs-app",
          dependencies: {
            next: "^14.0.0",
            react: "^18.0.0",
          },
        })
      );

      await initCommand.run?.({
        args: { dir: tempDir, force: false, yes: true },
        cmd: initCommand,
        rawArgs: [],
      } as any);

      const configPath = join(tempDir, ".obora", "config.json");
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      expect(config.apps["my-nextjs-app"]?.module).toBe("nextjs-web");
    });

    it("should detect NestJS app", async () => {
      await fs.writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "my-nestjs-api",
          dependencies: {
            "@nestjs/core": "^10.0.0",
          },
        })
      );

      await initCommand.run?.({
        args: { dir: tempDir, force: false, yes: true },
        cmd: initCommand,
        rawArgs: [],
      } as any);

      const configPath = join(tempDir, ".obora", "config.json");
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      expect(config.apps["my-nestjs-api"]?.module).toBe("nestjs-api");
    });
  });

  describe("dry-run mode", () => {
    it("should preview changes without making modifications", async () => {
      await fs.writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "test",
          dependencies: {
            "drizzle-orm": "^0.30.0",
          },
        })
      );

      await initCommand.run?.({
        args: { dir: tempDir, force: false, yes: true, "dry-run": true },
        cmd: initCommand,
        rawArgs: [],
      } as any);

      // Config should NOT be created in dry-run mode
      const configPath = join(tempDir, ".obora", "config.json");
      const exists = await fs
        .stat(configPath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(false);
    });

    it("should detect presets in dry-run mode", async () => {
      await fs.writeFile(
        join(tempDir, "package.json"),
        JSON.stringify({
          name: "test",
          dependencies: {
            "@clerk/nextjs": "^5.0.0",
          },
        })
      );

      // Should complete without error
      await initCommand.run?.({
        args: { dir: tempDir, force: false, yes: true, "dry-run": true },
        cmd: initCommand,
        rawArgs: [],
      } as any);

      // Verify no actual changes were made
      const configPath = join(tempDir, ".obora", "config.json");
      const exists = await fs
        .stat(configPath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(false);
    });
  });

  describe("error handling", () => {
    it("should fail if no package.json", async () => {
      const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit");
      });

      await expect(
        initCommand.run?.({
          args: { dir: tempDir, force: false, yes: true },
          cmd: initCommand,
          rawArgs: [],
        } as any)
      ).rejects.toThrow("process.exit");

      mockExit.mockRestore();
    });

    it("should fail if config exists without --force", async () => {
      await fs.writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "test" }));
      await fs.mkdir(join(tempDir, ".obora"), { recursive: true });
      await fs.writeFile(join(tempDir, ".obora", "config.json"), "{}");

      const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit");
      });

      await expect(
        initCommand.run?.({
          args: { dir: tempDir, force: false, yes: true },
          cmd: initCommand,
          rawArgs: [],
        } as any)
      ).rejects.toThrow("process.exit");

      mockExit.mockRestore();
    });

    it("should succeed with --force even if config exists", async () => {
      await fs.writeFile(join(tempDir, "package.json"), JSON.stringify({ name: "test" }));
      await fs.mkdir(join(tempDir, ".obora"), { recursive: true });
      await fs.writeFile(join(tempDir, ".obora", "config.json"), "{}");

      await initCommand.run?.({
        args: { dir: tempDir, force: true, yes: true },
        cmd: initCommand,
        rawArgs: [],
      } as any);

      const configPath = join(tempDir, ".obora", "config.json");
      const content = await fs.readFile(configPath, "utf-8");
      const config = JSON.parse(content);

      expect(config.base).toBe("single");
    });
  });
});
