
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "pathe";
import { tmpdir } from "node:os";

describe("E2E: Preset Conflict Detection", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), \`obora-e2e-\${Date.now()}\`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should detect conflict when preset already installed", async () => {
    // Create mock config with drizzle already installed
    await fs.mkdir(join(testDir, ".obora"), { recursive: true });
    await fs.writeFile(
      join(testDir, ".obora", "config.json"),
      JSON.stringify({
        $schema: "../config.schema.json",
        version: "1.0.0",
        base: "single",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        apps: {},
        slots: {
          database: {
            preset: "drizzle",
            version: "1.0.0",
            installedAt: new Date().toISOString(),
          }
        },
        packageManager: "pnpm",
      }, null, 2)
    );

    // Add drizzle manifest
    const presetDir = join(testDir, "presets", "database", "prisma");
    await fs.mkdir(presetDir, { recursive: true });
    await fs.writeFile(
      join(presetDir, "manifest.json"),
      JSON.stringify({
        name: "prisma",
        category: "database",
        description: "Prisma ORM preset",
        version: "1.0.0",
      }, null, 2)
    );

    // Test conflict detection for clerk
    const { detectConflicts } = await import("../../src/utils/detect-conflicts");
    const result = await detectConflicts(testDir, "clerk");

    expect(result.hasConflict).toBe(true);
    expect(result.reason).toContain("already installed");
    expect(result.conflictSlot).toBe("database");
  });

  it("should detect manifest-level conflicts", async () => {
    // Create mock config
    await fs.mkdir(join(testDir, ".obora"), { recursive: true });
    await fs.writeFile(
      join(testDir, ".obora", "config.json"),
      JSON.stringify({
        $schema: "../config.schema.json",
        version: "1.0.0",
        base: "single",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        apps: {},
        slots: {
          linting: {
            preset: "biome",
            version: "1.0.0",
            installedAt: new Date().toISOString(),
          }
        },
        packageManager: "pnpm",
      }, null, 2)
    );

    // Create prisma manifest with conflicts
    const presetDir = join(testDir, "presets", "database", "prisma");
    await fs.mkdir(presetDir, { recursive: true });
    await fs.writeFile(
      join(presetDir, "manifest.json"),
      JSON.stringify({
        name: "prisma",
        category: "database",
        description: "Prisma ORM preset",
        version: "1.0.0",
        conflicts: ["biome"],
      }, null, 2)
    );

    // Test conflict detection
    const { detectConflicts } = await import("../../src/utils/detect-conflicts");
    const result = await detectConflicts(testDir, "prisma");

    expect(result.hasConflict).toBe(true);
    expect(result.reason).toContain("Conflicts with installed presets");
    expect(result.conflictingPresets).toContain("biome");
  });

  it("should return no conflict when preset is compatible", async () => {
    // Create mock config
    await fs.mkdir(join(testDir, ".obora"), { recursive: true });
    await fs.writeFile(
      join(testDir, ".obora", "config.json"),
      JSON.stringify({
        $schema: "../config.schema.json",
        version: "1.0.0",
        base: "single",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        apps: {},
        slots: {},
        packageManager: "pnpm",
      }, null, 2)
    );

    // Test conflict detection
    const { detectConflicts } = await import("../../src/utils/detect-conflicts");
    const result = await detectConflicts(testDir, "clerk");

    expect(result.hasConflict).toBe(false);
    expect(result.conflictingPresets).toEqual([]);
  });
});
