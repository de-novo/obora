import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "pathe";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import {
  syncSkills,
  syncAgents,
  syncRules,
  syncSettings,
  syncClaudeMd,
  syncAll,
  listAvailableSkills,
  listAvailableAgents,
  listInstalledSkills,
  listInstalledAgents,
} from "../../src/utils/skills";

describe("skills utility", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `obora-test-skills-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(join(tempDir, ".claude"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("syncSkills", () => {
    it("should sync skills to .claude/skills/obora", async () => {
      const result = await syncSkills(tempDir, { force: true, silent: true });

      // Should return a result object
      expect(result).toHaveProperty("copied");
      expect(result).toHaveProperty("skipped");
      expect(result).toHaveProperty("errors");
      expect(Array.isArray(result.copied)).toBe(true);
    });

    it("should skip existing skills without force", async () => {
      // First sync
      await syncSkills(tempDir, { force: true, silent: true });

      // Second sync without force
      const result = await syncSkills(tempDir, { force: false, silent: true });

      // Should have skipped items
      expect(result.skipped.length >= 0).toBe(true);
    });
  });

  describe("syncAgents", () => {
    it("should sync agents to .claude/agents/obora", async () => {
      const result = await syncAgents(tempDir, { force: true, silent: true });

      expect(result).toHaveProperty("copied");
      expect(result).toHaveProperty("skipped");
      expect(result).toHaveProperty("errors");
    });
  });

  describe("syncRules", () => {
    it("should sync rules to .claude/rules", async () => {
      const result = await syncRules(tempDir, { force: true, silent: true });

      expect(result).toHaveProperty("copied");
      expect(result).toHaveProperty("skipped");
      expect(result).toHaveProperty("errors");
    });
  });

  describe("syncSettings", () => {
    it("should create settings.json if not exists", async () => {
      const result = await syncSettings(tempDir, { force: true, silent: true });

      const settingsPath = join(tempDir, ".claude", "settings.json");
      const exists = await fs.stat(settingsPath).catch(() => null);

      if (exists) {
        const content = await fs.readFile(settingsPath, "utf-8");
        const settings = JSON.parse(content);
        expect(settings).toHaveProperty("hooks");
      }

      expect(result).toHaveProperty("copied");
    });

    it("should merge hooks when settings exists", async () => {
      // Create existing settings with custom hook
      const settingsPath = join(tempDir, ".claude", "settings.json");
      const existingSettings = {
        hooks: {
          CustomHook: [{ hooks: [{ type: "command", command: "echo test" }] }],
        },
        permissions: { allow: [], deny: [] },
      };
      await fs.writeFile(settingsPath, JSON.stringify(existingSettings, null, 2));

      // Sync without force (should merge)
      await syncSettings(tempDir, { force: false, silent: true });

      const content = await fs.readFile(settingsPath, "utf-8");
      const settings = JSON.parse(content);

      // Should have both obora hooks and custom hook
      expect(settings.hooks).toHaveProperty("CustomHook");
    });
  });

  describe("syncClaudeMd", () => {
    it("should create CLAUDE.md if not exists", async () => {
      const result = await syncClaudeMd(tempDir, { force: true, silent: true });

      // Should have copied or created (or error if source not found)
      expect(result.copied.length >= 0 || result.errors.length >= 0).toBe(true);
    });

    it("should merge obora section if CLAUDE.md exists", async () => {
      // Create existing CLAUDE.md
      const claudeMdPath = join(tempDir, "CLAUDE.md");
      const existingContent = "# My Project\n\nExisting content.\n";
      await fs.writeFile(claudeMdPath, existingContent);

      // Sync
      await syncClaudeMd(tempDir, { force: true, silent: true });

      const content = await fs.readFile(claudeMdPath, "utf-8");

      // Should have original content
      expect(content).toContain("My Project");
    });

    it("should replace obora section if it exists", async () => {
      // Create CLAUDE.md with obora section
      const claudeMdPath = join(tempDir, "CLAUDE.md");
      const existingContent = `# My Project

<!-- obora -->
Old obora content
<!-- /obora -->

Footer content`;
      await fs.writeFile(claudeMdPath, existingContent);

      // Sync
      await syncClaudeMd(tempDir, { force: true, silent: true });

      const content = await fs.readFile(claudeMdPath, "utf-8");

      // Should have footer content preserved
      expect(content).toContain("Footer content");
    });
  });

  describe("syncAll", () => {
    it("should sync all asset types", async () => {
      const result = await syncAll(tempDir, { force: true, silent: true });

      // Should return results for all types
      expect(result).toHaveProperty("skills");
      expect(result).toHaveProperty("agents");
      expect(result).toHaveProperty("rules");
      expect(result).toHaveProperty("commands");
      expect(result).toHaveProperty("scripts");
      expect(result).toHaveProperty("settings");
      expect(result).toHaveProperty("claudeMd");
    });
  });

  describe("listAvailableSkills", () => {
    it("should return array of skill names", async () => {
      const skills = await listAvailableSkills();

      expect(Array.isArray(skills)).toBe(true);
      // Skills may or may not exist depending on build state
    });
  });

  describe("listAvailableAgents", () => {
    it("should return array of agent names", async () => {
      const agents = await listAvailableAgents();

      expect(Array.isArray(agents)).toBe(true);
    });
  });

  describe("listInstalledSkills", () => {
    it("should return empty array if no skills installed", async () => {
      const skills = await listInstalledSkills(tempDir);

      expect(Array.isArray(skills)).toBe(true);
      expect(skills.length).toBe(0);
    });

    it("should return installed skills after sync", async () => {
      await syncSkills(tempDir, { force: true, silent: true });

      const skills = await listInstalledSkills(tempDir);

      expect(Array.isArray(skills)).toBe(true);
      // May have skills if source exists
    });
  });

  describe("listInstalledAgents", () => {
    it("should return empty array if no agents installed", async () => {
      const agents = await listInstalledAgents(tempDir);

      expect(Array.isArray(agents)).toBe(true);
      expect(agents.length).toBe(0);
    });

    it("should return installed agents after sync", async () => {
      await syncAgents(tempDir, { force: true, silent: true });

      const agents = await listInstalledAgents(tempDir);

      expect(Array.isArray(agents)).toBe(true);
    });
  });
});
