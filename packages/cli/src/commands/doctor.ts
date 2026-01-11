import { defineCommand } from "citty";
import consola from "consola";
import { resolve, join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type { OboraConfig } from "../utils/project-config";

interface DiagnosticResult {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  suggestion?: string;
}

interface DiagnosticCategory {
  name: string;
  results: DiagnosticResult[];
}

/**
 * Check if obora.config.json exists
 */
function checkConfigExists(projectPath: string): DiagnosticResult {
  const configPath = join(projectPath, "obora.config.json");
  if (existsSync(configPath)) {
    return {
      name: "Configuration File",
      status: "pass",
      message: "obora.config.json found",
    };
  }
  return {
    name: "Configuration File",
    status: "fail",
    message: "obora.config.json not found",
    suggestion: "Run 'obora init' to initialize the project or 'obora create' to create a new project",
  };
}

/**
 * Check package.json exists
 */
function checkPackageJson(projectPath: string): DiagnosticResult {
  const packagePath = join(projectPath, "package.json");
  if (existsSync(packagePath)) {
    return {
      name: "Package Configuration",
      status: "pass",
      message: "package.json found",
    };
  }
  return {
    name: "Package Configuration",
    status: "fail",
    message: "package.json not found",
    suggestion: "Initialize a Node.js project with 'npm init' or 'pnpm init'",
  };
}

/**
 * Check if node_modules exists
 */
function checkNodeModules(projectPath: string): DiagnosticResult {
  const nodeModulesPath = join(projectPath, "node_modules");
  if (existsSync(nodeModulesPath)) {
    return {
      name: "Dependencies Installed",
      status: "pass",
      message: "node_modules directory found",
    };
  }
  return {
    name: "Dependencies Installed",
    status: "warn",
    message: "node_modules directory not found",
    suggestion: "Run 'pnpm install' or 'npm install' to install dependencies",
  };
}

/**
 * Check for lockfile
 */
function checkLockfile(projectPath: string): DiagnosticResult {
  const lockfiles = [
    { name: "pnpm-lock.yaml", manager: "pnpm" },
    { name: "package-lock.json", manager: "npm" },
    { name: "yarn.lock", manager: "yarn" },
    { name: "bun.lockb", manager: "bun" },
  ];

  for (const { name, manager } of lockfiles) {
    if (existsSync(join(projectPath, name))) {
      return {
        name: "Package Lock File",
        status: "pass",
        message: `${name} found (using ${manager})`,
      };
    }
  }

  return {
    name: "Package Lock File",
    status: "warn",
    message: "No lockfile found",
    suggestion: "Run your package manager's install command to generate a lockfile",
  };
}

/**
 * Check TypeScript configuration
 */
function checkTypeScriptConfig(projectPath: string): DiagnosticResult {
  const tsconfigPath = join(projectPath, "tsconfig.json");
  if (existsSync(tsconfigPath)) {
    return {
      name: "TypeScript Configuration",
      status: "pass",
      message: "tsconfig.json found",
    };
  }
  return {
    name: "TypeScript Configuration",
    status: "warn",
    message: "tsconfig.json not found",
    suggestion: "Add TypeScript configuration for better type safety",
  };
}

/**
 * Check environment files
 */
function checkEnvFiles(projectPath: string): DiagnosticResult {
  const envExample = join(projectPath, ".env.example");
  const envLocal = join(projectPath, ".env.local");
  const env = join(projectPath, ".env");

  const hasExample = existsSync(envExample);
  const hasLocal = existsSync(envLocal);
  const hasEnv = existsSync(env);

  if (hasExample && (hasLocal || hasEnv)) {
    return {
      name: "Environment Files",
      status: "pass",
      message: ".env.example and environment file found",
    };
  }

  if (hasExample && !hasLocal && !hasEnv) {
    return {
      name: "Environment Files",
      status: "warn",
      message: ".env.example exists but no .env or .env.local found",
      suggestion: "Copy .env.example to .env.local and fill in the required values",
    };
  }

  if (!hasExample && (hasLocal || hasEnv)) {
    return {
      name: "Environment Files",
      status: "warn",
      message: "Environment file found but no .env.example template",
      suggestion: "Create .env.example as a template for team members",
    };
  }

  return {
    name: "Environment Files",
    status: "pass",
    message: "No environment files required or found",
  };
}

/**
 * Check if required environment variables are set based on presets
 */
function checkRequiredEnvVars(
  projectPath: string,
  config: OboraConfig | null
): DiagnosticResult[] {
  const results: DiagnosticResult[] = [];

  if (!config) {
    return results;
  }

  const presetEnvRequirements: Record<string, string[]> = {
    "clerk-nextjs": ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"],
    "better-auth-nextjs": ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"],
    drizzle: ["DATABASE_URL"],
    prisma: ["DATABASE_URL"],
    stripe: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"],
    resend: ["RESEND_API_KEY"],
    posthog: ["NEXT_PUBLIC_POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_HOST"],
    sentry: ["SENTRY_DSN", "SENTRY_AUTH_TOKEN"],
  };

  // Get installed presets from config
  const installedPresets = Object.values(config.slots || {})
    .filter((slot): slot is NonNullable<typeof slot> => slot !== null)
    .map((slot) => slot.preset);

  // Read .env.local or .env file
  let envContent = "";
  const envLocalPath = join(projectPath, ".env.local");
  const envPath = join(projectPath, ".env");

  if (existsSync(envLocalPath)) {
    envContent = readFileSync(envLocalPath, "utf-8");
  } else if (existsSync(envPath)) {
    envContent = readFileSync(envPath, "utf-8");
  }

  for (const preset of installedPresets) {
    const requiredVars = presetEnvRequirements[preset];
    if (!requiredVars) continue;

    const missingVars: string[] = [];
    for (const varName of requiredVars) {
      // Check if variable exists in env file (with any value)
      const regex = new RegExp(`^${varName}=`, "m");
      if (!regex.test(envContent)) {
        missingVars.push(varName);
      }
    }

    if (missingVars.length > 0) {
      results.push({
        name: `Environment: ${preset}`,
        status: "warn",
        message: `Missing environment variables: ${missingVars.join(", ")}`,
        suggestion: `Add ${missingVars.join(", ")} to your .env.local file`,
      });
    } else {
      results.push({
        name: `Environment: ${preset}`,
        status: "pass",
        message: `All required environment variables are configured`,
      });
    }
  }

  return results;
}

/**
 * Check for preset file integrity
 */
function checkPresetFiles(
  projectPath: string,
  config: OboraConfig | null
): DiagnosticResult[] {
  const results: DiagnosticResult[] = [];

  if (!config) {
    return results;
  }

  const presetFileChecks: Record<string, string[]> = {
    "clerk-nextjs": ["src/middleware.ts"],
    "better-auth-nextjs": ["src/middleware.ts", "src/lib/auth-client.ts"],
    drizzle: ["drizzle.config.ts"],
    prisma: ["prisma/schema.prisma"],
    tailwind: ["tailwind.config.ts", "postcss.config.js"],
    shadcn: ["components.json"],
  };

  const installedPresets = Object.values(config.slots || {})
    .filter((slot): slot is NonNullable<typeof slot> => slot !== null)
    .map((slot) => slot.preset);

  for (const preset of installedPresets) {
    const requiredFiles = presetFileChecks[preset];
    if (!requiredFiles) continue;

    const missingFiles: string[] = [];
    for (const file of requiredFiles) {
      // Check in project root and common app directories
      const paths = [
        join(projectPath, file),
        join(projectPath, "apps/web", file),
        join(projectPath, "apps/api", file),
      ];

      const exists = paths.some((p) => existsSync(p));
      if (!exists) {
        missingFiles.push(file);
      }
    }

    if (missingFiles.length > 0) {
      results.push({
        name: `Preset Files: ${preset}`,
        status: "warn",
        message: `Missing expected files: ${missingFiles.join(", ")}`,
        suggestion: `Run 'obora add ${preset}' to reinstall the preset`,
      });
    } else {
      results.push({
        name: `Preset Files: ${preset}`,
        status: "pass",
        message: `All expected preset files found`,
      });
    }
  }

  return results;
}

/**
 * Check monorepo structure
 */
function checkMonorepoStructure(
  projectPath: string,
  config: OboraConfig | null
): DiagnosticResult[] {
  const results: DiagnosticResult[] = [];

  if (!config || config.base !== "monorepo") {
    return results;
  }

  // Check for workspaces in package.json
  const packageJsonPath = join(projectPath, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      if (!packageJson.workspaces) {
        results.push({
          name: "Monorepo Workspaces",
          status: "warn",
          message: "No workspaces field in package.json",
          suggestion: "Add workspaces configuration to package.json",
        });
      } else {
        results.push({
          name: "Monorepo Workspaces",
          status: "pass",
          message: "Workspaces configured in package.json",
        });
      }
    } catch {
      results.push({
        name: "Monorepo Workspaces",
        status: "fail",
        message: "Failed to parse package.json",
        suggestion: "Check package.json for syntax errors",
      });
    }
  }

  // Check for pnpm-workspace.yaml
  const pnpmWorkspacePath = join(projectPath, "pnpm-workspace.yaml");
  if (existsSync(pnpmWorkspacePath)) {
    results.push({
      name: "PNPM Workspace",
      status: "pass",
      message: "pnpm-workspace.yaml found",
    });
  }

  // Check apps directory
  const appsDir = join(projectPath, "apps");
  if (existsSync(appsDir)) {
    results.push({
      name: "Apps Directory",
      status: "pass",
      message: "apps/ directory found",
    });
  } else {
    results.push({
      name: "Apps Directory",
      status: "warn",
      message: "apps/ directory not found",
      suggestion: "Create apps/ directory for application packages",
    });
  }

  // Check packages directory
  const packagesDir = join(projectPath, "packages");
  if (existsSync(packagesDir)) {
    results.push({
      name: "Packages Directory",
      status: "pass",
      message: "packages/ directory found",
    });
  }

  return results;
}

/**
 * Load obora config
 */
function loadConfig(projectPath: string): OboraConfig | null {
  const configPath = join(projectPath, "obora.config.json");
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, "utf-8");
    return JSON.parse(content) as OboraConfig;
  } catch {
    return null;
  }
}

/**
 * Display diagnostic results
 */
function displayResults(categories: DiagnosticCategory[]): {
  passCount: number;
  warnCount: number;
  failCount: number;
} {
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const category of categories) {
    consola.log("");
    consola.info(`[${category.name}]`);

    for (const result of category.results) {
      const icon =
        result.status === "pass" ? "✓" : result.status === "warn" ? "!" : "✗";

      if (result.status === "pass") {
        passCount++;
        consola.success(`  ${icon} ${result.name}: ${result.message}`);
      } else if (result.status === "warn") {
        warnCount++;
        consola.warn(`  ${icon} ${result.name}: ${result.message}`);
        if (result.suggestion) {
          consola.log(`      → ${result.suggestion}`);
        }
      } else {
        failCount++;
        consola.error(`  ${icon} ${result.name}: ${result.message}`);
        if (result.suggestion) {
          consola.log(`      → ${result.suggestion}`);
        }
      }
    }
  }

  return { passCount, warnCount, failCount };
}

export const doctorCommand = defineCommand({
  meta: {
    name: "doctor",
    description: "Diagnose project health and configuration issues",
  },
  args: {
    path: {
      type: "positional",
      description: "Project path to diagnose",
      required: false,
    },
    fix: {
      type: "boolean",
      description: "Attempt to fix issues automatically (coming soon)",
      default: false,
    },
    json: {
      type: "boolean",
      description: "Output results as JSON",
      default: false,
    },
  },
  async run({ args }) {
    const projectPath = resolve(args.path || ".");

    if (args.json) {
      // JSON output mode
      const config = loadConfig(projectPath);
      const categories: DiagnosticCategory[] = [];

      // Project Structure
      const structureResults: DiagnosticResult[] = [
        checkConfigExists(projectPath),
        checkPackageJson(projectPath),
        checkNodeModules(projectPath),
        checkLockfile(projectPath),
        checkTypeScriptConfig(projectPath),
      ];
      categories.push({ name: "Project Structure", results: structureResults });

      // Environment
      const envResults: DiagnosticResult[] = [
        checkEnvFiles(projectPath),
        ...checkRequiredEnvVars(projectPath, config),
      ];
      categories.push({ name: "Environment", results: envResults });

      // Presets
      const presetResults = checkPresetFiles(projectPath, config);
      if (presetResults.length > 0) {
        categories.push({ name: "Presets", results: presetResults });
      }

      // Monorepo
      const monorepoResults = checkMonorepoStructure(projectPath, config);
      if (monorepoResults.length > 0) {
        categories.push({ name: "Monorepo", results: monorepoResults });
      }

      console.log(JSON.stringify(categories, null, 2));
      return;
    }

    consola.start("Running project diagnostics...\n");

    const config = loadConfig(projectPath);
    const categories: DiagnosticCategory[] = [];

    // Project Structure
    const structureResults: DiagnosticResult[] = [
      checkConfigExists(projectPath),
      checkPackageJson(projectPath),
      checkNodeModules(projectPath),
      checkLockfile(projectPath),
      checkTypeScriptConfig(projectPath),
    ];
    categories.push({ name: "Project Structure", results: structureResults });

    // Environment
    const envResults: DiagnosticResult[] = [
      checkEnvFiles(projectPath),
      ...checkRequiredEnvVars(projectPath, config),
    ];
    categories.push({ name: "Environment", results: envResults });

    // Presets
    const presetResults = checkPresetFiles(projectPath, config);
    if (presetResults.length > 0) {
      categories.push({ name: "Presets", results: presetResults });
    }

    // Monorepo
    const monorepoResults = checkMonorepoStructure(projectPath, config);
    if (monorepoResults.length > 0) {
      categories.push({ name: "Monorepo", results: monorepoResults });
    }

    // Display results
    const { passCount, warnCount, failCount } = displayResults(categories);

    // Summary
    consola.log("");
    consola.box(
      `Diagnostics Complete\n\n` +
        `✓ ${passCount} passed\n` +
        `! ${warnCount} warnings\n` +
        `✗ ${failCount} failed`
    );

    if (failCount > 0) {
      process.exit(1);
    }
  },
});
