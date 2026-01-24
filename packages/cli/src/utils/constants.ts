import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "pathe";
import {
  getTemplatesDir,
  BASE_TEMPLATES,
  APP_MODULE_TEMPLATES,
  BASE_NAMES as TEMPLATE_BASE_NAMES,
  APP_MODULE_NAMES as TEMPLATE_APP_MODULE_NAMES,
  type BaseName as TemplateBaseName,
  type AppModuleName as TemplateAppModuleName,
} from "@obora/project-templates";

// ============================================================================
// Directory Paths
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Re-export from @obora/project-templates
export const TEMPLATES_DIR = getTemplatesDir();

// Presets directory - still in repo root
function getPresetsPath(): string {
  // Try production path first (from dist/)
  const prodPath = join(__dirname, "../../..");
  if (existsSync(join(prodPath, "presets"))) {
    return join(prodPath, "presets");
  }
  // Try development path (from src/utils/)
  const devPath = join(__dirname, "../../../..");
  if (existsSync(join(devPath, "presets"))) {
    return join(devPath, "presets");
  }
  // Walk up to find repo root containing presets
  let current = __dirname;
  for (let i = 0; i < 8; i++) {
    const candidate = join(current, "..");
    if (existsSync(join(candidate, "presets"))) {
      return join(candidate, "presets");
    }
    current = candidate;
  }
  // Fallback to production assumption
  return join(prodPath, "presets");
}

export const PRESETS_DIR = getPresetsPath();

// ============================================================================
// Base Types
// ============================================================================

export interface BaseConfig {
  name: string;
  description: string;
  features: string[];
}

export interface AppModuleConfig {
  name: string;
  description: string;
  features: string[];
  targetDir: string; // e.g., "apps/web", "apps/api", "packages/database"
  requires?: string[]; // Other app modules this depends on
  slots: string[]; // Which preset categories this module supports
}

export interface CategoryConfig {
  name: string;
  description: string;
  exclusive: boolean;
}

export interface PresetOperations {
  replace: string[];
  merge: string[];
  add: string[];
  remove: string[];
}

export interface PresetEnvVar {
  key: string;
  description: string;
  required: boolean;
  secret: boolean;
  example?: string;
}

// ============================================================================
// Shared Files (Use Transform Instead of Direct File Inclusion)
// ============================================================================

export const SHARED_APP_FILE_PATHS = [
  "app/layout.tsx",
  "app/providers.tsx",
  "src/app.module.ts",
];

export function isForbiddenPresetFilePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  return SHARED_APP_FILE_PATHS.some(
    (path) => normalized === path || normalized.endsWith(`/${path}`)
  );
}

export interface PresetConfig {
  name: string;
  category: Category;
  description: string;
  operations: PresetOperations;
  conflicts: string[];
  requires: string[];
  env: PresetEnvVar[];
  postInstall?: string[];
}

// ============================================================================
// Bases (re-exported from @obora/project-templates)
// ============================================================================

export const BASES = BASE_TEMPLATES;
export type BaseName = TemplateBaseName;
export const BASE_NAMES = TEMPLATE_BASE_NAMES;

// ============================================================================
// App Modules (re-exported from @obora/project-templates)
// ============================================================================

export const APP_MODULES = APP_MODULE_TEMPLATES;
export type AppModuleName = TemplateAppModuleName;
export const APP_MODULE_NAMES = TEMPLATE_APP_MODULE_NAMES;

// ============================================================================
// Categories (Preset Categories)
// ============================================================================

export const CATEGORY_CONFIGS: Record<string, CategoryConfig> = {
  linting: {
    name: "linting",
    description: "Linting & Formatting",
    exclusive: true,
  },
  database: {
    name: "database",
    description: "Database & ORM",
    exclusive: true,
  },
  auth: {
    name: "auth",
    description: "Authentication",
    exclusive: true,
  },
  api: {
    name: "api",
    description: "API Framework",
    exclusive: false,
  },
  payment: {
    name: "payment",
    description: "Payment Processing",
    exclusive: true,
  },
  analytics: {
    name: "analytics",
    description: "Analytics & Tracking",
    exclusive: false,
  },
  "data-fetching": {
    name: "data-fetching",
    description: "Data Fetching",
    exclusive: false,
  },
  state: {
    name: "state",
    description: "State Management",
    exclusive: false,
  },
  i18n: {
    name: "i18n",
    description: "Internationalization",
    exclusive: false,
  },
  theming: {
    name: "theming",
    description: "Themes & Color Modes",
    exclusive: false,
  },
  ui: {
    name: "ui",
    description: "UI Components",
    exclusive: false,
  },
  email: {
    name: "email",
    description: "Email Service",
    exclusive: true,
  },
  ai: {
    name: "ai",
    description: "AI Integration",
    exclusive: false,
  },
  storage: {
    name: "storage",
    description: "File Storage",
    exclusive: true,
  },
  validation: {
    name: "validation",
    description: "Schema Validation",
    exclusive: true,
  },
  testing: {
    name: "testing",
    description: "Testing Framework",
    exclusive: true,
  },
  form: {
    name: "form",
    description: "Form Handling",
    exclusive: false,
  },
} as const;

export const CATEGORIES = Object.keys(CATEGORY_CONFIGS) as Category[];

export type Category =
  | "linting"
  | "database"
  | "auth"
  | "api"
  | "payment"
  | "analytics"
  | "data-fetching"
  | "state"
  | "i18n"
  | "theming"
  | "ui"
  | "email"
  | "ai"
  | "storage"
  | "validation"
  | "testing"
  | "form";

// ============================================================================
// Presets
// ============================================================================

export interface PresetInfo {
  name: string;
  category: Category;
  description: string;
  version: string;
}

let PRESET_REGISTRY: Record<string, PresetInfo> | null = null;

function loadPresetRegistry(): Record<string, PresetInfo> {
  const registry: Record<string, PresetInfo> = {};
  let categoryDirs: string[] = [];

  try {
    categoryDirs = readdirSync(PRESETS_DIR);
  } catch {
    return registry;
  }

  for (const category of categoryDirs) {
    const categoryPath = join(PRESETS_DIR, category);
    let presetDirs: string[] = [];

    try {
      presetDirs = readdirSync(categoryPath);
    } catch {
      continue;
    }

    for (const presetName of presetDirs) {
      const manifestPath = join(categoryPath, presetName, "manifest.json");
      try {
        const raw = readFileSync(manifestPath, "utf-8");
        const manifest = JSON.parse(raw) as {
          name?: string;
          category?: string;
          description?: string;
          version?: string;
        };
        if (!manifest.name || !manifest.category || !manifest.description) {
          continue;
        }
        registry[manifest.name] = {
          name: manifest.name,
          category: manifest.category as Category,
          description: manifest.description,
          version: manifest.version || "1.0.0",
        };
      } catch {
        continue;
      }
    }
  }

  return registry;
}

export function getPresetRegistry(): Record<string, PresetInfo> {
  if (!PRESET_REGISTRY) {
    PRESET_REGISTRY = loadPresetRegistry();
  }
  return PRESET_REGISTRY;
}

export const PRESETS: Record<string, PresetInfo> = getPresetRegistry();

export type PresetName = keyof typeof PRESETS;

// Preset aliases (user-facing shortcuts -> canonical preset)
const PRESET_ALIASES: Record<string, string> = {
  "clerk-nextjs": "clerk",
};

export function resolvePresetName(presetName: string): string {
  return PRESET_ALIASES[presetName] ?? presetName;
}

// ============================================================================
// Slot Defaults (per app module)
// ============================================================================

export const SLOT_DEFAULTS: Record<string, Record<string, string>> = {
  "nextjs-web": {
    linting: "biome",
  },
  "nestjs-api": {
    linting: "biome",
  },
  "shared-database": {
    database: "prisma",
  },
};

// ============================================================================
// Utilities
// ============================================================================

export function getPresetsByCategory(category: Category): string[] {
  return Object.entries(getPresetRegistry())
    .filter(([_, preset]) => preset.category === category)
    .map(([name]) => name);
}

export function isExclusiveCategory(category: Category): boolean {
  return CATEGORY_CONFIGS[category]?.exclusive ?? true;
}

export function getAppModuleSlots(moduleName: AppModuleName): string[] {
  return APP_MODULES[moduleName]?.slots ?? [];
}

export function getSlotDefault(moduleName: AppModuleName, slotName: string): string | undefined {
  return SLOT_DEFAULTS[moduleName]?.[slotName];
}

export function getRequiredSlotsForModules(moduleNames: AppModuleName[]): Category[] {
  const slots = new Set<Category>();

  for (const moduleName of moduleNames) {
    const moduleSlots = APP_MODULES[moduleName]?.slots ?? [];
    for (const slot of moduleSlots) {
      if (isExclusiveCategory(slot as Category)) {
        slots.add(slot as Category);
      }
    }
  }

  return Array.from(slots);
}

