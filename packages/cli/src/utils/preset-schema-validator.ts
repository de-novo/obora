/**
 * Preset Schema Validator
 *
 * JSON Schema-based validation for preset manifests
 */

import Ajv, { type ErrorObject } from "ajv";
import addFormats from "ajv-formats";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Types for validation results
export interface SchemaValidationError {
  path: string;
  message: string;
  keyword: string;
}

export interface TransformValidationError {
  index: number;
  type: string;
  missingFields: string[];
  message: string;
}

export interface FileValidationError {
  file: string;
  expected: string;
  message: string;
}

export interface PresetValidationResult {
  valid: boolean;
  presetName: string;
  presetPath: string;
  schemaErrors: SchemaValidationError[];
  transformErrors: TransformValidationError[];
  fileErrors: FileValidationError[];
}

// Transform type to required fields mapping
const TRANSFORM_REQUIRED_FIELDS: Record<string, string[]> = {
  import: ["content"],
  dependency: ["name", "version"],
  "nestjs-module": ["module", "content"],
  "provider-wrap": ["provider", "content"],
  "layout-component": ["component", "content"],
};

// Optional fields per transform type
const TRANSFORM_OPTIONAL_FIELDS: Record<string, string[]> = {
  import: ["condition"],
  dependency: ["dev", "condition"],
  "nestjs-module": ["condition"],
  "provider-wrap": ["props", "condition"],
  "layout-component": ["position", "selfClosing", "condition"],
};

/**
 * Load the JSON Schema from the presets directory
 */
function loadPresetSchema(presetsDir: string): object | null {
  const schemaPath = join(presetsDir, "preset.schema.json");
  if (!existsSync(schemaPath)) {
    // Try relative path from cli package
    const altPath = join(__dirname, "../../../../presets/preset.schema.json");
    if (existsSync(altPath)) {
      return JSON.parse(readFileSync(altPath, "utf-8"));
    }
    return null;
  }
  return JSON.parse(readFileSync(schemaPath, "utf-8"));
}

/**
 * Create AJV validator instance with the preset schema
 */
function createValidator(schema: object): Ajv {
  const ajv = new Ajv({
    allErrors: true,
    verbose: true,
    strict: false,
  });
  addFormats(ajv);
  ajv.addSchema(schema, "preset");
  return ajv;
}

/**
 * Convert AJV errors to our schema validation errors
 */
function formatSchemaErrors(errors: ErrorObject[] | null | undefined): SchemaValidationError[] {
  if (!errors) return [];

  return errors.map((error) => ({
    path: error.instancePath || "/",
    message: error.message || "Unknown error",
    keyword: error.keyword,
  }));
}

/**
 * Validate transforms have required fields based on their type
 */
function validateTransformSpecs(manifest: Record<string, unknown>): TransformValidationError[] {
  const errors: TransformValidationError[] = [];

  const validateTransformArray = (transforms: unknown[], source: string) => {
    if (!Array.isArray(transforms)) return;

    transforms.forEach((transform, index) => {
      if (typeof transform !== "object" || transform === null) return;

      const t = transform as Record<string, unknown>;
      const type = t.type as string;

      if (!type) {
        errors.push({
          index,
          type: "unknown",
          missingFields: ["type"],
          message: `${source}[${index}]: Missing required field "type"`,
        });
        return;
      }

      const requiredFields = TRANSFORM_REQUIRED_FIELDS[type];
      if (!requiredFields) {
        // Unknown transform type - schema validation will catch this
        return;
      }

      const missingFields = requiredFields.filter((field) => !(field in t));
      if (missingFields.length > 0) {
        errors.push({
          index,
          type,
          missingFields,
          message: `${source}[${index}] (type: ${type}): Missing required fields: ${missingFields.join(", ")}`,
        });
      }
    });
  };

  // Check common transforms
  const common = manifest.common as Record<string, unknown> | undefined;
  if (common?.transform) {
    validateTransformArray(common.transform as unknown[], "common.transform");
  }

  // Check targets transforms
  const targets = manifest.targets as Record<string, Record<string, unknown>> | undefined;
  if (targets) {
    for (const [targetName, targetConfig] of Object.entries(targets)) {
      if (targetConfig?.transform) {
        validateTransformArray(
          targetConfig.transform as unknown[],
          `targets.${targetName}.transform`
        );
      }
    }
  }

  // Check variants transforms
  const variants = manifest.variants as Record<string, Record<string, unknown>> | undefined;
  if (variants) {
    for (const [variantName, variantConfig] of Object.entries(variants)) {
      if (variantConfig?.transform) {
        validateTransformArray(
          variantConfig.transform as unknown[],
          `variants.${variantName}.transform`
        );
      }
    }
  }

  return errors;
}

/**
 * Validate that referenced files exist in the preset directory
 */
function validateFileReferences(
  manifest: Record<string, unknown>,
  presetDir: string
): FileValidationError[] {
  const errors: FileValidationError[] = [];

  const validateFiles = (files: unknown, source: string) => {
    if (!Array.isArray(files)) return;

    for (const file of files) {
      if (typeof file !== "string") continue;

      // Files are template files in the preset's files directory
      const filePath = join(presetDir, "files", file);
      if (!existsSync(filePath)) {
        errors.push({
          file,
          expected: filePath,
          message: `${source}: Referenced file not found: ${file}`,
        });
      }
    }
  };

  // Check common files
  const common = manifest.common as Record<string, unknown> | undefined;
  if (common?.files) {
    validateFiles(common.files, "common.files");
  }

  // Check targets files
  const targets = manifest.targets as Record<string, Record<string, unknown>> | undefined;
  if (targets) {
    for (const [targetName, targetConfig] of Object.entries(targets)) {
      if (targetConfig?.files) {
        validateFiles(targetConfig.files, `targets.${targetName}.files`);
      }
    }
  }

  // Check variants files
  const variants = manifest.variants as Record<string, Record<string, unknown>> | undefined;
  if (variants) {
    for (const [variantName, variantConfig] of Object.entries(variants)) {
      if (variantConfig?.files) {
        validateFiles(variantConfig.files, `variants.${variantName}.files`);
      }
    }
  }

  return errors;
}

/**
 * Validate a single preset manifest
 */
export function validatePresetManifest(
  manifestPath: string,
  presetsDir: string,
  options: {
    checkFiles?: boolean;
    checkTransforms?: boolean;
  } = {}
): PresetValidationResult {
  const { checkFiles = true, checkTransforms = true } = options;

  const presetDir = dirname(manifestPath);
  const presetName = manifestPath.split("/").slice(-2, -1)[0] || "unknown";

  const result: PresetValidationResult = {
    valid: true,
    presetName,
    presetPath: manifestPath,
    schemaErrors: [],
    transformErrors: [],
    fileErrors: [],
  };

  // Read manifest
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch (error) {
    result.valid = false;
    result.schemaErrors.push({
      path: "/",
      message: `Failed to parse manifest: ${(error as Error).message}`,
      keyword: "parse",
    });
    return result;
  }

  // Load and validate against JSON Schema
  const schema = loadPresetSchema(presetsDir);
  if (schema) {
    const ajv = createValidator(schema);
    const validate = ajv.getSchema("preset");
    if (validate) {
      const valid = validate(manifest);
      if (!valid) {
        result.schemaErrors = formatSchemaErrors(validate.errors);
        result.valid = false;
      }
    }
  }

  // Validate transform specs
  if (checkTransforms) {
    result.transformErrors = validateTransformSpecs(manifest);
    if (result.transformErrors.length > 0) {
      result.valid = false;
    }
  }

  // Validate file references
  if (checkFiles) {
    result.fileErrors = validateFileReferences(manifest, presetDir);
    if (result.fileErrors.length > 0) {
      result.valid = false;
    }
  }

  return result;
}

/**
 * Validate all presets in a directory
 */
export function validateAllPresets(
  presetsDir: string,
  options: {
    checkFiles?: boolean;
    checkTransforms?: boolean;
  } = {}
): PresetValidationResult[] {
  const results: PresetValidationResult[] = [];

  // Scan presets directory structure: category/preset/manifest.json
  const categories = existsSync(presetsDir)
    ? readdirSync(presetsDir).filter((name) => {
        const path = join(presetsDir, name);
        return statSync(path).isDirectory() && !name.startsWith(".");
      })
    : [];

  for (const category of categories) {
    const categoryPath = join(presetsDir, category);

    // Skip non-directories and special files
    if (category === "preset.schema.json") continue;

    const presets = existsSync(categoryPath)
      ? readdirSync(categoryPath).filter((name) => {
          const path = join(categoryPath, name);
          return statSync(path).isDirectory();
        })
      : [];

    for (const preset of presets) {
      const manifestPath = join(categoryPath, preset, "manifest.json");
      if (existsSync(manifestPath)) {
        results.push(validatePresetManifest(manifestPath, presetsDir, options));
      }
    }
  }

  return results;
}

// Import fs functions needed
import { readdirSync, statSync } from "node:fs";

/**
 * Format validation results for display
 */
export function formatValidationResults(results: PresetValidationResult[]): string {
  const lines: string[] = [];

  const validCount = results.filter((r) => r.valid).length;
  const invalidCount = results.length - validCount;

  lines.push(`\nPreset Validation Results: ${validCount} passed, ${invalidCount} failed\n`);

  for (const result of results) {
    const icon = result.valid ? "✓" : "✗";
    const status = result.valid ? "valid" : "invalid";
    lines.push(`${icon} ${result.presetName} (${status})`);

    if (!result.valid) {
      // Schema errors
      for (const error of result.schemaErrors) {
        lines.push(`    Schema: ${error.path} - ${error.message}`);
      }

      // Transform errors
      for (const error of result.transformErrors) {
        lines.push(`    Transform: ${error.message}`);
      }

      // File errors
      for (const error of result.fileErrors) {
        lines.push(`    File: ${error.message}`);
      }
    }
  }

  return lines.join("\n");
}
