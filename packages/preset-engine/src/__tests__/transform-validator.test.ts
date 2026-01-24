import { describe, it, expect } from "vitest";
import {
  validateTransformConfigs,
  validateSingleTransform,
  formatTransformErrors,
  isValidTransformConfigArray,
} from "../transform-validator";

describe("transform-validator", () => {
  describe("validateTransformConfigs", () => {
    it("should return valid for empty/undefined transforms", () => {
      expect(validateTransformConfigs(undefined).valid).toBe(true);
      expect(validateTransformConfigs(null).valid).toBe(true);
    });

    it("should return error if transforms is not an array", () => {
      const result = validateTransformConfigs({ type: "import" });
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toBe("'transform' must be an array");
    });

    it("should return valid for empty array", () => {
      const result = validateTransformConfigs([]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate valid import transform", () => {
      const result = validateTransformConfigs([
        {
          type: "import",
          target: "src/index.ts",
          from: "@nestjs/common",
          named: ["Module", "Injectable"],
        },
      ]);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate valid export transform", () => {
      const result = validateTransformConfigs([
        {
          type: "export",
          target: "src/index.ts",
          exported: "UserService",
        },
      ]);
      expect(result.valid).toBe(true);
    });

    it("should validate valid dependency transform", () => {
      const result = validateTransformConfigs([
        {
          type: "dependency",
          target: "package.json",
          name: "@nestjs/core",
          version: "^10.0.0",
          dev: false,
        },
      ]);
      expect(result.valid).toBe(true);
    });

    it("should validate valid nestjs-module transform", () => {
      const result = validateTransformConfigs([
        {
          type: "nestjs-module",
          target: "src/app.module.ts",
          module: "PrismaModule",
        },
      ]);
      expect(result.valid).toBe(true);
    });

    it("should validate valid provider-wrap transform", () => {
      const result = validateTransformConfigs([
        {
          type: "provider-wrap",
          target: "src/app/layout.tsx",
          provider: "ThemeProvider",
          props: { theme: '"dark"' },
        },
      ]);
      expect(result.valid).toBe(true);
    });

    it("should validate valid json-property transform", () => {
      const result = validateTransformConfigs([
        {
          type: "json-property",
          target: "tsconfig.json",
          path: "compilerOptions.strict",
          value: true,
        },
      ]);
      expect(result.valid).toBe(true);
    });

    it("should return error for missing type field", () => {
      const result = validateTransformConfigs([
        { target: "src/index.ts", from: "@nestjs/common" },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors[0].field).toBe("type");
    });

    it("should return error for invalid type", () => {
      const result = validateTransformConfigs([
        { type: "invalid-type", target: "src/index.ts" },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain("invalid transform type");
    });

    it("should return error for missing target field", () => {
      const result = validateTransformConfigs([
        { type: "import", from: "@nestjs/common" },
      ]);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.field === "target")).toBe(true);
    });
  });

  describe("validateSingleTransform - import", () => {
    it("should require from field", () => {
      const errors = validateSingleTransform(
        { type: "import", target: "src/index.ts" },
        0
      );
      expect(errors.some((e) => e.field === "from")).toBe(true);
    });

    it("should validate named as array", () => {
      const errors = validateSingleTransform(
        { type: "import", target: "src/index.ts", from: "lodash", named: "debounce" },
        0
      );
      expect(errors.some((e) => e.field === "named")).toBe(true);
    });
  });

  describe("validateSingleTransform - export", () => {
    it("should require exported field", () => {
      const errors = validateSingleTransform(
        { type: "export", target: "src/index.ts" },
        0
      );
      expect(errors.some((e) => e.field === "exported")).toBe(true);
    });

    it("should validate default as boolean", () => {
      const errors = validateSingleTransform(
        { type: "export", target: "src/index.ts", exported: "foo", default: "true" },
        0
      );
      expect(errors.some((e) => e.field === "default")).toBe(true);
    });
  });

  describe("validateSingleTransform - dependency", () => {
    it("should require name and version fields", () => {
      const errors = validateSingleTransform(
        { type: "dependency", target: "package.json" },
        0
      );
      expect(errors.some((e) => e.field === "name")).toBe(true);
      expect(errors.some((e) => e.field === "version")).toBe(true);
    });
  });

  describe("validateSingleTransform - nestjs-module", () => {
    it("should require module field", () => {
      const errors = validateSingleTransform(
        { type: "nestjs-module", target: "src/app.module.ts" },
        0
      );
      expect(errors.some((e) => e.field === "module")).toBe(true);
    });
  });

  describe("validateSingleTransform - provider-wrap", () => {
    it("should require provider field", () => {
      const errors = validateSingleTransform(
        { type: "provider-wrap", target: "src/app/layout.tsx" },
        0
      );
      expect(errors.some((e) => e.field === "provider")).toBe(true);
    });

    it("should validate props as object", () => {
      const errors = validateSingleTransform(
        { type: "provider-wrap", target: "src/app/layout.tsx", provider: "P", props: "invalid" },
        0
      );
      expect(errors.some((e) => e.field === "props")).toBe(true);
    });
  });

  describe("validateSingleTransform - json-property", () => {
    it("should require path and value fields", () => {
      const errors = validateSingleTransform(
        { type: "json-property", target: "tsconfig.json" },
        0
      );
      expect(errors.some((e) => e.field === "path")).toBe(true);
      expect(errors.some((e) => e.field === "value")).toBe(true);
    });

    it("should validate merge as boolean", () => {
      const errors = validateSingleTransform(
        { type: "json-property", target: "tsconfig.json", path: "a.b", value: 1, merge: "yes" },
        0
      );
      expect(errors.some((e) => e.field === "merge")).toBe(true);
    });
  });

  describe("formatTransformErrors", () => {
    it("should format errors with index and field", () => {
      const errors = [
        { index: 0, field: "from", message: "required" },
        { index: 1, field: "type", message: "invalid" },
      ];
      const formatted = formatTransformErrors(errors);
      expect(formatted).toContain("transform[0].from: required");
      expect(formatted).toContain("transform[1].type: invalid");
    });

    it("should handle errors without index", () => {
      const errors = [{ index: -1, field: "transform", message: "must be array" }];
      const formatted = formatTransformErrors(errors);
      expect(formatted).toContain("transform.transform: must be array");
    });
  });

  describe("isValidTransformConfigArray", () => {
    it("should return true for valid array", () => {
      expect(
        isValidTransformConfigArray([
          { type: "import", target: "src/index.ts", from: "lodash" },
        ])
      ).toBe(true);
    });

    it("should return false for invalid array", () => {
      expect(isValidTransformConfigArray([{ type: "import" }])).toBe(false);
    });

    it("should return false for non-array", () => {
      expect(isValidTransformConfigArray({ type: "import" })).toBe(false);
    });
  });
});
