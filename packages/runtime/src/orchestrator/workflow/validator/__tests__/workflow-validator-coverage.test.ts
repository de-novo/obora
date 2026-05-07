import { describe, expect, it } from "vitest";

import type { Step, Workflow } from "../../types/workflow";
import {
  parseAndValidate,
  validateCircularDependencies,
  validateInputs,
  validateMissingReferences,
  validateSchema,
  validateSelfReferences,
  validateWorkflow,
  ValidationErrorCode,
} from "../workflow-validator";

const baseSteps: Step[] = [
  { name: "collect", agent: "researcher", outputs: ["raw.json"] },
  { name: "validate", agent: "validator", depends_on: ["collect"], inputs: ["raw.json"] },
];

function workflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    name: "runtime-quality",
    steps: baseSteps,
    ...overrides,
  };
}

describe("workflow-validator coverage paths", () => {
  it("returns schema suggestions for required, type, enum, pattern, and additional property errors", () => {
    expect(validateSchema({ steps: [] })).toContainEqual(
      expect.objectContaining({
        code: ValidationErrorCode.INVALID_SCHEMA,
        path: "",
        suggestion: "Add missing property: name",
      }),
    );
    expect(validateSchema({ name: "bad", mode: "robot", steps: [] })).toContainEqual(
      expect.objectContaining({
        path: "mode",
        suggestion: "Must be one of: auto, supervised, gated, manual",
      }),
    );
    expect(validateSchema({ name: "bad", config: { retry_delay: "now" }, steps: [] })).toContainEqual(
      expect.objectContaining({
        path: "config.retry_delay",
        suggestion: "Format must match the required pattern",
      }),
    );
    expect(validateSchema({ name: "bad", config: { retry: "twice" }, steps: [] })).toContainEqual(
      expect.objectContaining({
        path: "config.retry",
        suggestion: "Expected type: integer",
      }),
    );
    expect(validateSchema({ name: "bad", unknown: true, steps: [] })).toContainEqual(
      expect.objectContaining({
        path: "",
        suggestion: "Remove unknown property or check spelling",
      }),
    );
  });

  it("detects self, missing, circular, and unresolved input references", () => {
    expect(validateSchema(workflow())).toEqual([]);
    expect(validateSelfReferences([{ name: "a", agent: "x" }])).toEqual([]);
    expect(validateMissingReferences([{ name: "a", agent: "x", depends_on: [] }])).toEqual([]);
    expect(validateCircularDependencies([{ name: "a", agent: "x" }])).toEqual([]);
    expect(validateInputs([{ name: "a", agent: "x", outputs: ["data/raw.json"] }, { name: "b", agent: "y", inputs: ["data/raw.json", "docs/proposal.md"] }])).toEqual([]);

    expect(validateSelfReferences([{ name: "a", agent: "x", depends_on: ["a"] }])).toEqual([
      expect.objectContaining({
        code: ValidationErrorCode.SELF_REFERENCE,
        path: "steps.a.depends_on",
      }),
    ]);
    expect(validateMissingReferences([{ name: "a", agent: "x", depends_on: ["missing"] }])).toEqual([
      expect.objectContaining({
        code: ValidationErrorCode.MISSING_REFERENCE,
        path: "steps.a.depends_on",
      }),
    ]);
    expect(
      validateCircularDependencies([
        { name: "a", agent: "x", depends_on: ["b"] },
        { name: "b", agent: "y", depends_on: ["a"] },
      ]),
    ).toEqual([
      expect.objectContaining({
        code: ValidationErrorCode.CIRCULAR_DEPENDENCY,
      }),
    ]);
    expect(validateInputs([{ name: "a", agent: "x", inputs: ["missing.json", "status.yaml"] }])).toEqual([
      expect.objectContaining({
        code: "UNRESOLVED_INPUT",
        path: "steps.a.inputs",
      }),
    ]);
  });

  it("splits full workflow validation errors from warnings", () => {
    expect(validateWorkflow(workflow())).toEqual({
      isValid: true,
      errors: [],
      warnings: [],
    });

    expect(validateWorkflow(workflow({ steps: [{ name: "a", agent: "x", inputs: ["missing.json"] }] }))).toEqual({
      isValid: true,
      errors: [],
      warnings: [
        expect.objectContaining({
          code: "UNRESOLVED_INPUT",
          path: "steps.a.inputs",
        }),
      ],
    });

    const invalid = validateWorkflow(workflow({ mode: "robot" as Workflow["mode"] }));
    expect(invalid.isValid).toBe(false);
    expect(invalid.errors).toContainEqual(
      expect.objectContaining({
        code: ValidationErrorCode.INVALID_SCHEMA,
        path: "mode",
      }),
    );
    expect(invalid.warnings).toEqual([]);
  });

  it("turns parse errors into validation results with actionable suggestions", () => {
    expect(
      parseAndValidate(`
name: parsed
steps:
  - name: collect
    agent: researcher
`),
    ).toEqual({ isValid: true, errors: [], warnings: [] });

    expect(parseAndValidate("not: [closed")).toEqual({
      isValid: false,
      errors: [
        expect.objectContaining({
          code: "E2001",
          suggestion: "Check YAML syntax and structure",
        }),
      ],
      warnings: [],
    });
    expect(
      parseAndValidate(`
name: missing-ref
steps:
  - name: a
    agent: x
    depends_on: [b]
`),
    ).toEqual({
      isValid: false,
      errors: [
        expect.objectContaining({
          code: "E3002",
          suggestion: "Create the referenced step or remove the dependency",
        }),
      ],
      warnings: [],
    });
    expect(
      parseAndValidate(`
steps: []
`),
    ).toMatchObject({
      isValid: false,
      errors: [expect.objectContaining({ code: "E2002", suggestion: "Add the missing required field" })],
    });
    expect(
      parseAndValidate(`
name: bad-type
steps: nope
`),
    ).toMatchObject({
      isValid: false,
      errors: [expect.objectContaining({ code: "E2003", suggestion: "Check field type and format" })],
    });
    expect(
      parseAndValidate(`
name: circular
steps:
  - name: a
    agent: x
    depends_on: [b]
  - name: b
    agent: x
    depends_on: [a]
`),
    ).toMatchObject({
      isValid: false,
      errors: [expect.objectContaining({ code: "E3001", suggestion: "Remove or restructure circular dependencies" })],
    });
    expect(
      parseAndValidate(`
name: self-ref
steps:
  - name: a
    agent: x
    depends_on: [a]
`),
    ).toMatchObject({
      isValid: false,
      errors: [expect.objectContaining({ code: "E3003", suggestion: "Remove self-reference from depends_on" })],
    });
    expect(
      parseAndValidate(`
name: invalid-duration
steps:
  - name: a
    agent: x
    timeout: 0s
`),
    ).toMatchObject({
      isValid: false,
      errors: [expect.objectContaining({ code: "E2005", suggestion: undefined })],
    });
  });
});
