/**
 * Template loading utilities for code generation
 *
 * Templates are loaded from two sources:
 * 1. Built-in templates (bundled with the package)
 * 2. User custom templates (from project's .obora/templates directory)
 *
 * User templates take precedence over built-in templates.
 */
import { promises as fs } from "node:fs";
import { join, dirname } from "pathe";
import { fileURLToPath } from "node:url";
import { fileExists } from "../utils/fs";

// ============================================================================
// Types
// ============================================================================

export type TemplateName = "providers" | "layout";

export interface TemplateOptions {
  /**
   * Project root directory for user template lookup.
   * If not provided, only built-in templates are used.
   */
  projectRoot?: string;
}

// ============================================================================
// Template Cache
// ============================================================================

const templateCache = new Map<string, string>();

/**
 * Clear the template cache.
 * Useful for testing or when templates might have changed.
 */
export function clearTemplateCache(): void {
  templateCache.clear();
}

// ============================================================================
// Template Paths
// ============================================================================

/**
 * Get the directory containing built-in templates.
 */
function getBuiltinTemplatesDir(): string {
  // __dirname equivalent for ESM
  const currentDir = dirname(fileURLToPath(import.meta.url));
  return currentDir;
}

/**
 * Get the path to a user template in the project.
 */
function getUserTemplatePath(projectRoot: string, name: TemplateName): string {
  return join(projectRoot, ".obora", "templates", `${name}.tsx`);
}

/**
 * Get the path to a built-in template.
 */
function getBuiltinTemplatePath(name: TemplateName): string {
  return join(getBuiltinTemplatesDir(), `${name}.tsx`);
}

// ============================================================================
// Template Loading
// ============================================================================

/**
 * Load a template by name.
 *
 * Resolution order:
 * 1. User template (project/.obora/templates/{name}.tsx)
 * 2. Built-in template (package templates/{name}.tsx)
 *
 * @param name - Template name
 * @param options - Template options
 * @returns Template content
 * @throws Error if template is not found
 */
export async function loadTemplate(
  name: TemplateName,
  options?: TemplateOptions
): Promise<string> {
  // Check cache first
  const cacheKey = options?.projectRoot ? `${options.projectRoot}:${name}` : `builtin:${name}`;
  const cached = templateCache.get(cacheKey);
  if (cached !== undefined) {
    return cached;
  }

  // Try user template first if projectRoot is provided
  if (options?.projectRoot) {
    const userPath = getUserTemplatePath(options.projectRoot, name);
    if (await fileExists(userPath)) {
      const content = await fs.readFile(userPath, "utf-8");
      templateCache.set(cacheKey, content);
      return content;
    }
  }

  // Fall back to built-in template
  const builtinPath = getBuiltinTemplatePath(name);
  if (await fileExists(builtinPath)) {
    const content = await fs.readFile(builtinPath, "utf-8");
    templateCache.set(cacheKey, content);
    return content;
  }

  throw new Error(`Template not found: ${name}`);
}

/**
 * Check if a user template exists for the given name.
 */
export async function hasUserTemplate(
  name: TemplateName,
  projectRoot: string
): Promise<boolean> {
  const userPath = getUserTemplatePath(projectRoot, name);
  return fileExists(userPath);
}

/**
 * Get the path where a user template would be located.
 * Useful for displaying instructions to users.
 */
export function getUserTemplateLocation(
  name: TemplateName,
  projectRoot: string
): string {
  return getUserTemplatePath(projectRoot, name);
}

// ============================================================================
// Template Utilities
// ============================================================================

/**
 * Get all available template names.
 */
export function getTemplateNames(): TemplateName[] {
  return ["providers", "layout"];
}

/**
 * Get template descriptions for help/documentation.
 */
export function getTemplateDescriptions(): Record<TemplateName, string> {
  return {
    providers: "Next.js App Router providers wrapper component (app/providers.tsx)",
    layout: "Next.js App Router root layout component (app/layout.tsx)",
  };
}
