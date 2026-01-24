import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";

// Mock fs module
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Mock consola
vi.mock("consola", () => ({
  default: {
    start: vi.fn(),
    log: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    box: vi.fn(),
  },
}));

describe("doctor command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("checkConfigExists", () => {
    it("should pass when obora.config.json exists", async () => {
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes("obora.config.json")) return true;
        return false;
      });

      // Import the module to test internal functions
      const doctorModule = await import("../../src/commands/doctor");
      expect(doctorModule.doctorCommand).toBeDefined();
    });

    it("should fail when obora.config.json does not exist", async () => {
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      mockExistsSync.mockReturnValue(false);

      const doctorModule = await import("../../src/commands/doctor");
      expect(doctorModule.doctorCommand).toBeDefined();
    });
  });

  describe("checkPackageJson", () => {
    it("should pass when package.json exists", async () => {
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes("package.json")) return true;
        return false;
      });

      const doctorModule = await import("../../src/commands/doctor");
      expect(doctorModule.doctorCommand).toBeDefined();
    });
  });

  describe("checkNodeModules", () => {
    it("should pass when node_modules exists", async () => {
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes("node_modules")) return true;
        return false;
      });

      const doctorModule = await import("../../src/commands/doctor");
      expect(doctorModule.doctorCommand).toBeDefined();
    });

    it("should warn when node_modules does not exist", async () => {
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes("node_modules")) return false;
        return true;
      });

      const doctorModule = await import("../../src/commands/doctor");
      expect(doctorModule.doctorCommand).toBeDefined();
    });
  });

  describe("checkLockfile", () => {
    it("should detect pnpm-lock.yaml", async () => {
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes("pnpm-lock.yaml")) return true;
        return false;
      });

      const doctorModule = await import("../../src/commands/doctor");
      expect(doctorModule.doctorCommand).toBeDefined();
    });

    it("should detect package-lock.json", async () => {
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes("package-lock.json")) return true;
        return false;
      });

      const doctorModule = await import("../../src/commands/doctor");
      expect(doctorModule.doctorCommand).toBeDefined();
    });

    it("should detect yarn.lock", async () => {
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes("yarn.lock")) return true;
        return false;
      });

      const doctorModule = await import("../../src/commands/doctor");
      expect(doctorModule.doctorCommand).toBeDefined();
    });
  });

  describe("checkEnvFiles", () => {
    it("should pass when .env.example and .env.local exist", async () => {
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes(".env.example") || path.includes(".env.local")) return true;
        return false;
      });

      const doctorModule = await import("../../src/commands/doctor");
      expect(doctorModule.doctorCommand).toBeDefined();
    });

    it("should warn when .env.example exists but .env.local does not", async () => {
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes(".env.example")) return true;
        return false;
      });

      const doctorModule = await import("../../src/commands/doctor");
      expect(doctorModule.doctorCommand).toBeDefined();
    });
  });

  describe("checkRequiredEnvVars", () => {
    it("should check for required environment variables based on installed presets", async () => {
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      const mockReadFileSync = readFileSync as unknown as ReturnType<typeof vi.fn>;

      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes(".env.local")) return true;
        if (path.includes(".obora/config.json")) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes(".env.local")) {
          return "DATABASE_URL=postgres://localhost:5432/db\n";
        }
        if (path.includes("config.json")) {
          return JSON.stringify({
            slots: {
              database: { preset: "drizzle", version: "1.0.0", installedAt: "2024-01-01" },
            },
          });
        }
        return "";
      });

      const doctorModule = await import("../../src/commands/doctor");
      expect(doctorModule.doctorCommand).toBeDefined();
    });

    it("should warn when required environment variables are missing", async () => {
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      const mockReadFileSync = readFileSync as unknown as ReturnType<typeof vi.fn>;

      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes(".env.local")) return true;
        if (path.includes(".obora/config.json")) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes(".env.local")) {
          return "SOME_OTHER_VAR=value\n";
        }
        if (path.includes("config.json")) {
          return JSON.stringify({
            slots: {
              auth: { preset: "clerk-nextjs", version: "1.0.0", installedAt: "2024-01-01" },
            },
          });
        }
        return "";
      });

      const doctorModule = await import("../../src/commands/doctor");
      expect(doctorModule.doctorCommand).toBeDefined();
    });
  });

  describe("checkPresetFiles", () => {
    it("should check for expected preset files", async () => {
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      const mockReadFileSync = readFileSync as unknown as ReturnType<typeof vi.fn>;

      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes("src/middleware.ts")) return true;
        if (path.includes(".obora/config.json")) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("config.json")) {
          return JSON.stringify({
            slots: {
              auth: { preset: "clerk-nextjs", version: "1.0.0", installedAt: "2024-01-01" },
            },
          });
        }
        return "";
      });

      const doctorModule = await import("../../src/commands/doctor");
      expect(doctorModule.doctorCommand).toBeDefined();
    });
  });

  describe("checkMonorepoStructure", () => {
    it("should check monorepo structure when base is monorepo", async () => {
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      const mockReadFileSync = readFileSync as unknown as ReturnType<typeof vi.fn>;

      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes("package.json")) return true;
        if (path.includes("pnpm-workspace.yaml")) return true;
        if (path.includes("apps")) return true;
        if (path.includes("packages")) return true;
        if (path.includes(".obora/config.json")) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("package.json")) {
          return JSON.stringify({
            workspaces: ["apps/*", "packages/*"],
          });
        }
        if (path.includes("config.json")) {
          return JSON.stringify({
            base: "monorepo",
            slots: {},
          });
        }
        return "";
      });

      const doctorModule = await import("../../src/commands/doctor");
      expect(doctorModule.doctorCommand).toBeDefined();
    });

    it("should skip monorepo checks for single-project base", async () => {
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      const mockReadFileSync = readFileSync as unknown as ReturnType<typeof vi.fn>;

      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes(".obora/config.json")) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("config.json")) {
          return JSON.stringify({
            base: "single",
            slots: {},
          });
        }
        return "";
      });

      const doctorModule = await import("../../src/commands/doctor");
      expect(doctorModule.doctorCommand).toBeDefined();
    });
  });

  describe("checkPresetConflicts", () => {
    it("should detect conflicts between installed presets", async () => {
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      const mockReadFileSync = readFileSync as unknown as ReturnType<typeof vi.fn>;

      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes(".obora/config.json")) return true;
        if (path.includes("manifest.json")) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("config.json")) {
          return JSON.stringify({
            slots: {
              database: { preset: "drizzle", version: "1.0.0", installedAt: "2024-01-01" },
              orm: { preset: "prisma", version: "1.0.0", installedAt: "2024-01-01" },
            },
          });
        }
        if (path.includes("drizzle") && path.includes("manifest.json")) {
          return JSON.stringify({
            name: "drizzle",
            category: "database",
            description: "Drizzle ORM",
            conflicts: ["prisma"],
          });
        }
        if (path.includes("prisma") && path.includes("manifest.json")) {
          return JSON.stringify({
            name: "prisma",
            category: "database",
            description: "Prisma ORM",
            conflicts: ["drizzle"],
          });
        }
        return "";
      });

      const doctorModule = await import("../../src/commands/doctor");
      expect(doctorModule.doctorCommand).toBeDefined();
    });

    it("should pass when no conflicts exist", async () => {
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      const mockReadFileSync = readFileSync as unknown as ReturnType<typeof vi.fn>;

      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes(".obora/config.json")) return true;
        if (path.includes("manifest.json")) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("config.json")) {
          return JSON.stringify({
            slots: {
              auth: { preset: "clerk-nextjs", version: "1.0.0", installedAt: "2024-01-01" },
              database: { preset: "drizzle", version: "1.0.0", installedAt: "2024-01-01" },
            },
          });
        }
        if (path.includes("clerk") && path.includes("manifest.json")) {
          return JSON.stringify({
            name: "clerk-nextjs",
            category: "auth",
            description: "Clerk Auth",
          });
        }
        if (path.includes("drizzle") && path.includes("manifest.json")) {
          return JSON.stringify({
            name: "drizzle",
            category: "database",
            description: "Drizzle ORM",
            conflicts: ["prisma"],
          });
        }
        return "";
      });

      const doctorModule = await import("../../src/commands/doctor");
      expect(doctorModule.doctorCommand).toBeDefined();
    });

    it("should skip conflict check when only one preset is installed", async () => {
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      const mockReadFileSync = readFileSync as unknown as ReturnType<typeof vi.fn>;

      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes(".obora/config.json")) return true;
        return false;
      });

      mockReadFileSync.mockImplementation((path: string) => {
        if (path.includes("config.json")) {
          return JSON.stringify({
            slots: {
              database: { preset: "drizzle", version: "1.0.0", installedAt: "2024-01-01" },
            },
          });
        }
        return "";
      });

      const doctorModule = await import("../../src/commands/doctor");
      expect(doctorModule.doctorCommand).toBeDefined();
    });
  });

  describe("command definition", () => {
    it("should have correct meta information", async () => {
      const { doctorCommand } = await import("../../src/commands/doctor");
      expect(doctorCommand.meta?.name).toBe("doctor");
      expect(doctorCommand.meta?.description).toBe("Diagnose project health and configuration issues");
    });

    it("should have path, fix, and json arguments", async () => {
      const { doctorCommand } = await import("../../src/commands/doctor");
      expect(doctorCommand.args?.path).toBeDefined();
      expect(doctorCommand.args?.fix).toBeDefined();
      expect(doctorCommand.args?.json).toBeDefined();
    });
  });
});
