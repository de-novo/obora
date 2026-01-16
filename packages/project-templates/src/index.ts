/**
 * @obora/project-templates
 *
 * Project templates for obora-kit scaffolding.
 * Provides base templates (monorepo, single) and app module templates.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// ============================================================================
// Path Resolution
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the absolute path to the templates directory.
 * Works in both development (src/) and production (dist/) environments.
 */
export function getTemplatesDir(): string {
  // In production: dist/index.js -> ../templates
  // In development: src/index.ts -> ../templates
  return join(__dirname, "..", "templates");
}

/**
 * Get path to a specific base template
 */
export function getBaseTemplatePath(baseName: BaseName): string {
  return join(getTemplatesDir(), "base", baseName, "files");
}

/**
 * Get path to a specific app module template
 */
export function getAppTemplatePath(appName: AppModuleName): string {
  return join(getTemplatesDir(), "apps", appName, "files");
}

// ============================================================================
// Base Templates
// ============================================================================

export interface BaseTemplateConfig {
  name: string;
  description: string;
  features: string[];
}

export const BASE_TEMPLATES: Record<string, BaseTemplateConfig> = {
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

export type BaseName = keyof typeof BASE_TEMPLATES;
export const BASE_NAMES = Object.keys(BASE_TEMPLATES) as BaseName[];

// ============================================================================
// App Module Templates
// ============================================================================

export interface AppModuleTemplateConfig {
  name: string;
  description: string;
  features: string[];
  targetDir: string;
  requires?: string[];
  slots: string[];
}

export const APP_MODULE_TEMPLATES: Record<string, AppModuleTemplateConfig> = {
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

export type AppModuleName = keyof typeof APP_MODULE_TEMPLATES;
export const APP_MODULE_NAMES = Object.keys(APP_MODULE_TEMPLATES) as AppModuleName[];

// ============================================================================
// Utilities
// ============================================================================

/**
 * Check if a base template exists
 */
export function isValidBaseName(name: string): name is BaseName {
  return name in BASE_TEMPLATES;
}

/**
 * Check if an app module template exists
 */
export function isValidAppModuleName(name: string): name is AppModuleName {
  return name in APP_MODULE_TEMPLATES;
}

/**
 * Get all available template names
 */
export function getAllTemplateNames(): {
  bases: BaseName[];
  apps: AppModuleName[];
} {
  return {
    bases: BASE_NAMES,
    apps: APP_MODULE_NAMES,
  };
}
