/**
 * @obora/preset-engine - Transform Validator
 *
 * Validates transform configurations in preset manifests
 */

import type {
  TransformConfig,
  TransformType,
  ImportTransformConfig,
  ExportTransformConfig,
  DependencyTransformConfig,
  NestJsModuleTransformConfig,
  ProviderWrapTransformConfig,
  JsonPropertyTransformConfig,
} from "./types.js";

export interface TransformValidationError {
  index: number;
  field: string;
  message: string;
}

export interface TransformValidationResult {
  valid: boolean;
  errors: TransformValidationError[];
}

const VALID_TRANSFORM_TYPES: TransformType[] = [
  "import",
  "export",
  "dependency",
  "nestjs-module",
  "provider-wrap",
  "json-property",
];

function isValidTransformType(type: unknown): type is TransformType {
  return typeof type === "string" && VALID_TRANSFORM_TYPES.includes(type as TransformType);
}

function validateImportTransform(
  config: unknown,
  index: number
): TransformValidationError[] {
  const errors: TransformValidationError[] = [];
  const c = config as ImportTransformConfig;

  if (!c.from || typeof c.from !== "string") {
    errors.push({
      index,
      field: "from",
      message: "import transform requires 'from' field",
    });
  }

  if (c.named !== undefined && !Array.isArray(c.named)) {
    errors.push({
      index,
      field: "named",
      message: "'named' must be an array of strings",
    });
  }

  if (c.default !== undefined && typeof c.default !== "string") {
    errors.push({
      index,
      field: "default",
      message: "'default' must be a string",
    });
  }

  return errors;
}

function validateExportTransform(
  config: unknown,
  index: number
): TransformValidationError[] {
  const errors: TransformValidationError[] = [];
  const c = config as ExportTransformConfig;

  if (!c.exported || typeof c.exported !== "string") {
    errors.push({
      index,
      field: "exported",
      message: "export transform requires 'exported' field",
    });
  }

  if (c.from !== undefined && typeof c.from !== "string") {
    errors.push({
      index,
      field: "from",
      message: "'from' must be a string",
    });
  }

  if (c.default !== undefined && typeof c.default !== "boolean") {
    errors.push({
      index,
      field: "default",
      message: "'default' must be a boolean",
    });
  }

  return errors;
}

function validateDependencyTransform(
  config: unknown,
  index: number
): TransformValidationError[] {
  const errors: TransformValidationError[] = [];
  const c = config as DependencyTransformConfig;

  if (!c.name || typeof c.name !== "string") {
    errors.push({
      index,
      field: "name",
      message: "dependency transform requires 'name' field",
    });
  }

  if (!c.version || typeof c.version !== "string") {
    errors.push({
      index,
      field: "version",
      message: "dependency transform requires 'version' field",
    });
  }

  if (c.dev !== undefined && typeof c.dev !== "boolean") {
    errors.push({
      index,
      field: "dev",
      message: "'dev' must be a boolean",
    });
  }

  return errors;
}

function validateNestJsModuleTransform(
  config: unknown,
  index: number
): TransformValidationError[] {
  const errors: TransformValidationError[] = [];
  const c = config as NestJsModuleTransformConfig;

  if (!c.module || typeof c.module !== "string") {
    errors.push({
      index,
      field: "module",
      message: "nestjs-module transform requires 'module' field",
    });
  }

  return errors;
}

function validateProviderWrapTransform(
  config: unknown,
  index: number
): TransformValidationError[] {
  const errors: TransformValidationError[] = [];
  const c = config as ProviderWrapTransformConfig;

  if (!c.provider || typeof c.provider !== "string") {
    errors.push({
      index,
      field: "provider",
      message: "provider-wrap transform requires 'provider' field",
    });
  }

  if (c.props !== undefined && (typeof c.props !== "object" || c.props === null)) {
    errors.push({
      index,
      field: "props",
      message: "'props' must be an object",
    });
  }

  return errors;
}

function validateJsonPropertyTransform(
  config: unknown,
  index: number
): TransformValidationError[] {
  const errors: TransformValidationError[] = [];
  const c = config as JsonPropertyTransformConfig;

  if (!c.path || typeof c.path !== "string") {
    errors.push({
      index,
      field: "path",
      message: "json-property transform requires 'path' field",
    });
  }

  if (c.value === undefined) {
    errors.push({
      index,
      field: "value",
      message: "json-property transform requires 'value' field",
    });
  }

  if (c.merge !== undefined && typeof c.merge !== "boolean") {
    errors.push({
      index,
      field: "merge",
      message: "'merge' must be a boolean",
    });
  }

  return errors;
}

/**
 * Validate a single transform configuration
 */
export function validateSingleTransform(
  config: unknown,
  index: number
): TransformValidationError[] {
  const errors: TransformValidationError[] = [];

  if (typeof config !== "object" || config === null) {
    errors.push({
      index,
      field: "",
      message: "transform must be an object",
    });
    return errors;
  }

  const c = config as Record<string, unknown>;

  // Validate required base fields
  if (!c.type) {
    errors.push({
      index,
      field: "type",
      message: "transform requires 'type' field",
    });
    return errors;
  }

  if (!isValidTransformType(c.type)) {
    errors.push({
      index,
      field: "type",
      message: `invalid transform type: ${c.type}. Valid types: ${VALID_TRANSFORM_TYPES.join(", ")}`,
    });
    return errors;
  }

  if (!c.target || typeof c.target !== "string") {
    errors.push({
      index,
      field: "target",
      message: "transform requires 'target' field (file path)",
    });
  }

  // Type-specific validation
  switch (c.type) {
    case "import":
      errors.push(...validateImportTransform(config, index));
      break;
    case "export":
      errors.push(...validateExportTransform(config, index));
      break;
    case "dependency":
      errors.push(...validateDependencyTransform(config, index));
      break;
    case "nestjs-module":
      errors.push(...validateNestJsModuleTransform(config, index));
      break;
    case "provider-wrap":
      errors.push(...validateProviderWrapTransform(config, index));
      break;
    case "json-property":
      errors.push(...validateJsonPropertyTransform(config, index));
      break;
  }

  return errors;
}

/**
 * Validate an array of transform configurations
 */
export function validateTransformConfigs(
  transforms: unknown
): TransformValidationResult {
  if (!transforms) {
    return { valid: true, errors: [] };
  }

  if (!Array.isArray(transforms)) {
    return {
      valid: false,
      errors: [{
        index: -1,
        field: "transform",
        message: "'transform' must be an array",
      }],
    };
  }

  const errors: TransformValidationError[] = [];

  for (let i = 0; i < transforms.length; i++) {
    errors.push(...validateSingleTransform(transforms[i], i));
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format validation errors for display
 */
export function formatTransformErrors(errors: TransformValidationError[]): string {
  return errors
    .map((err) => {
      const location = err.index >= 0 ? `[${err.index}]` : "";
      const field = err.field ? `.${err.field}` : "";
      return `  transform${location}${field}: ${err.message}`;
    })
    .join("\n");
}

/**
 * Type guard to check if a value is a valid TransformConfig array
 */
export function isValidTransformConfigArray(
  transforms: unknown
): transforms is TransformConfig[] {
  const result = validateTransformConfigs(transforms);
  return result.valid;
}
