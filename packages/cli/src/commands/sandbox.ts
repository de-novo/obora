import { defineCommand } from "citty";
import { consola } from "consola";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "pathe";
import { type AppModuleInstance, assembleProject } from "../utils/assembler";
import {
  APP_MODULES,
  APP_MODULE_NAMES,
  type AppModuleName,
  CATEGORY_CONFIGS,
  type Category,
  PRESETS,
  resolvePresetName,
} from "../utils/constants";
import { fileExists, readJson } from "../utils/fs";

interface SandboxCase {
  name?: string;
  base?: "single" | "monorepo";
  apps?: string[];
  presets?: string[] | Record<string, string>;
  presetTargets?: Record<string, string>;
  packageManager?: "pnpm" | "npm" | "yarn" | "bun";
}

function defaultAppInstance(moduleName: AppModuleName, base: "single" | "monorepo"): AppModuleInstance {
  const moduleConfig = APP_MODULES[moduleName];
  const defaultName = moduleConfig?.targetDir?.split("/").pop() || moduleName;
  const targetDir = base === "single"
    ? "."
    : (moduleConfig?.targetDir?.startsWith("packages/")
      ? join("packages", defaultName)
      : join("apps", defaultName));
  return { name: defaultName, module: moduleName, targetDir };
}

function normalizeApps(
  apps: string[] | undefined,
  base: "single" | "monorepo"
): AppModuleInstance[] {
  if (!apps || apps.length === 0) {
    return [];
  }
  const normalized: AppModuleInstance[] = [];
  for (const app of apps) {
    const separator = app.includes(":") ? ":" : app.includes("=") ? "=" : null;
    const [rawModule, rawName] = separator ? app.split(separator) : [app, ""];
    const moduleName = rawModule.trim() as AppModuleName;
    if (APP_MODULE_NAMES.includes(moduleName)) {
      const moduleConfig = APP_MODULES[moduleName];
      const defaultName = moduleConfig?.targetDir?.split("/").pop() || moduleName;
      const name = rawName?.trim() || defaultName;
      const targetDir = base === "single"
        ? "."
        : (moduleConfig?.targetDir?.startsWith("packages/")
          ? join("packages", name)
          : join("apps", name));
      normalized.push({ name, module: moduleName, targetDir });
    } else {
      throw new Error(`Unknown app module: ${app}`);
    }
  }
  return normalized;
}

function emptyPresetSelection(): Record<Category, { preset: string; version: string } | null> {
  const selection = {} as Record<Category, { preset: string; version: string } | null>;
  for (const category of Object.keys(CATEGORY_CONFIGS) as Category[]) {
    selection[category] = null;
  }
  return selection;
}

function normalizePresets(
  presets: string[] | Record<string, string> | undefined
): Record<Category, { preset: string; version: string } | null> {
  const selection = emptyPresetSelection();
  if (!presets) {
    return selection;
  }

  const presetNames = Array.isArray(presets)
    ? presets
    : Object.values(presets);

  for (const rawName of presetNames) {
    const presetName = resolvePresetName(rawName);
    const info = PRESETS[presetName];
    if (!info) {
      throw new Error(`Unknown preset: ${presetName}`);
    }
    const category = info.category;
    if (CATEGORY_CONFIGS[category]?.exclusive && selection[category]) {
      throw new Error(`Category "${category}" already has "${selection[category]!.preset}"`);
    }
    selection[category] = { preset: presetName, version: info.version };
  }

  return selection;
}

function deriveBestPracticeTargets(
  apps: AppModuleInstance[],
  presets: string[] | Record<string, string> | undefined
): Record<string, string> {
  const targets: Record<string, string> = {};
  if (!presets || apps.length === 0) {
    return targets;
  }
  const presetNames = Array.isArray(presets)
    ? presets
    : Object.values(presets);
  const normalized = new Set(presetNames.map((name) => resolvePresetName(name)));
  const hasNextjs = apps.some((app) => app.module === "nextjs-web");

  if (hasNextjs) {
    if (normalized.has("tanstack-query")) {
      targets["tanstack-query"] = "nextjs-auto";
    }
    if (normalized.has("next-intl")) {
      targets["next-intl"] = "nextjs-auto";
    }
    if (normalized.has("next-themes")) {
      targets["next-themes"] = "nextjs-auto";
    }
  }

  return targets;
}

async function loadCases(casesPath: string): Promise<SandboxCase[]> {
  if (!(await fileExists(casesPath))) {
    throw new Error(`Cases file not found: ${casesPath}`);
  }
  const raw = await readJson<any>(casesPath);
  if (Array.isArray(raw)) {
    return raw as SandboxCase[];
  }
  if (raw && Array.isArray(raw.cases)) {
    return raw.cases as SandboxCase[];
  }
  throw new Error("Invalid cases file format. Expected array or { cases: [] }");
}

export const sandboxCommand = defineCommand({
  meta: {
    name: "sandbox",
    description: "Run preset/app combinations in a sandbox project",
  },
  args: {
    cases: {
      type: "string",
      description: "Path to JSON cases file",
    },
    base: {
      type: "string",
      description: "Base template: single or monorepo",
      default: "single",
    },
    apps: {
      type: "string",
      description: "Comma-separated app modules (e.g., nestjs-api,nextjs-web)",
    },
    presets: {
      type: "string",
      description: "Comma-separated preset names (e.g., clerk,drizzle)",
    },
    outDir: {
      type: "string",
      description: "Output directory for sandboxes",
    },
    keep: {
      type: "boolean",
      description: "Keep sandbox directories after run",
      default: false,
    },
    packageManager: {
      type: "string",
      description: "Package manager to set in templates",
      default: "pnpm",
    },
  },
  async run({ args }) {
    const cases = args.cases
      ? await loadCases(resolve(args.cases))
      : [{
        name: "sandbox",
        base: args.base as "single" | "monorepo",
        apps: args.apps ? args.apps.split(",").map((s) => s.trim()).filter(Boolean) : [],
        presets: args.presets ? args.presets.split(",").map((s) => s.trim()).filter(Boolean) : [],
        packageManager: args.packageManager as "pnpm" | "npm" | "yarn" | "bun",
      }];

    const rootDir = args.outDir ? resolve(args.outDir) : tmpdir();
    const createdDirs: string[] = [];

    for (const [index, item] of cases.entries()) {
      const name = item.name || `case-${index + 1}`;
      const caseDir = join(rootDir, `obora-sandbox-${Date.now()}-${name}`);
      createdDirs.push(caseDir);

      consola.start(`Sandbox: ${name}`);
      await fs.mkdir(caseDir, { recursive: true });

      const apps = normalizeApps(item.apps, item.base || "single");
      const presets = normalizePresets(item.presets);
      const presetTargets = item.presetTargets || deriveBestPracticeTargets(apps, item.presets);
      await assembleProject({
        base: item.base || "single",
        projectName: name,
        targetDir: caseDir,
        apps,
        presets,
        packageManager: item.packageManager || "pnpm",
        presetTargets,
      });
      consola.success(`Sandbox ready: ${caseDir}`);
    }

    if (!args.keep) {
      for (const dir of createdDirs) {
        await fs.rm(dir, { recursive: true, force: true });
      }
      consola.info("Sandbox cleaned up");
    } else {
      consola.info("Sandbox kept:");
      for (const dir of createdDirs) {
        consola.info(`  - ${dir}`);
      }
    }
  },
});
