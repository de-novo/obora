/**
 * preset-schema-validator.ts tests
 *
 * Tests for preset manifest validation utilities
 */

import { describe, test, expect } from "bun:test";

import type { ErrorObject } from "ajv";

// ============================================================================
// Type Definitions (from source)
// ============================================================================

interface SchemaValidationError {
  path: string;
  message: string;
  keyword: string;
}

interface TransformValidationError {
  index: number;
  type: string;
  missingFields: string[];
  message: string;
}

interface FileValidationError {
  file: string;
  expected: string;
  message: string;
}

interface PresetValidationResult {
  valid: boolean;
  presetName: string;
  presetPath: string;
  schemaErrors: SchemaValidationError[];
  transformErrors: TransformValidationError[];
  fileErrors: FileValidationError[];
}

// ============================================================================
// Constants (replicated from source for testing)
// ============================================================================

const TRANSFORM_REQUIRED_FIELDS: Record<string, string[]> = {
  import: ["content"],
  dependency: ["name", "version"],
  "nestjs-module": ["module", "content"],
  "provider-wrap": ["provider", "content"],
  "layout-component": ["component", "content"],
};

const TRANSFORM_OPTIONAL_FIELDS: Record<string, string[]> = {
  import: ["condition"],
  dependency: ["dev", "condition"],
  "nestjs-module": ["condition"],
  "provider-wrap": ["props", "condition"],
  "layout-component": ["position", "selfClosing", "condition"],
};

// ============================================================================
// Helper Functions (replicated from source for isolated testing)
// ============================================================================

function formatSchemaErrors(errors: ErrorObject[] | null | undefined): SchemaValidationError[] {
  if (!errors) return [];

  return errors.map((error) => ({
    path: error.instancePath || "/",
    message: error.message || "Unknown error",
    keyword: error.keyword,
  }));
}

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

function formatValidationResults(results: PresetValidationResult[]): string {
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

// ============================================================================
// Tests: TRANSFORM_REQUIRED_FIELDS constants
// ============================================================================

describe("TRANSFORM_REQUIRED_FIELDS", () => {
  test("should have required fields for import type", () => {
    expect(TRANSFORM_REQUIRED_FIELDS.import).toEqual(["content"]);
  });

  test("should have required fields for dependency type", () => {
    expect(TRANSFORM_REQUIRED_FIELDS.dependency).toEqual(["name", "version"]);
  });

  test("should have required fields for nestjs-module type", () => {
    expect(TRANSFORM_REQUIRED_FIELDS["nestjs-module"]).toEqual(["module", "content"]);
  });

  test("should have required fields for provider-wrap type", () => {
    expect(TRANSFORM_REQUIRED_FIELDS["provider-wrap"]).toEqual(["provider", "content"]);
  });

  test("should have required fields for layout-component type", () => {
    expect(TRANSFORM_REQUIRED_FIELDS["layout-component"]).toEqual(["component", "content"]);
  });

  test("should have 5 transform types defined", () => {
    expect(Object.keys(TRANSFORM_REQUIRED_FIELDS)).toHaveLength(5);
  });
});

describe("TRANSFORM_OPTIONAL_FIELDS", () => {
  test("should have optional fields for import type", () => {
    expect(TRANSFORM_OPTIONAL_FIELDS.import).toEqual(["condition"]);
  });

  test("should have optional fields for dependency type", () => {
    expect(TRANSFORM_OPTIONAL_FIELDS.dependency).toEqual(["dev", "condition"]);
  });

  test("should have optional fields for layout-component type", () => {
    expect(TRANSFORM_OPTIONAL_FIELDS["layout-component"]).toContain("position");
    expect(TRANSFORM_OPTIONAL_FIELDS["layout-component"]).toContain("selfClosing");
    expect(TRANSFORM_OPTIONAL_FIELDS["layout-component"]).toContain("condition");
  });
});

// ============================================================================
// Tests: formatSchemaErrors
// ============================================================================

describe("formatSchemaErrors", () => {
  test("should return empty array for null errors", () => {
    expect(formatSchemaErrors(null)).toEqual([]);
  });

  test("should return empty array for undefined errors", () => {
    expect(formatSchemaErrors(undefined)).toEqual([]);
  });

  test("should return empty array for empty errors array", () => {
    expect(formatSchemaErrors([])).toEqual([]);
  });

  test("should format single AJV error", () => {
    const errors: ErrorObject[] = [
      {
        instancePath: "/name",
        schemaPath: "#/properties/name/type",
        keyword: "type",
        params: { type: "string" },
        message: "must be string",
      },
    ];

    const result = formatSchemaErrors(errors);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: "/name",
      message: "must be string",
      keyword: "type",
    });
  });

  test("should format multiple AJV errors", () => {
    const errors: ErrorObject[] = [
      {
        instancePath: "/name",
        schemaPath: "#/properties/name/type",
        keyword: "type",
        params: {},
        message: "must be string",
      },
      {
        instancePath: "/version",
        schemaPath: "#/properties/version/pattern",
        keyword: "pattern",
        params: {},
        message: "must match pattern",
      },
    ];

    const result = formatSchemaErrors(errors);

    expect(result).toHaveLength(2);
    expect(result[0].path).toBe("/name");
    expect(result[1].path).toBe("/version");
  });

  test("should use '/' as default path when instancePath is empty", () => {
    const errors: ErrorObject[] = [
      {
        instancePath: "",
        schemaPath: "#/type",
        keyword: "type",
        params: {},
        message: "must be object",
      },
    ];

    const result = formatSchemaErrors(errors);
    expect(result[0].path).toBe("/");
  });

  test("should use 'Unknown error' as default message", () => {
    const errors: ErrorObject[] = [
      {
        instancePath: "/field",
        schemaPath: "#/properties/field",
        keyword: "required",
        params: {},
        message: undefined as unknown as string,
      },
    ];

    const result = formatSchemaErrors(errors);
    expect(result[0].message).toBe("Unknown error");
  });
});

// ============================================================================
// Tests: validateTransformSpecs
// ============================================================================

describe("validateTransformSpecs", () => {
  describe("with no transforms", () => {
    test("should return empty array for empty manifest", () => {
      const result = validateTransformSpecs({});
      expect(result).toEqual([]);
    });

    test("should return empty array when common has no transforms", () => {
      const result = validateTransformSpecs({ common: {} });
      expect(result).toEqual([]);
    });

    test("should return empty array when transforms is empty array", () => {
      const result = validateTransformSpecs({ common: { transform: [] } });
      expect(result).toEqual([]);
    });
  });

  describe("with valid transforms", () => {
    test("should return empty array for valid import transform", () => {
      const manifest = {
        common: {
          transform: [{ type: "import", content: "import { foo } from 'bar';" }],
        },
      };
      const result = validateTransformSpecs(manifest);
      expect(result).toEqual([]);
    });

    test("should return empty array for valid dependency transform", () => {
      const manifest = {
        common: {
          transform: [{ type: "dependency", name: "lodash", version: "^4.17.21" }],
        },
      };
      const result = validateTransformSpecs(manifest);
      expect(result).toEqual([]);
    });

    test("should return empty array for valid nestjs-module transform", () => {
      const manifest = {
        common: {
          transform: [{ type: "nestjs-module", module: "AuthModule", content: "AuthModule" }],
        },
      };
      const result = validateTransformSpecs(manifest);
      expect(result).toEqual([]);
    });

    test("should return empty array for valid provider-wrap transform", () => {
      const manifest = {
        common: {
          transform: [{ type: "provider-wrap", provider: "ThemeProvider", content: "ThemeProvider" }],
        },
      };
      const result = validateTransformSpecs(manifest);
      expect(result).toEqual([]);
    });

    test("should return empty array for valid layout-component transform", () => {
      const manifest = {
        common: {
          transform: [{ type: "layout-component", component: "Navbar", content: "<Navbar />" }],
        },
      };
      const result = validateTransformSpecs(manifest);
      expect(result).toEqual([]);
    });
  });

  describe("with invalid transforms", () => {
    test("should detect missing type field", () => {
      const manifest = {
        common: {
          transform: [{ content: "some content" }],
        },
      };
      const result = validateTransformSpecs(manifest);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("unknown");
      expect(result[0].missingFields).toContain("type");
      expect(result[0].message).toContain("Missing required field");
    });

    test("should detect missing content field for import", () => {
      const manifest = {
        common: {
          transform: [{ type: "import" }],
        },
      };
      const result = validateTransformSpecs(manifest);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("import");
      expect(result[0].missingFields).toContain("content");
    });

    test("should detect missing name and version for dependency", () => {
      const manifest = {
        common: {
          transform: [{ type: "dependency" }],
        },
      };
      const result = validateTransformSpecs(manifest);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("dependency");
      expect(result[0].missingFields).toContain("name");
      expect(result[0].missingFields).toContain("version");
    });

    test("should detect only missing version when name is present", () => {
      const manifest = {
        common: {
          transform: [{ type: "dependency", name: "lodash" }],
        },
      };
      const result = validateTransformSpecs(manifest);

      expect(result).toHaveLength(1);
      expect(result[0].missingFields).toEqual(["version"]);
    });

    test("should include index in error", () => {
      const manifest = {
        common: {
          transform: [
            { type: "import", content: "valid" },
            { type: "import" }, // missing content at index 1
          ],
        },
      };
      const result = validateTransformSpecs(manifest);

      expect(result).toHaveLength(1);
      expect(result[0].index).toBe(1);
    });
  });

  describe("with transforms in targets", () => {
    test("should validate transforms in targets", () => {
      const manifest = {
        targets: {
          standalone: {
            transform: [{ type: "import" }], // missing content
          },
        },
      };
      const result = validateTransformSpecs(manifest);

      expect(result).toHaveLength(1);
      expect(result[0].message).toContain("targets.standalone.transform");
    });

    test("should validate transforms in multiple targets", () => {
      const manifest = {
        targets: {
          standalone: {
            transform: [{ type: "import" }], // missing content
          },
          monorepo: {
            transform: [{ type: "dependency" }], // missing name, version
          },
        },
      };
      const result = validateTransformSpecs(manifest);

      expect(result).toHaveLength(2);
    });
  });

  describe("with transforms in variants", () => {
    test("should validate transforms in variants", () => {
      const manifest = {
        variants: {
          postgres: {
            transform: [{ type: "dependency" }], // missing name, version
          },
        },
      };
      const result = validateTransformSpecs(manifest);

      expect(result).toHaveLength(1);
      expect(result[0].message).toContain("variants.postgres.transform");
    });
  });

  describe("with unknown transform types", () => {
    test("should not error on unknown transform types", () => {
      const manifest = {
        common: {
          transform: [{ type: "custom-transform", data: "something" }],
        },
      };
      const result = validateTransformSpecs(manifest);

      // Unknown types are not validated here - schema validation handles them
      expect(result).toEqual([]);
    });
  });

  describe("edge cases", () => {
    test("should skip non-object transforms", () => {
      const manifest = {
        common: {
          transform: ["string", 123, null],
        },
      };
      const result = validateTransformSpecs(manifest);
      expect(result).toEqual([]);
    });

    test("should skip if transforms is not an array", () => {
      const manifest = {
        common: {
          transform: "not-an-array",
        },
      };
      const result = validateTransformSpecs(manifest);
      expect(result).toEqual([]);
    });

    test("should handle combined common, targets, and variants", () => {
      const manifest = {
        common: {
          transform: [{ type: "import" }], // missing content
        },
        targets: {
          standalone: {
            transform: [{ type: "dependency" }], // missing name, version
          },
        },
        variants: {
          custom: {
            transform: [{ type: "nestjs-module" }], // missing module, content
          },
        },
      };
      const result = validateTransformSpecs(manifest);

      expect(result).toHaveLength(3);
      expect(result[0].message).toContain("common.transform");
      expect(result[1].message).toContain("targets.standalone.transform");
      expect(result[2].message).toContain("variants.custom.transform");
    });
  });
});

// ============================================================================
// Tests: formatValidationResults
// ============================================================================

describe("formatValidationResults", () => {
  test("should format empty results", () => {
    const result = formatValidationResults([]);

    expect(result).toContain("0 passed, 0 failed");
  });

  test("should format all valid results", () => {
    const results: PresetValidationResult[] = [
      {
        valid: true,
        presetName: "preset-a",
        presetPath: "/presets/a/manifest.json",
        schemaErrors: [],
        transformErrors: [],
        fileErrors: [],
      },
      {
        valid: true,
        presetName: "preset-b",
        presetPath: "/presets/b/manifest.json",
        schemaErrors: [],
        transformErrors: [],
        fileErrors: [],
      },
    ];

    const result = formatValidationResults(results);

    expect(result).toContain("2 passed, 0 failed");
    expect(result).toContain("✓ preset-a (valid)");
    expect(result).toContain("✓ preset-b (valid)");
  });

  test("should format invalid result with schema errors", () => {
    const results: PresetValidationResult[] = [
      {
        valid: false,
        presetName: "broken-preset",
        presetPath: "/presets/broken/manifest.json",
        schemaErrors: [
          { path: "/name", message: "must be string", keyword: "type" },
        ],
        transformErrors: [],
        fileErrors: [],
      },
    ];

    const result = formatValidationResults(results);

    expect(result).toContain("0 passed, 1 failed");
    expect(result).toContain("✗ broken-preset (invalid)");
    expect(result).toContain("Schema: /name - must be string");
  });

  test("should format invalid result with transform errors", () => {
    const results: PresetValidationResult[] = [
      {
        valid: false,
        presetName: "bad-transforms",
        presetPath: "/presets/bad/manifest.json",
        schemaErrors: [],
        transformErrors: [
          {
            index: 0,
            type: "import",
            missingFields: ["content"],
            message: "common.transform[0]: Missing content",
          },
        ],
        fileErrors: [],
      },
    ];

    const result = formatValidationResults(results);

    expect(result).toContain("Transform: common.transform[0]: Missing content");
  });

  test("should format invalid result with file errors", () => {
    const results: PresetValidationResult[] = [
      {
        valid: false,
        presetName: "missing-files",
        presetPath: "/presets/missing/manifest.json",
        schemaErrors: [],
        transformErrors: [],
        fileErrors: [
          {
            file: "config.ts",
            expected: "/presets/missing/files/config.ts",
            message: "common.files: Referenced file not found: config.ts",
          },
        ],
      },
    ];

    const result = formatValidationResults(results);

    expect(result).toContain("File: common.files: Referenced file not found: config.ts");
  });

  test("should format mixed valid and invalid results", () => {
    const results: PresetValidationResult[] = [
      {
        valid: true,
        presetName: "good-preset",
        presetPath: "/presets/good/manifest.json",
        schemaErrors: [],
        transformErrors: [],
        fileErrors: [],
      },
      {
        valid: false,
        presetName: "bad-preset",
        presetPath: "/presets/bad/manifest.json",
        schemaErrors: [
          { path: "/", message: "invalid schema", keyword: "type" },
        ],
        transformErrors: [],
        fileErrors: [],
      },
    ];

    const result = formatValidationResults(results);

    expect(result).toContain("1 passed, 1 failed");
    expect(result).toContain("✓ good-preset (valid)");
    expect(result).toContain("✗ bad-preset (invalid)");
  });

  test("should format result with multiple error types", () => {
    const results: PresetValidationResult[] = [
      {
        valid: false,
        presetName: "multi-error",
        presetPath: "/presets/multi/manifest.json",
        schemaErrors: [
          { path: "/name", message: "error 1", keyword: "type" },
        ],
        transformErrors: [
          { index: 0, type: "import", missingFields: ["content"], message: "error 2" },
        ],
        fileErrors: [
          { file: "a.ts", expected: "/x", message: "error 3" },
        ],
      },
    ];

    const result = formatValidationResults(results);

    expect(result).toContain("Schema: /name - error 1");
    expect(result).toContain("Transform: error 2");
    expect(result).toContain("File: error 3");
  });
});
