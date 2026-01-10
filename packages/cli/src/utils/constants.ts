import { join, dirname } from "pathe";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

// ============================================================================
// Directory Paths
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Detect environment based on path structure
// - In production (dist): __dirname = .../cli/dist, need 3 levels up
// - In development (src/utils): __dirname = .../cli/src/utils, need 4 levels up
function getBasePath(): string {
  // Try production path first (from dist/)
  const prodPath = join(__dirname, "../../..");
  if (existsSync(join(prodPath, "templates"))) {
    return prodPath;
  }
  // Try development path (from src/utils/)
  const devPath = join(__dirname, "../../../..");
  if (existsSync(join(devPath, "templates"))) {
    return devPath;
  }
  // Fallback to production assumption
  return prodPath;
}

const BASE_PATH = getBasePath();
export const TEMPLATES_DIR = join(BASE_PATH, "templates");
export const PRESETS_DIR = join(BASE_PATH, "presets");

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

export interface PresetInjectOperation {
  file: string;
  marker: string;
  content: string;
}

export interface PresetOperations {
  replace: string[];
  merge: string[];
  add: string[];
  remove: string[];
  inject: PresetInjectOperation[];
}

export interface PresetEnvVar {
  key: string;
  description: string;
  required: boolean;
  secret: boolean;
  example?: string;
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
// Bases
// ============================================================================

export const BASES: Record<string, BaseConfig> = {
  monorepo: {
    name: "monorepo",
    description: "Turborepo monorepo structure",
    features: ["Turborepo", "pnpm workspaces", "Shared configs"],
  },
  single: {
    name: "single",
    description: "Single project structure",
    features: ["Simple setup", "No workspace overhead"],
  },
} as const;

export type BaseName = keyof typeof BASES;
export const BASE_NAMES = Object.keys(BASES) as BaseName[];

// ============================================================================
// App Modules
// ============================================================================

export const APP_MODULES: Record<string, AppModuleConfig> = {
  "nextjs-web": {
    name: "nextjs-web",
    description: "Next.js 15 web application",
    features: ["Next.js 15", "App Router", "Tailwind CSS v4", "shadcn/ui"],
    targetDir: "apps/web",
    slots: ["linting", "analytics", "auth"],
  },
  "nestjs-api": {
    name: "nestjs-api",
    description: "NestJS 11 API server",
    features: ["NestJS 11", "Fastify", "Swagger", "Effect Schema"],
    targetDir: "apps/api",
    slots: ["linting", "database", "auth", "payment", "email", "storage", "ai", "validation"],
  },
  "shared-database": {
    name: "shared-database",
    description: "Shared database package",
    features: ["Prisma/Drizzle", "Type-safe queries", "Migrations"],
    targetDir: "packages/database",
    slots: ["database"],
  },
  "shared-ui": {
    name: "shared-ui",
    description: "Shared UI component library",
    features: ["React components", "Tailwind CSS", "shadcn/ui"],
    targetDir: "packages/ui",
    slots: [],
  },
} as const;

export type AppModuleName = keyof typeof APP_MODULES;
export const APP_MODULE_NAMES = Object.keys(APP_MODULES) as AppModuleName[];

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
} as const;

export const CATEGORIES = Object.keys(CATEGORY_CONFIGS) as Category[];

export type Category =
  | "linting"
  | "database"
  | "auth"
  | "payment"
  | "analytics"
  | "email"
  | "ai"
  | "storage"
  | "validation";

// ============================================================================
// Presets
// ============================================================================

export interface PresetInfo {
  name: string;
  category: Category;
  description: string;
  version: string;
}

export const PRESETS: Record<string, PresetInfo> = {
  // Linting
  biome: {
    name: "biome",
    category: "linting",
    description: "Biome - Fast linter & formatter",
    version: "1.9.0",
  },
  "eslint-prettier": {
    name: "eslint-prettier",
    category: "linting",
    description: "ESLint + Prettier",
    version: "9.0.0",
  },
  // Database
  drizzle: {
    name: "drizzle",
    category: "database",
    description: "Drizzle ORM - Type-safe SQL",
    version: "0.45.0",
  },
  prisma: {
    name: "prisma",
    category: "database",
    description: "Prisma ORM - Type-safe ORM",
    version: "7.0.0",
  },
  // Auth
  clerk: {
    name: "clerk",
    category: "auth",
    description: "Clerk - NestJS authentication",
    version: "1.25.0",
  },
  "clerk-nextjs": {
    name: "clerk-nextjs",
    category: "auth",
    description: "Clerk - Next.js authentication",
    version: "6.0.0",
  },
  "better-auth": {
    name: "better-auth",
    category: "auth",
    description: "Better Auth - Self-hosted authentication",
    version: "1.4.0",
  },
  // Payment
  polar: {
    name: "polar",
    category: "payment",
    description: "Polar - Merchant of Record",
    version: "1.0.0",
  },
  paddle: {
    name: "paddle",
    category: "payment",
    description: "Paddle - Merchant of Record",
    version: "1.0.0",
  },
  // Analytics
  umami: {
    name: "umami",
    category: "analytics",
    description: "Umami - Privacy-focused analytics",
    version: "2.0.0",
  },
  posthog: {
    name: "posthog",
    category: "analytics",
    description: "PostHog - Product analytics",
    version: "1.200.0",
  },
  // Email
  resend: {
    name: "resend",
    category: "email",
    description: "Resend - Developer email",
    version: "4.0.0",
  },
  // AI
  "vercel-ai": {
    name: "vercel-ai",
    category: "ai",
    description: "Vercel AI SDK",
    version: "4.0.0",
  },
  // Storage
  uploadthing: {
    name: "uploadthing",
    category: "storage",
    description: "UploadThing - File uploads",
    version: "7.0.0",
  },
  "cloudflare-r2": {
    name: "cloudflare-r2",
    category: "storage",
    description: "Cloudflare R2 - Object storage",
    version: "1.0.0",
  },
  // Validation
  zod: {
    name: "zod",
    category: "validation",
    description: "Zod - TypeScript-first schema",
    version: "3.24.0",
  },
  "effect-schema": {
    name: "effect-schema",
    category: "validation",
    description: "Effect Schema - Functional validation",
    version: "3.19.0",
  },
};

export type PresetName = keyof typeof PRESETS;

// ============================================================================
// Slot Defaults (per app module)
// ============================================================================

export const SLOT_DEFAULTS: Record<string, Record<string, string>> = {
  "nextjs-web": {
    linting: "biome",
  },
  "nestjs-api": {
    linting: "biome",
    validation: "effect-schema",
  },
  "shared-database": {
    database: "prisma",
  },
};

// ============================================================================
// Utilities
// ============================================================================

export function getPresetsByCategory(category: Category): string[] {
  return Object.entries(PRESETS)
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

