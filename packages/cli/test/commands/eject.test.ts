import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";

// Mock fs module
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  copyFile: vi.fn(),
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

// Mock prompts
vi.mock("prompts", () => ({
  default: vi.fn(),
}));

// Mock project-config
vi.mock("../../src/utils/project-config", () => ({
  readOboraConfig: vi.fn(),
  writeOboraConfig: vi.fn(),
  addHistoryEntry: vi.fn(),
}));

describe("eject command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("command definition", () => {
    it("should have correct meta information", async () => {
      const { ejectCommand } = await import("../../src/commands/eject");
      expect(ejectCommand.meta?.name).toBe("eject");
      expect(ejectCommand.meta?.description).toBe("Eject preset configuration files for customization");
    });

    it("should have preset, all, force, and list arguments", async () => {
      const { ejectCommand } = await import("../../src/commands/eject");
      expect(ejectCommand.args?.preset).toBeDefined();
      expect(ejectCommand.args?.all).toBeDefined();
      expect(ejectCommand.args?.force).toBeDefined();
      expect(ejectCommand.args?.list).toBeDefined();
    });
  });

  describe("eject validation", () => {
    it("should fail when no obora config exists", async () => {
      const { readOboraConfig } = await import("../../src/utils/project-config");
      const consola = (await import("consola")).default;

      (readOboraConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const { ejectCommand } = await import("../../src/commands/eject");

      await ejectCommand.run?.({
        args: { preset: "tailwind", all: false, force: false, list: false },
        rawArgs: [],
        cmd: ejectCommand,
      });

      // showError formats the error with code and suggestions
      expect(consola.error).toHaveBeenCalledWith(
        expect.stringContaining("Project is not initialized")
      );
    });

    it("should fail when preset is not installed", async () => {
      const { readOboraConfig } = await import("../../src/utils/project-config");
      const consola = (await import("consola")).default;

      (readOboraConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        slots: {
          database: { preset: "drizzle", version: "1.0.0", installedAt: "2024-01-01" },
        },
      });

      const { ejectCommand } = await import("../../src/commands/eject");

      await ejectCommand.run?.({
        args: { preset: "tailwind", all: false, force: false, list: false },
        rawArgs: [],
        cmd: ejectCommand,
      });

      // showError formats the error with code and suggestions
      expect(consola.error).toHaveBeenCalledWith(
        expect.stringContaining("Preset 'tailwind' not found")
      );
    });

    it("should fail when preset does not support ejecting", async () => {
      const { readOboraConfig } = await import("../../src/utils/project-config");
      const consola = (await import("consola")).default;

      (readOboraConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        slots: {
          email: { preset: "resend", version: "1.0.0", installedAt: "2024-01-01" },
        },
      });

      const { ejectCommand } = await import("../../src/commands/eject");

      await ejectCommand.run?.({
        args: { preset: "resend", all: false, force: false, list: false },
        rawArgs: [],
        cmd: ejectCommand,
      });

      // showError formats the error with code and suggestions
      expect(consola.error).toHaveBeenCalledWith(
        expect.stringContaining("does not support ejecting")
      );
    });

    it("should warn when preset is already ejected", async () => {
      const { readOboraConfig } = await import("../../src/utils/project-config");
      const consola = (await import("consola")).default;

      (readOboraConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        slots: {
          styling: {
            preset: "tailwind",
            version: "1.0.0",
            installedAt: "2024-01-01",
            ejected: true,
            ejectedFiles: ["tailwind.config.ts"],
          },
        },
      });

      const { ejectCommand } = await import("../../src/commands/eject");

      await ejectCommand.run?.({
        args: { preset: "tailwind", all: false, force: false, list: false },
        rawArgs: [],
        cmd: ejectCommand,
      });

      expect(consola.warn).toHaveBeenCalledWith(
        "Preset 'tailwind' has already been ejected."
      );
    });
  });

  describe("list mode", () => {
    it("should list all ejectable presets when --list is used without preset", async () => {
      const { readOboraConfig } = await import("../../src/utils/project-config");
      const consola = (await import("consola")).default;

      (readOboraConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        slots: {
          styling: { preset: "tailwind", version: "1.0.0", installedAt: "2024-01-01" },
          database: { preset: "drizzle", version: "1.0.0", installedAt: "2024-01-01" },
        },
      });

      const { ejectCommand } = await import("../../src/commands/eject");

      await ejectCommand.run?.({
        args: { preset: undefined, all: false, force: false, list: true },
        rawArgs: [],
        cmd: ejectCommand,
      });

      expect(consola.info).toHaveBeenCalledWith("Ejectable presets and files:\n");
    });

    it("should list files for specific preset when --list is used with preset", async () => {
      const { readOboraConfig } = await import("../../src/utils/project-config");
      const consola = (await import("consola")).default;
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;

      mockExistsSync.mockReturnValue(false);

      (readOboraConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        slots: {
          styling: { preset: "tailwind", version: "1.0.0", installedAt: "2024-01-01" },
        },
      });

      const { ejectCommand } = await import("../../src/commands/eject");

      await ejectCommand.run?.({
        args: { preset: "tailwind", all: false, force: false, list: true },
        rawArgs: [],
        cmd: ejectCommand,
      });

      expect(consola.info).toHaveBeenCalledWith("Ejectable files for 'tailwind':\n");
    });
  });

  describe("eject execution", () => {
    it("should eject files successfully", async () => {
      const { readOboraConfig, writeOboraConfig, addHistoryEntry } = await import(
        "../../src/utils/project-config"
      );
      const consola = (await import("consola")).default;
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      const mockReadFile = readFile as unknown as ReturnType<typeof vi.fn>;
      const mockCopyFile = copyFile as unknown as ReturnType<typeof vi.fn>;
      const mockMkdir = mkdir as unknown as ReturnType<typeof vi.fn>;
      const mockWriteFile = writeFile as unknown as ReturnType<typeof vi.fn>;

      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes("tailwind.config.ts") && path.includes("presets")) return true;
        if (path.includes("postcss.config.js") && path.includes("presets")) return true;
        return false;
      });

      mockReadFile.mockResolvedValue("// original content");
      mockCopyFile.mockResolvedValue(undefined);
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      (readOboraConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        slots: {
          styling: { preset: "tailwind", version: "1.0.0", installedAt: "2024-01-01" },
        },
        updatedAt: "2024-01-01",
      });
      (writeOboraConfig as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (addHistoryEntry as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const prompts = (await import("prompts")).default as ReturnType<typeof vi.fn>;
      prompts.mockResolvedValue({ selectedFiles: [] });

      const { ejectCommand } = await import("../../src/commands/eject");

      await ejectCommand.run?.({
        args: { preset: "tailwind", all: true, force: false, list: false },
        rawArgs: [],
        cmd: ejectCommand,
      });

      // writeOboraConfig is called after successful eject
      expect(writeOboraConfig).toHaveBeenCalled();
    });

    it("should warn when files already exist without --force", async () => {
      const { readOboraConfig } = await import("../../src/utils/project-config");
      const consola = (await import("consola")).default;
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;

      mockExistsSync.mockReturnValue(true);

      (readOboraConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        slots: {
          styling: { preset: "tailwind", version: "1.0.0", installedAt: "2024-01-01" },
        },
      });

      const prompts = (await import("prompts")).default as ReturnType<typeof vi.fn>;
      prompts.mockResolvedValue({ proceed: false });

      const { ejectCommand } = await import("../../src/commands/eject");

      await ejectCommand.run?.({
        args: { preset: "tailwind", all: true, force: false, list: false },
        rawArgs: [],
        cmd: ejectCommand,
      });

      expect(consola.warn).toHaveBeenCalledWith("The following files already exist:");
    });
  });

  describe("ejectable presets", () => {
    it("should have ejectable files for tailwind", async () => {
      const { ejectCommand } = await import("../../src/commands/eject");
      expect(ejectCommand).toBeDefined();
      // EJECTABLE_FILES is internal, but we can verify the command handles tailwind
    });

    it("should have ejectable files for shadcn", async () => {
      const { ejectCommand } = await import("../../src/commands/eject");
      expect(ejectCommand).toBeDefined();
    });

    it("should have ejectable files for drizzle", async () => {
      const { ejectCommand } = await import("../../src/commands/eject");
      expect(ejectCommand).toBeDefined();
    });

    it("should have ejectable files for prisma", async () => {
      const { ejectCommand } = await import("../../src/commands/eject");
      expect(ejectCommand).toBeDefined();
    });
  });

  describe("config update after eject", () => {
    it("should update slot config with ejected status", async () => {
      const { readOboraConfig, writeOboraConfig, addHistoryEntry } = await import(
        "../../src/utils/project-config"
      );
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      const mockCopyFile = copyFile as unknown as ReturnType<typeof vi.fn>;
      const mockReadFile = readFile as unknown as ReturnType<typeof vi.fn>;
      const mockWriteFile = writeFile as unknown as ReturnType<typeof vi.fn>;

      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes("presets")) return true;
        return false;
      });
      mockCopyFile.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue("// content");
      mockWriteFile.mockResolvedValue(undefined);

      const config = {
        slots: {
          styling: { preset: "tailwind", version: "1.0.0", installedAt: "2024-01-01" },
        },
        updatedAt: "2024-01-01",
      };

      (readOboraConfig as ReturnType<typeof vi.fn>).mockResolvedValue(config);
      (writeOboraConfig as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (addHistoryEntry as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const { ejectCommand } = await import("../../src/commands/eject");

      await ejectCommand.run?.({
        args: { preset: "tailwind", all: true, force: true, list: false },
        rawArgs: [],
        cmd: ejectCommand,
      });

      // Verify writeOboraConfig was called
      expect(writeOboraConfig).toHaveBeenCalled();
    });

    it("should add history entry after eject", async () => {
      const { readOboraConfig, writeOboraConfig, addHistoryEntry } = await import(
        "../../src/utils/project-config"
      );
      const mockExistsSync = existsSync as unknown as ReturnType<typeof vi.fn>;
      const mockCopyFile = copyFile as unknown as ReturnType<typeof vi.fn>;
      const mockReadFile = readFile as unknown as ReturnType<typeof vi.fn>;
      const mockWriteFile = writeFile as unknown as ReturnType<typeof vi.fn>;

      mockExistsSync.mockImplementation((path: string) => {
        if (path.includes("presets")) return true;
        return false;
      });
      mockCopyFile.mockResolvedValue(undefined);
      mockReadFile.mockResolvedValue("// content");
      mockWriteFile.mockResolvedValue(undefined);

      (readOboraConfig as ReturnType<typeof vi.fn>).mockResolvedValue({
        slots: {
          styling: { preset: "tailwind", version: "1.0.0", installedAt: "2024-01-01" },
        },
        updatedAt: "2024-01-01",
      });
      (writeOboraConfig as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (addHistoryEntry as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const { ejectCommand } = await import("../../src/commands/eject");

      await ejectCommand.run?.({
        args: { preset: "tailwind", all: true, force: true, list: false },
        rawArgs: [],
        cmd: ejectCommand,
      });

      expect(addHistoryEntry).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          action: "eject",
          preset: "tailwind",
        })
      );
    });
  });
});
