/**
 * AST-based code transformation utilities using magicast
 *
 * Provides intelligent code transformations that understand AST structure,
 * preserving original formatting while making targeted modifications.
 */
import { parseModule, generateCode, builders } from "magicast";
import { promises as fs } from "node:fs";
import { consola } from "consola";
import { fileExists } from "./fs";
import { loadTemplate, type TemplateName } from "../templates";

// ============================================================================
// Types
// ============================================================================

export interface TransformResult {
  success: boolean;
  content?: string;
  error?: string;
  changed?: boolean;
  /** Preview of changes in dry-run mode */
  preview?: string;
}

export interface TransformOptions {
  /**
   * If true, returns preview of changes without modifying files.
   * Useful for showing users what will be changed before applying.
   */
  dryRun?: boolean;
  /**
   * Project root directory for user template lookup.
   * If provided, user templates from .obora/templates/ take precedence.
   */
  projectRoot?: string;
}

export interface ImportSpec {
  /** Module specifier (e.g., "@nestjs/common") */
  from: string;
  /** Named imports (e.g., ["Module", "Injectable"]) */
  named?: string[];
  /** Default import name */
  default?: string;
  /** Namespace import name (import * as X) */
  namespace?: string;
}

export interface TransformOperation {
  type: "import" | "export" | "dependency" | "config" | "nestjs-module" | "provider-wrap" | "json-property" | "layout-component";
  /** For import: ImportSpec, for dependency: { name, version, dev? } */
  spec: ImportSpec | ExportSpec | DependencySpec | ConfigSpec | NestJsModuleSpec | ProviderWrapSpec | JsonPropertySpec | LayoutComponentSpec;
}

export interface DependencySpec {
  name: string;
  version: string;
  dev?: boolean;
}

export interface ConfigSpec {
  /** Dot-notation path (e.g., "scripts.build") */
  path: string;
  value: unknown;
}

export interface NestJsModuleSpec {
  /** Module name to add (e.g., "PrismaModule") */
  module: string;
}

export interface ProviderWrapSpec {
  /** Provider component name (e.g., "QueryProvider") */
  provider: string;
  /** Optional props to pass to the provider */
  props?: Record<string, string>;
}

export interface ExportSpec {
  /** What to export (e.g., "UserService", "{ User, UserRole }") */
  exported: string;
  /** Optional source module for re-exports (e.g., "./user.service") */
  from?: string;
  /** Export as default */
  default?: boolean;
}

export interface JsonPropertySpec {
  /** Dot-notation path (e.g., "compilerOptions.strict") */
  path: string;
  /** Value to set */
  value: unknown;
  /** If true, merge objects/arrays instead of replacing */
  merge?: boolean;
}

export interface LayoutComponentSpec {
  /** Component to add (e.g., "UmamiScript") */
  component: string;
  /** Where to add in layout.tsx */
  position: "body-start" | "body-end" | "html-start" | "html-end";
  /** Optional props as key-value pairs */
  props?: Record<string, string>;
  /** Self-closing tag (default: true) */
  selfClosing?: boolean;
}

// ============================================================================
// Import Transformations
// ============================================================================

/**
 * Add an import statement to a TypeScript/JavaScript file using AST manipulation.
 * Preserves existing imports and formatting.
 *
 * @param filePath - Path to the file to modify
 * @param importSpec - Import specification
 * @param options - Transform options (including dryRun)
 * @returns TransformResult with success status and new content
 */
export async function addImport(
  filePath: string,
  importSpec: ImportSpec,
  options?: TransformOptions
): Promise<TransformResult> {
  try {
    if (!(await fileExists(filePath))) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const content = await fs.readFile(filePath, "utf-8");
    const mod = parseModule(content);

    // Check if import already exists
    const existingImport = findExistingImport(mod, importSpec.from);

    if (existingImport) {
      // Merge with existing import
      const merged = mergeImports(existingImport, importSpec, mod);
      if (!merged) {
        return { success: true, changed: false, content };
      }
    } else {
      // Add new import
      addNewImport(mod, importSpec);
    }

    const result = generateCode(mod);
    // Fix double semicolons that magicast sometimes generates
    const fixedCode = result.code.replace(/;;+/g, ";");

    // Dry-run mode: return preview without writing
    if (options?.dryRun) {
      return { success: true, changed: true, content, preview: fixedCode };
    }

    await fs.writeFile(filePath, fixedCode);

    return { success: true, changed: true, content: fixedCode };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to add import: ${message}` };
  }
}

/**
 * Find an existing import from the same module
 */
interface ImportDeclarationNode {
  type: string;
  source?: { value: string };
  specifiers?: Array<{ type: string; local?: { name: string }; imported?: { name: string } }>;
}

function findExistingImport(mod: ReturnType<typeof parseModule>, from: string): ImportDeclarationNode | null {
  // Access the AST program body
  const program = mod.$ast as { body?: ImportDeclarationNode[] };
  if (!program.body) return null;

  for (const node of program.body) {
    if (node.type === "ImportDeclaration" && node.source?.value === from) {
      return node;
    }
  }
  return null;
}

/**
 * Merge new import specifiers with existing import
 */
function mergeImports(
  existingNode: ImportDeclarationNode,
  importSpec: ImportSpec,
  _mod: ReturnType<typeof parseModule>
): boolean {
  if (!importSpec.named || importSpec.named.length === 0) {
    return false;
  }

  const existingNames = new Set<string>();
  if (existingNode.specifiers) {
    for (const spec of existingNode.specifiers) {
      if (spec.type === "ImportSpecifier" && spec.local?.name) {
        existingNames.add(spec.local.name);
      }
    }
  }

  // Check if all named imports already exist
  const newNames = importSpec.named.filter((name) => !existingNames.has(name));
  if (newNames.length === 0) {
    return false;
  }

  // Add new specifiers to existing import
  if (existingNode.specifiers) {
    for (const name of newNames) {
      existingNode.specifiers.push({
        type: "ImportSpecifier",
        local: { name },
        imported: { name },
      } as typeof existingNode.specifiers[0]);
    }
  }

  return true;
}

/**
 * Add a new import declaration
 */
function addNewImport(mod: ReturnType<typeof parseModule>, importSpec: ImportSpec): void {
  // Build import statement string
  let importStr = "import ";

  if (importSpec.default) {
    importStr += importSpec.default;
    if (importSpec.named && importSpec.named.length > 0) {
      importStr += ", ";
    }
  }

  if (importSpec.namespace) {
    importStr += `* as ${importSpec.namespace}`;
  } else if (importSpec.named && importSpec.named.length > 0) {
    importStr += `{ ${importSpec.named.join(", ")} }`;
  }

  importStr += ` from "${importSpec.from}"`;

  // Use magicast's imports helper
  mod.imports.$add({
    from: importSpec.from,
    imported: importSpec.default || (importSpec.named ? importSpec.named[0] : "default"),
    local: importSpec.default || (importSpec.named ? importSpec.named[0] : undefined),
  });

  // For multiple named imports, add the rest
  if (importSpec.named && importSpec.named.length > 1) {
    for (let i = 1; i < importSpec.named.length; i++) {
      mod.imports.$add({
        from: importSpec.from,
        imported: importSpec.named[i],
        local: importSpec.named[i],
      });
    }
  }
}

// ============================================================================
// Dependency Transformations
// ============================================================================

/**
 * Add a dependency to package.json using AST manipulation.
 * Preserves existing structure and formatting.
 *
 * @param packageJsonPath - Path to package.json
 * @param spec - Dependency specification
 * @param options - Transform options (including dryRun)
 * @returns TransformResult with success status
 */
export async function addDependency(
  packageJsonPath: string,
  spec: DependencySpec,
  options?: TransformOptions
): Promise<TransformResult> {
  try {
    if (!(await fileExists(packageJsonPath))) {
      return { success: false, error: `File not found: ${packageJsonPath}` };
    }

    const content = await fs.readFile(packageJsonPath, "utf-8");
    const mod = parseModule(content, { sourceFileName: "package.json" });

    const targetKey = spec.dev ? "devDependencies" : "dependencies";

    // Check if already exists
    const exports = mod.exports;
    const defaultExport = exports.default;

    if (defaultExport && typeof defaultExport === "object") {
      const deps = (defaultExport as Record<string, Record<string, string>>)[targetKey];

      if (deps && deps[spec.name]) {
        // Already exists
        return { success: true, changed: false, content };
      }

      // Add dependency
      if (!deps) {
        (defaultExport as Record<string, Record<string, string>>)[targetKey] = {};
      }
      (defaultExport as Record<string, Record<string, string>>)[targetKey][spec.name] = spec.version;
    } else {
      // package.json might not have default export structure
      // Fall back to JSON manipulation
      return addDependencyJson(packageJsonPath, spec, options);
    }

    const result = generateCode(mod);
    // Fix double semicolons that magicast sometimes generates
    const fixedCode = result.code.replace(/;;+/g, ";");

    // Dry-run mode: return preview without writing
    if (options?.dryRun) {
      return { success: true, changed: true, content, preview: fixedCode };
    }

    await fs.writeFile(packageJsonPath, fixedCode);

    return { success: true, changed: true, content: fixedCode };
  } catch {
    // Fall back to JSON manipulation for package.json
    return addDependencyJson(packageJsonPath, spec, options);
  }
}

/**
 * Fallback: Add dependency using JSON manipulation (for package.json)
 */
async function addDependencyJson(
  packageJsonPath: string,
  spec: DependencySpec,
  options?: TransformOptions
): Promise<TransformResult> {
  try {
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);

    const targetKey = spec.dev ? "devDependencies" : "dependencies";

    if (!pkg[targetKey]) {
      pkg[targetKey] = {};
    }

    if (pkg[targetKey][spec.name]) {
      return { success: true, changed: false, content };
    }

    pkg[targetKey][spec.name] = spec.version;

    // Sort dependencies alphabetically
    pkg[targetKey] = Object.fromEntries(
      Object.entries(pkg[targetKey]).sort(([a], [b]) => a.localeCompare(b))
    );

    const newContent = JSON.stringify(pkg, null, 2) + "\n";

    // Dry-run mode: return preview without writing
    if (options?.dryRun) {
      return { success: true, changed: true, content, preview: newContent };
    }

    await fs.writeFile(packageJsonPath, newContent);

    return { success: true, changed: true, content: newContent };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to add dependency: ${message}` };
  }
}

// ============================================================================
// Configuration Transformations
// ============================================================================

/**
 * Update a configuration value in a JS/TS config file using AST manipulation.
 *
 * @param filePath - Path to the config file
 * @param spec - Configuration specification
 * @param options - Transform options (including dryRun)
 * @returns TransformResult with success status
 */
export async function updateConfig(
  filePath: string,
  spec: ConfigSpec,
  options?: TransformOptions
): Promise<TransformResult> {
  try {
    if (!(await fileExists(filePath))) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const content = await fs.readFile(filePath, "utf-8");
    const mod = parseModule(content);

    // Navigate to the path and set value
    const pathParts = spec.path.split(".");
    let current = mod.exports.default as Record<string, unknown>;

    if (!current || typeof current !== "object") {
      return { success: false, error: "Cannot find default export object" };
    }

    // Navigate to parent
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (!(part in (current as Record<string, unknown>))) {
        (current as Record<string, unknown>)[part] = {};
      }
      current = (current as Record<string, Record<string, unknown>>)[part];
      if (typeof current !== "object") {
        return { success: false, error: `Path ${pathParts.slice(0, i + 1).join(".")} is not an object` };
      }
    }

    // Set the value
    const lastKey = pathParts[pathParts.length - 1];
    (current as Record<string, unknown>)[lastKey] = spec.value;

    const result = generateCode(mod);
    // Fix double semicolons that magicast sometimes generates
    const fixedCode = result.code.replace(/;;+/g, ";");

    // Dry-run mode: return preview without writing
    if (options?.dryRun) {
      return { success: true, changed: true, content, preview: fixedCode };
    }

    await fs.writeFile(filePath, fixedCode);

    return { success: true, changed: true, content: fixedCode };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to update config: ${message}` };
  }
}

// ============================================================================
// NestJS Module Transformations
// ============================================================================

/**
 * Add a module to NestJS @Module decorator imports array.
 * Uses pattern-based insertion for reliability with decorator syntax.
 *
 * @param filePath - Path to the NestJS module file (e.g., app.module.ts)
 * @param spec - NestJS module specification
 * @param options - Transform options (including dryRun)
 * @returns TransformResult with success status
 */
export async function addNestJsModule(
  filePath: string,
  spec: NestJsModuleSpec,
  options?: TransformOptions
): Promise<TransformResult> {
  try {
    if (!(await fileExists(filePath))) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const content = await fs.readFile(filePath, "utf-8");

    // Find the @Module decorator imports array
    // Pattern: imports: [ ... ]
    const importsArrayPattern = /(imports:\s*\[)([\s\S]*?)(\])/;
    const match = content.match(importsArrayPattern);

    if (!match) {
      return {
        success: false,
        error: `Could not find imports array in @Module decorator in ${filePath}.

Expected pattern:
  @Module({
    imports: [  ← looking for this
      // modules here
    ],
  })

Manual fix:
  Add imports array to @Module decorator:

  @Module({
    imports: [${spec.module}],
  })`,
      };
    }

    const [fullMatch, opening, existingImports, closing] = match;
    const trimmedImports = existingImports.trim();

    // Check if module already exists in imports array (not in the whole file)
    const modulePattern = new RegExp(`\\b${spec.module}\\b`);
    if (modulePattern.test(existingImports)) {
      return { success: true, changed: false, content };
    }

    let newImports: string;
    if (trimmedImports === "") {
      // Empty imports array
      newImports = `${opening}${spec.module}${closing}`;
    } else if (trimmedImports.endsWith(",")) {
      // Already has trailing comma
      newImports = `${opening}${existingImports}${spec.module},\n  ${closing}`;
    } else {
      // No trailing comma, add one
      newImports = `${opening}${existingImports}, ${spec.module}${closing}`;
    }

    const newContent = content.replace(fullMatch, newImports);

    // Dry-run mode: return preview without writing
    if (options?.dryRun) {
      return { success: true, changed: true, content, preview: newContent };
    }

    await fs.writeFile(filePath, newContent);

    return { success: true, changed: true, content: newContent };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to add NestJS module: ${message}` };
  }
}

// ============================================================================
// Provider Wrap Transformations
// ============================================================================

/**
 * Add a provider wrapper to a React providers file.
 * Supports the common patterns used in Next.js App Router.
 *
 * Pattern 1: Array-based providers (app/providers.tsx with compose pattern)
 * Pattern 2: Direct JSX nesting
 *
 * If the file doesn't exist, a default providers.tsx template is created.
 * Templates are loaded from:
 * 1. User custom template (project/.obora/templates/providers.tsx)
 * 2. Built-in template (package templates/providers.tsx)
 *
 * @param filePath - Path to the providers file
 * @param spec - Provider wrap specification
 * @param options - Transform options (including dryRun and projectRoot)
 * @returns TransformResult with success status
 */
export async function addProviderWrap(
  filePath: string,
  spec: ProviderWrapSpec,
  options?: TransformOptions
): Promise<TransformResult> {
  try {
    let content: string;

    // Auto-create providers file if it doesn't exist
    if (!(await fileExists(filePath))) {
      // Load template (user custom or built-in)
      const template = await loadTemplate("providers", {
        projectRoot: options?.projectRoot,
      });

      if (options?.dryRun) {
        consola.info(`[dry-run] Would create ${filePath} with template`);
        // Use template content for dry-run preview
        content = template;
      } else {
        await fs.writeFile(filePath, template);
        consola.success(`Created ${filePath} with template`);
        content = template;
      }
    } else {
      content = await fs.readFile(filePath, "utf-8");
    }

    // Check if provider already exists
    const providerPattern = new RegExp(`<${spec.provider}[\\s>]`);
    if (providerPattern.test(content)) {
      return { success: true, changed: false, content };
    }

    // Format props if provided
    const propsStr = spec.props
      ? " " + Object.entries(spec.props).map(([k, v]) => `${k}={${v}}`).join(" ")
      : "";

    // Try Pattern 1: Find {children} and wrap it
    // This handles: return <Existing>{children}</Existing>
    const childrenPattern = /(\{children\})/;
    if (childrenPattern.test(content)) {
      const newContent = content.replace(
        childrenPattern,
        `<${spec.provider}${propsStr}>{children}</${spec.provider}>`
      );

      // If we made a change (pattern found), verify it's different
      if (newContent !== content) {
        // Dry-run mode: return preview without writing
        if (options?.dryRun) {
          return { success: true, changed: true, content, preview: newContent };
        }

        await fs.writeFile(filePath, newContent);
        return { success: true, changed: true, content: newContent };
      }
    }

    // Pattern not found - provide helpful manual fix guidance
    const propsExample = spec.props
      ? " " + Object.entries(spec.props).map(([k, v]) => `${k}={${v}}`).join(" ")
      : "";

    return {
      success: false,
      error: `Could not find {children} pattern in ${filePath}.

Expected pattern:
  return (
    <>
      {children}  ← looking for this
    </>
  );

Manual fix:
  Wrap {children} with <${spec.provider}${propsExample}>:

  <${spec.provider}${propsExample}>
    {children}
  </${spec.provider}>`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to add provider: ${message}` };
  }
}

// ============================================================================
// Export Transformations
// ============================================================================

/**
 * Add an export statement to a TypeScript/JavaScript file.
 * Supports named exports, default exports, and re-exports.
 *
 * @param filePath - Path to the file to modify
 * @param spec - Export specification
 * @param options - Transform options (including dryRun)
 * @returns TransformResult with success status
 */
export async function addExport(
  filePath: string,
  spec: ExportSpec,
  options?: TransformOptions
): Promise<TransformResult> {
  try {
    if (!(await fileExists(filePath))) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const content = await fs.readFile(filePath, "utf-8");

    // Build export statement
    let exportStatement: string;

    if (spec.from) {
      // Re-export: export { X } from './module' or export * from './module'
      if (spec.exported === "*") {
        exportStatement = `export * from "${spec.from}";`;
      } else if (spec.default) {
        exportStatement = `export { default as ${spec.exported} } from "${spec.from}";`;
      } else {
        exportStatement = `export { ${spec.exported} } from "${spec.from}";`;
      }
    } else {
      // Direct export
      if (spec.default) {
        exportStatement = `export default ${spec.exported};`;
      } else {
        exportStatement = `export { ${spec.exported} };`;
      }
    }

    // Check if export already exists
    const exportPattern = spec.from
      ? new RegExp(`export\\s+.*from\\s+['"]${escapeRegExp(spec.from)}['"]`)
      : new RegExp(`export\\s+.*\\b${escapeRegExp(spec.exported.replace(/[{}]/g, "").trim())}\\b`);

    if (exportPattern.test(content)) {
      return { success: true, changed: false, content };
    }

    // Add export at the end of the file
    const newContent = content.trimEnd() + "\n" + exportStatement + "\n";

    // Dry-run mode: return preview without writing
    if (options?.dryRun) {
      return { success: true, changed: true, content, preview: newContent };
    }

    await fs.writeFile(filePath, newContent);

    return { success: true, changed: true, content: newContent };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to add export: ${message}` };
  }
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ============================================================================
// Layout Component Transformations
// ============================================================================

/**
 * Add a component to a Next.js layout file (layout.tsx).
 * Supports adding components at various positions within the layout.
 *
 * If the file doesn't exist, a default layout.tsx template is created.
 * Templates are loaded from:
 * 1. User custom template (project/.obora/templates/layout.tsx)
 * 2. Built-in template (package templates/layout.tsx)
 *
 * @param filePath - Path to the layout file
 * @param spec - Layout component specification
 * @param options - Transform options (including dryRun and projectRoot)
 * @returns TransformResult with success status
 */
export async function addLayoutComponent(
  filePath: string,
  spec: LayoutComponentSpec,
  options?: TransformOptions
): Promise<TransformResult> {
  try {
    let content: string;

    // Auto-create layout file if it doesn't exist
    if (!(await fileExists(filePath))) {
      // Load template (user custom or built-in)
      const template = await loadTemplate("layout", {
        projectRoot: options?.projectRoot,
      });

      if (options?.dryRun) {
        consola.info(`[dry-run] Would create ${filePath} with template`);
        // Use template content for dry-run preview
        content = template;
      } else {
        await fs.writeFile(filePath, template);
        consola.success(`Created ${filePath} with template`);
        content = template;
      }
    } else {
      content = await fs.readFile(filePath, "utf-8");
    }

    // Check if component already exists
    const componentPattern = new RegExp(`<${spec.component}[\\s/>]`);
    if (componentPattern.test(content)) {
      return { success: true, changed: false, content };
    }

    // Build component JSX
    const propsStr = spec.props
      ? " " + Object.entries(spec.props).map(([k, v]) => `${k}={${v}}`).join(" ")
      : "";
    const selfClosing = spec.selfClosing !== false;
    const componentJsx = selfClosing
      ? `<${spec.component}${propsStr} />`
      : `<${spec.component}${propsStr}></${spec.component}>`;

    let newContent: string;

    switch (spec.position) {
      case "body-start": {
        // Insert after <body...>
        const bodyOpenPattern = /(<body[^>]*>)/;
        const match = content.match(bodyOpenPattern);
        if (!match) {
          return {
            success: false,
            error: `Could not find <body> tag in ${filePath}.

Expected layout structure:
  <html>
    <body>  ← looking for this
      {children}
    </body>
  </html>

Manual fix:
  Add ${componentJsx} after <body>:

  <body>
    ${componentJsx}
    {children}
  </body>`,
          };
        }
        newContent = content.replace(bodyOpenPattern, `$1\n        ${componentJsx}`);
        break;
      }

      case "body-end": {
        // Insert before </body>
        const bodyClosePattern = /(\s*)(<\/body>)/;
        const match = content.match(bodyClosePattern);
        if (!match) {
          return {
            success: false,
            error: `Could not find </body> tag in ${filePath}.

Expected layout structure:
  <html>
    <body>
      {children}
    </body>  ← looking for this
  </html>

Manual fix:
  Add ${componentJsx} before </body>:

  <body>
    {children}
    ${componentJsx}
  </body>`,
          };
        }
        const indent = match[1] || "\n        ";
        newContent = content.replace(bodyClosePattern, `${indent}${componentJsx}$1$2`);
        break;
      }

      case "html-start": {
        // Insert after <html...>
        const htmlOpenPattern = /(<html[^>]*>)/;
        const match = content.match(htmlOpenPattern);
        if (!match) {
          return {
            success: false,
            error: `Could not find <html> tag in ${filePath}.

Expected layout structure:
  <html>  ← looking for this
    <body>
      {children}
    </body>
  </html>

Manual fix:
  Add ${componentJsx} after <html>:

  <html>
    ${componentJsx}
    <body>...`,
          };
        }
        newContent = content.replace(htmlOpenPattern, `$1\n      ${componentJsx}`);
        break;
      }

      case "html-end": {
        // Insert before </html>
        const htmlClosePattern = /(\s*)(<\/html>)/;
        const match = content.match(htmlClosePattern);
        if (!match) {
          return {
            success: false,
            error: `Could not find </html> tag in ${filePath}.

Expected layout structure:
  <html>
    <body>
      {children}
    </body>
  </html>  ← looking for this

Manual fix:
  Add ${componentJsx} before </html>:

    </body>
    ${componentJsx}
  </html>`,
          };
        }
        const indent = match[1] || "\n      ";
        newContent = content.replace(htmlClosePattern, `${indent}${componentJsx}$1$2`);
        break;
      }

      default:
        return { success: false, error: `Unknown position: ${spec.position}` };
    }

    // Dry-run mode: return preview without writing
    if (options?.dryRun) {
      return { success: true, changed: true, content, preview: newContent };
    }

    await fs.writeFile(filePath, newContent);

    return { success: true, changed: true, content: newContent };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to add layout component: ${message}` };
  }
}

// ============================================================================
// JSON Property Transformations
// ============================================================================

/**
 * Update a property in a JSON file (e.g., tsconfig.json, package.json).
 * Supports dot-notation paths and optional merging.
 *
 * @param filePath - Path to the JSON file
 * @param spec - JSON property specification
 * @param options - Transform options (including dryRun)
 * @returns TransformResult with success status
 */
export async function updateJsonProperty(
  filePath: string,
  spec: JsonPropertySpec,
  options?: TransformOptions
): Promise<TransformResult> {
  try {
    if (!(await fileExists(filePath))) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const content = await fs.readFile(filePath, "utf-8");
    const json = JSON.parse(content);

    const pathParts = spec.path.split(".");
    let current = json;

    // Navigate to parent
    for (let i = 0; i < pathParts.length - 1; i++) {
      const part = pathParts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
      if (typeof current !== "object" || current === null) {
        return {
          success: false,
          error: `Path ${pathParts.slice(0, i + 1).join(".")} is not an object`,
        };
      }
    }

    const lastKey = pathParts[pathParts.length - 1];
    const existingValue = current[lastKey];

    // Check if value already matches
    if (JSON.stringify(existingValue) === JSON.stringify(spec.value)) {
      return { success: true, changed: false, content };
    }

    // Set or merge the value
    if (spec.merge && typeof existingValue === "object" && existingValue !== null) {
      if (Array.isArray(existingValue) && Array.isArray(spec.value)) {
        // Merge arrays (deduplicate)
        const merged = [...new Set([...existingValue, ...spec.value])];
        current[lastKey] = merged;
      } else if (!Array.isArray(existingValue) && !Array.isArray(spec.value)) {
        // Merge objects
        current[lastKey] = { ...existingValue, ...(spec.value as object) };
      } else {
        // Type mismatch, replace
        current[lastKey] = spec.value;
      }
    } else {
      current[lastKey] = spec.value;
    }

    // Preserve original indentation if possible
    const indentMatch = content.match(/^(\s+)/m);
    const indent = indentMatch ? indentMatch[1].length : 2;
    const newContent = JSON.stringify(json, null, indent) + "\n";

    // Dry-run mode: return preview without writing
    if (options?.dryRun) {
      return { success: true, changed: true, content, preview: newContent };
    }

    await fs.writeFile(filePath, newContent);

    return { success: true, changed: true, content: newContent };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to update JSON property: ${message}` };
  }
}

// ============================================================================
// Rollback Types
// ============================================================================

export interface FileBackup {
  path: string;
  content: string | null; // null if file didn't exist
}

export interface TransformBatchResult {
  success: boolean;
  results: Array<{ target: string; result: TransformResult }>;
  backups: FileBackup[];
  rolledBack?: boolean;
}

// ============================================================================
// Backup & Rollback Utilities
// ============================================================================

/**
 * Create backups of files before transformation
 */
async function createBackups(
  filePaths: string[]
): Promise<FileBackup[]> {
  const backups: FileBackup[] = [];
  const uniquePaths = [...new Set(filePaths)];

  for (const path of uniquePaths) {
    try {
      if (await fileExists(path)) {
        const content = await fs.readFile(path, "utf-8");
        backups.push({ path, content });
      } else {
        backups.push({ path, content: null });
      }
    } catch {
      // If we can't read the file, mark as non-existent
      backups.push({ path, content: null });
    }
  }

  return backups;
}

/**
 * Restore files from backups
 */
async function restoreFromBackups(backups: FileBackup[]): Promise<void> {
  for (const backup of backups) {
    try {
      if (backup.content === null) {
        // File didn't exist before, delete it if it was created
        if (await fileExists(backup.path)) {
          await fs.unlink(backup.path);
        }
      } else {
        // Restore original content
        await fs.writeFile(backup.path, backup.content);
      }
    } catch (error) {
      consola.warn(`Failed to restore ${backup.path}: ${error}`);
    }
  }
}

// ============================================================================
// High-level Transform API
// ============================================================================

/**
 * Apply multiple transform operations to files.
 * This is the main entry point for preset transformations.
 *
 * @param operations - Array of transform operations
 * @param baseDir - Base directory for relative paths
 * @param options - Transform options (including dryRun)
 * @returns Array of results for each operation
 */
export async function applyTransforms(
  operations: Array<{ target: string; operation: TransformOperation }>,
  baseDir: string,
  options?: TransformOptions
): Promise<Array<{ target: string; result: TransformResult }>> {
  const results: Array<{ target: string; result: TransformResult }> = [];

  for (const { target, operation } of operations) {
    const filePath = target.startsWith("/") ? target : `${baseDir}/${target}`;

    let result: TransformResult;

    switch (operation.type) {
      case "import":
        result = await addImport(filePath, operation.spec as ImportSpec, options);
        break;
      case "export":
        result = await addExport(filePath, operation.spec as ExportSpec, options);
        break;
      case "dependency":
        result = await addDependency(filePath, operation.spec as DependencySpec, options);
        break;
      case "config":
        result = await updateConfig(filePath, operation.spec as ConfigSpec, options);
        break;
      case "nestjs-module":
        result = await addNestJsModule(filePath, operation.spec as NestJsModuleSpec, options);
        break;
      case "provider-wrap":
        result = await addProviderWrap(filePath, operation.spec as ProviderWrapSpec, options);
        break;
      case "json-property":
        result = await updateJsonProperty(filePath, operation.spec as JsonPropertySpec, options);
        break;
      case "layout-component":
        result = await addLayoutComponent(filePath, operation.spec as LayoutComponentSpec, options);
        break;
      default:
        result = { success: false, error: `Unknown operation type: ${operation.type}` };
    }

    // Skip logging in dry-run mode or log with preview indicator
    if (options?.dryRun) {
      if (result.success && result.changed) {
        consola.info(`[dry-run] Would transform ${target}`);
      }
    } else if (result.success && result.changed) {
      consola.success(`Transformed ${target}`);
    } else if (result.success && !result.changed) {
      consola.info(`No changes needed for ${target}`);
    } else {
      consola.warn(`Transform failed for ${target}: ${result.error}`);
    }

    results.push({ target, result });
  }

  return results;
}

/**
 * Apply multiple transform operations with automatic rollback on failure.
 * If any transformation fails, all changes are rolled back to their original state.
 *
 * @param operations - Array of transform operations
 * @param baseDir - Base directory for relative paths
 * @param options - Transform options (including dryRun)
 * @returns TransformBatchResult with success status, results, and rollback info
 */
export async function applyTransformsWithRollback(
  operations: Array<{ target: string; operation: TransformOperation }>,
  baseDir: string,
  options?: TransformOptions
): Promise<TransformBatchResult> {
  // In dry-run mode, just run transforms without rollback logic
  if (options?.dryRun) {
    const results = await applyTransforms(operations, baseDir, options);
    return {
      success: results.every((r) => r.result.success),
      results,
      backups: [],
    };
  }

  // Collect all file paths that will be modified
  const filePaths = operations.map((op) =>
    op.target.startsWith("/") ? op.target : `${baseDir}/${op.target}`
  );

  // Create backups before any modifications
  const backups = await createBackups(filePaths);

  // Apply transforms
  const results = await applyTransforms(operations, baseDir, options);

  // Check if any transform failed
  const hasFailure = results.some((r) => !r.result.success);

  if (hasFailure) {
    // Rollback all changes
    consola.warn("Transform failed, rolling back changes...");
    await restoreFromBackups(backups);
    consola.info("Rollback complete");

    return {
      success: false,
      results,
      backups,
      rolledBack: true,
    };
  }

  return {
    success: true,
    results,
    backups,
    rolledBack: false,
  };
}

// ============================================================================
// Parse Import Statement Helper
// ============================================================================

/**
 * Parse an import statement string into ImportSpec.
 * Useful for converting manifest inject content to transform operations.
 *
 * @param importStatement - Import statement string (e.g., "import { Module } from '@nestjs/common'")
 * @returns ImportSpec or null if parsing fails
 */
export function parseImportStatement(importStatement: string): ImportSpec | null {
  const trimmed = importStatement.trim();

  // Match: import { A, B } from 'module'
  const namedMatch = trimmed.match(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
  if (namedMatch) {
    const named = namedMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
    return { from: namedMatch[2], named };
  }

  // Match: import Default from 'module'
  const defaultMatch = trimmed.match(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
  if (defaultMatch) {
    return { from: defaultMatch[2], default: defaultMatch[1] };
  }

  // Match: import * as NS from 'module'
  const namespaceMatch = trimmed.match(/^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/);
  if (namespaceMatch) {
    return { from: namespaceMatch[2], namespace: namespaceMatch[1] };
  }

  // Match: import Default, { A, B } from 'module'
  const mixedMatch = trimmed.match(/^import\s+(\w+)\s*,\s*\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
  if (mixedMatch) {
    const named = mixedMatch[2].split(",").map((s) => s.trim()).filter(Boolean);
    return { from: mixedMatch[3], default: mixedMatch[1], named };
  }

  return null;
}

/**
 * Check if content looks like an import statement
 */
export function isImportStatement(content: string): boolean {
  return content.trim().startsWith("import ");
}
