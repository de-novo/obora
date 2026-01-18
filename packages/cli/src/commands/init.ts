import { defineCommand } from "citty";
import { consola } from "consola";
import { resolve, join } from "pathe";
import { existsSync, promises as fs } from "node:fs";
import prompts from "prompts";
import {
  PRESETS,
  type Category,
} from "../utils/constants";
import {
  hasOboraConfig,
  createInitialConfig,
  writeOboraConfig,
  addHistoryEntry,
  updatePresetLockfile,
} from "../utils/project-config";
import { syncAll } from "../utils/skills";

// Mapping of package names to presets
const PACKAGE_TO_PRESET: Record<string, { preset: string; category: Category }> = {
  // Linting
  "@biomejs/biome": { preset: "biome", category: "linting" },
  biome: { preset: "biome", category: "linting" },
  eslint: { preset: "eslint-prettier", category: "linting" },
  prettier: { preset: "eslint-prettier", category: "linting" },

  // Database
  "drizzle-orm": { preset: "drizzle", category: "database" },
  "@prisma/client": { preset: "prisma", category: "database" },
  prisma: { preset: "prisma", category: "database" },

  // Auth
  "@clerk/nextjs": { preset: "clerk-nextjs", category: "auth" },
  "@clerk/backend": { preset: "clerk", category: "auth" },
  "better-auth": { preset: "better-auth", category: "auth" },

  // Payment
  "@polar-sh/sdk": { preset: "polar", category: "payment" },
  "@paddle/paddle-node-sdk": { preset: "paddle", category: "payment" },

  // Analytics
  "@umami/node": { preset: "umami", category: "analytics" },
  "posthog-node": { preset: "posthog", category: "analytics" },
  "posthog-js": { preset: "posthog", category: "analytics" },

  // Email
  resend: { preset: "resend", category: "email" },

  // Storage
  uploadthing: { preset: "uploadthing", category: "storage" },
  "@aws-sdk/client-s3": { preset: "cloudflare-r2", category: "storage" },

  // AI
  ai: { preset: "vercel-ai", category: "ai" },
  "@ai-sdk/openai": { preset: "vercel-ai", category: "ai" },

  // Validation
  zod: { preset: "zod", category: "validation" },
  "@effect/schema": { preset: "effect-schema", category: "validation" },
};

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
  packageManager?: string;
}

/**
 * Detect package manager from lockfile or packageManager field
 */
function detectPackageManager(
  projectPath: string,
  packageJson: PackageJson
): "pnpm" | "npm" | "yarn" | "bun" {
  // Check packageManager field first
  if (packageJson.packageManager) {
    if (packageJson.packageManager.startsWith("pnpm")) return "pnpm";
    if (packageJson.packageManager.startsWith("yarn")) return "yarn";
    if (packageJson.packageManager.startsWith("bun")) return "bun";
  }

  // Check lockfiles
  if (existsSync(join(projectPath, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(projectPath, "yarn.lock"))) return "yarn";
  if (existsSync(join(projectPath, "bun.lockb"))) return "bun";
  if (existsSync(join(projectPath, "package-lock.json"))) return "npm";

  return "pnpm"; // Default
}

/**
 * Detect base type (monorepo or single)
 */
function detectBase(
  projectPath: string,
  packageJson: PackageJson
): "monorepo" | "single" {
  // Check for workspaces
  if (packageJson.workspaces) return "monorepo";

  // Check for pnpm-workspace.yaml
  if (existsSync(join(projectPath, "pnpm-workspace.yaml"))) return "monorepo";

  // Check for turbo.json
  if (existsSync(join(projectPath, "turbo.json"))) return "monorepo";

  return "single";
}

/**
 * Detect installed presets from package.json dependencies
 */
function detectPresets(packageJson: PackageJson): Record<string, { preset: string; version: string }> {
  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
  };

  const detected: Record<string, { preset: string; version: string }> = {};

  for (const [pkg, mapping] of Object.entries(PACKAGE_TO_PRESET)) {
    if (allDeps[pkg]) {
      // Only add if not already detected for this category
      if (!detected[mapping.category]) {
        const presetInfo = PRESETS[mapping.preset];
        detected[mapping.category] = {
          preset: mapping.preset,
          version: presetInfo?.version || "unknown",
        };
      }
    }
  }

  return detected;
}

/**
 * Detect app modules from project structure
 */
async function detectApps(
  projectPath: string,
  base: "monorepo" | "single"
): Promise<Record<string, { module: string; version: string }>> {
  const apps: Record<string, { module: string; version: string }> = {};

  if (base === "monorepo") {
    // Check for apps directory
    const appsDir = join(projectPath, "apps");
    if (existsSync(appsDir)) {
      const entries = await fs.readdir(appsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const appPackageJson = join(appsDir, entry.name, "package.json");
        if (existsSync(appPackageJson)) {
          const content = await fs.readFile(appPackageJson, "utf-8");
          const pkg = JSON.parse(content) as PackageJson;
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };

          // Detect app type
          if (deps["next"]) {
            apps[entry.name] = { module: "nextjs-web", version: "1.0.0" };
          } else if (deps["@nestjs/core"]) {
            apps[entry.name] = { module: "nestjs-api", version: "1.0.0" };
          }
        }
      }
    }

    // Check for packages directory
    const packagesDir = join(projectPath, "packages");
    if (existsSync(packagesDir)) {
      const entries = await fs.readdir(packagesDir, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const pkgPackageJson = join(packagesDir, entry.name, "package.json");
        if (existsSync(pkgPackageJson)) {
          const content = await fs.readFile(pkgPackageJson, "utf-8");
          const pkg = JSON.parse(content) as PackageJson;
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };

          if (deps["drizzle-orm"] || deps["@prisma/client"]) {
            apps[entry.name] = { module: "shared-database", version: "1.0.0" };
          } else if (deps["react"]) {
            apps[entry.name] = { module: "shared-ui", version: "1.0.0" };
          }
        }
      }
    }
  } else {
    // Single app - detect from root package.json
    const packageJsonPath = join(projectPath, "package.json");
    if (existsSync(packageJsonPath)) {
      const content = await fs.readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content) as PackageJson;
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const name = pkg.name || "app";

      if (deps["next"]) {
        apps[name] = { module: "nextjs-web", version: "1.0.0" };
      } else if (deps["@nestjs/core"]) {
        apps[name] = { module: "nestjs-api", version: "1.0.0" };
      }
    }
  }

  return apps;
}

export const initCommand = defineCommand({
  meta: {
    name: "init",
    description: "Initialize obora-kit in an existing project",
  },
  args: {
    dir: {
      type: "string",
      alias: "d",
      description: "Project directory (default: current directory)",
    },
    force: {
      type: "boolean",
      alias: "f",
      description: "Overwrite existing .obora config",
      default: false,
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Skip confirmation prompts",
      default: false,
    },
  },
  async run({ args }) {
    const projectPath = resolve(args.dir || process.cwd());

    consola.info(`Initializing obora-kit in: ${projectPath}`);

    // Check for existing config
    if (hasOboraConfig(projectPath) && !args.force) {
      consola.error("This project already has an obora config.");
      consola.info("Use --force to overwrite.");
      process.exit(1);
    }

    // Check for package.json
    const packageJsonPath = join(projectPath, "package.json");
    if (!existsSync(packageJsonPath)) {
      consola.error("No package.json found. Is this a JavaScript/TypeScript project?");
      process.exit(1);
    }

    // Read package.json
    const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent) as PackageJson;

    // Detect configuration
    const detectedPm = detectPackageManager(projectPath, packageJson);
    const detectedBase = detectBase(projectPath, packageJson);
    const detectedPresets = detectPresets(packageJson);
    const detectedApps = await detectApps(projectPath, detectedBase);

    // Display detected configuration
    consola.info("\nDetected configuration:");
    consola.info(`  Base: ${detectedBase}`);
    consola.info(`  Package Manager: ${detectedPm}`);
    consola.info(`  Apps: ${Object.entries(detectedApps).map(([n, a]) => `${n} (${a.module})`).join(", ") || "none"}`);
    consola.info(`  Presets: ${Object.entries(detectedPresets).map(([c, p]) => `${c}:${p.preset}`).join(", ") || "none"}`);

    // Confirm with user
    if (!args.yes) {
      const { confirmed } = await prompts({
        type: "confirm",
        name: "confirmed",
        message: "Create .obora/config.json with detected configuration?",
        initial: true,
      });

      if (!confirmed) {
        consola.info("Cancelled");
        return;
      }
    }

    // Create config
    const slotsConfig: Record<string, { preset: string; version: string } | null> = {};
    for (const [category, presetInfo] of Object.entries(detectedPresets)) {
      slotsConfig[category] = presetInfo;
    }

    const config = createInitialConfig(
      projectPath,
      detectedBase,
      detectedPm,
      detectedApps,
      slotsConfig
    );

    await writeOboraConfig(projectPath, config);
    await updatePresetLockfile(projectPath, config);
    await addHistoryEntry(projectPath, { action: "create" });

    consola.success("Created .obora/config.json");

    // Claude SDK setup - sync all obora assets
    console.log();
    consola.info("Setting up Claude configuration...");

    let syncAssets = true;
    if (!args.yes) {
      const { confirmSync } = await prompts({
        type: "confirm",
        name: "confirmSync",
        message: "Sync obora assets (skills, agents, rules, commands, scripts, hooks)?",
        initial: true,
      });
      syncAssets = confirmSync ?? true;
    }

    if (syncAssets) {
      await syncAll(projectPath, { force: args.force });
    }

    console.log();
    consola.success("Initialization complete!");
    consola.info("\nYou can now use:");
    consola.info("  obora status   - View current configuration");
    consola.info("  obora add      - Add new presets");
    consola.info("  obora remove   - Remove presets");
    consola.info("  obora sync     - Sync/update obora assets");
    consola.info("  obora run      - Execute tasks with workflow");
    consola.info("  obora chat     - Interactive chat mode");
  },
});
