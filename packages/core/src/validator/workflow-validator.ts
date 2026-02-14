/**
 * Workflow validator using JSON Schema and graph analysis
 * @module @obora/core/validator/workflow-validator
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";

import { DependencyError, ParseError } from "../errors/index.js";
import { detectCycles } from "../graph/index.js";
import { parseWorkflow } from "../parser/workflow-parser.js";
import type { Step, Workflow } from "../types/workflow.js";

/**
 * Error code enum for validation errors
 */
export enum ValidationErrorCode {
  INVALID_SCHEMA = "INVALID_SCHEMA",
  CIRCULAR_DEPENDENCY = "CIRCULAR_DEPENDENCY",
  MISSING_REFERENCE = "MISSING_REFERENCE",
  SELF_REFERENCE = "SELF_REFERENCE",
  INVALID_EXECUTION_LEVEL = "INVALID_EXECUTION_LEVEL",
}

/**
 * Validation error details
 */
export interface ValidationError {
  /** Error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** JSON path to the error location */
  path: string;
  /** Line number (if available) */
  line?: number;
  /** Column number (if available) */
  column?: number;
  /** Suggested fix */
  suggestion?: string;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed */
  isValid: boolean;
  /** List of errors */
  errors: ValidationError[];
  /** List of warnings */
  warnings: ValidationError[];
}

/**
 * JSON Schema for workflow validation
 */
const workflowSchema = {
  type: "object",
  required: ["name", "steps"],
  properties: {
    name: { type: "string" },
    version: { type: "string" },
    description: { type: "string" },
    mode: { type: "string", enum: ["auto", "supervised", "gated", "manual"] },
    config: {
      type: "object",
      properties: {
        retry: { type: "integer", minimum: 0 },
        retry_delay: { type: "string", pattern: "^[1-9]\\d*[smhd]$" },
        continue_on_error: { type: "boolean" },
        max_parallel: { type: "integer", minimum: 1 },
      },
      additionalProperties: false,
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "agent"],
        properties: {
          name: { type: "string" },
          agent: { type: "string" },
          description: { type: "string" },
          provider: { type: "string" },
          model: { type: "string" },
          depends_on: { type: "array", items: { type: "string" } },
          inputs: { type: "array", items: { type: "string" } },
          outputs: { type: "array", items: { type: "string" } },
          timeout: { type: "string", pattern: "^[1-9]\\d*[smhd]$" },
          config: { type: "object" },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
} as const;

// Initialize AJV validator
const ajv = new Ajv.default({ allErrors: true });
addFormats.default(ajv);
const workflowValidate = ajv.compile(workflowSchema);

/**
 * Convert JSON path to dot notation
 */
function jsonPathToDotPath(path: string): string {
  return path.replace(/^\//, "").replace(/\//g, ".").replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Get line number from JSON path (simplified - requires source tracking for precise location)
 */
function getLineNumberFromPath(_path: string): number | undefined {
  // For precise line numbers, we would need to track source positions during parsing
  // This is a placeholder for future enhancement
  return undefined;
}

/**
 * Validate workflow using JSON Schema
 */
export function validateSchema(workflow: unknown): ValidationError[] {
  const errors: ValidationError[] = [];

  const valid = workflowValidate(workflow);
  if (!valid && workflowValidate.errors) {
    for (const err of workflowValidate.errors) {
      errors.push({
        code: ValidationErrorCode.INVALID_SCHEMA,
        message: err.message || "Invalid schema",
        path: jsonPathToDotPath(err.instancePath || ""),
        line: getLineNumberFromPath(err.instancePath || ""),
        suggestion: getSuggestion(err),
      });
    }
  }

  return errors;
}

/**
 * Get suggestion for a validation error
 */
function getSuggestion(err: Ajv.ErrorObject): string | undefined {
  switch (err.keyword) {
    case "required":
      return `Add missing property: ${err.params.missingProperty}`;
    case "type":
      return `Expected type: ${err.params.type}`;
    case "enum":
      return `Must be one of: ${(err.params.allowedValues as string[]).join(", ")}`;
    case "pattern":
      return "Format must match the required pattern";
    case "additionalProperties":
      return "Remove unknown property or check spelling";
    default:
      return undefined;
  }
}

/**
 * Check for circular dependencies using graph module
 */
export function validateCircularDependencies(steps: Step[]): ValidationError[] {
  const errors: ValidationError[] = [];

  // Build simple graph for cycle detection
  const graph = new Map<string, string[]>();
  for (const step of steps) {
    graph.set(step.name, step.depends_on || []);
  }

  // Use detectCycles from graph module
  const { hasCycle, cyclePath } = detectCycles({
    nodes: new Set(steps.map((s) => s.name)),
    edges: new Map(),
    reverseEdges: new Map(Array.from(graph.entries()).map(([node, deps]) => [node, new Set(deps)])),
  });

  if (hasCycle && cyclePath) {
    errors.push({
      code: ValidationErrorCode.CIRCULAR_DEPENDENCY,
      message: "Circular dependency detected in workflow",
      path: cyclePath.join(" -> "),
      suggestion: `Remove one of the dependencies in the cycle: ${cyclePath.join(" → ")}`,
    });
  }

  return errors;
}

/**
 * Check for self-references
 */
export function validateSelfReferences(steps: Step[]): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const step of steps) {
    if (step.depends_on?.includes(step.name)) {
      errors.push({
        code: ValidationErrorCode.SELF_REFERENCE,
        message: `Step '${step.name}' depends on itself`,
        path: `steps.${step.name}.depends_on`,
        suggestion: `Remove '${step.name}' from its own dependencies`,
      });
    }
  }

  return errors;
}

/**
 * Check for missing references
 */
export function validateMissingReferences(steps: Step[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const stepNames = new Set(steps.map((s) => s.name));

  for (const step of steps) {
    if (step.depends_on) {
      for (const dep of step.depends_on) {
        if (!stepNames.has(dep)) {
          errors.push({
            code: ValidationErrorCode.MISSING_REFERENCE,
            message: `Step '${step.name}' depends on non-existent step '${dep}'`,
            path: `steps.${step.name}.depends_on`,
            suggestion: `Create step '${dep}' or remove the dependency`,
          });
        }
      }
    }
  }

  return errors;
}

/**
 * Check for unresolved inputs
 */
export function validateInputs(steps: Step[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Collect all outputs
  const availableOutputs = new Set<string>();
  for (const step of steps) {
    if (step.outputs) {
      for (const output of step.outputs) {
        availableOutputs.add(output);
      }
    }
  }

  // Spec files that don't need to be produced by a step
  const specFiles = ["proposal.md", "design.md", "tasks.md", "status.yaml"];

  // Check inputs
  for (const step of steps) {
    if (step.inputs) {
      for (const input of step.inputs) {
        const filename = input.split("/").pop() || input;
        if (specFiles.includes(filename)) {
          continue;
        }

        if (!availableOutputs.has(input)) {
          warnings.push({
            code: "UNRESOLVED_INPUT",
            message: `Step '${step.name}' requires input '${input}' but no step produces it`,
            path: `steps.${step.name}.inputs`,
            suggestion: `Add a step that produces '${input}' or remove it from inputs`,
          });
        }
      }
    }
  }

  return [...errors, ...warnings];
}

/**
 * Full workflow validation
 */
export function validateWorkflow(workflow: Workflow): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Schema validation
  const schemaErrors = validateSchema(workflow);
  errors.push(...schemaErrors);

  // Skip further validation if schema is invalid
  if (schemaErrors.length > 0) {
    return { isValid: false, errors, warnings };
  }

  // Dependency validations
  errors.push(...validateSelfReferences(workflow.steps));
  errors.push(...validateMissingReferences(workflow.steps));
  errors.push(...validateCircularDependencies(workflow.steps));

  // Input validation (produces warnings)
  const inputValidation = validateInputs(workflow.steps);
  inputValidation.forEach((v) => {
    if (v.code === "UNRESOLVED_INPUT") {
      warnings.push(v);
    } else {
      errors.push(v);
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Parse and validate workflow from YAML string
 */
export function parseAndValidate(yamlContent: string): ValidationResult {
  try {
    const workflow = parseWorkflow(yamlContent);
    return validateWorkflow(workflow);
  } catch (error) {
    if (error instanceof ParseError || error instanceof DependencyError) {
      return {
        isValid: false,
        errors: [
          {
            code: error.code,
            message: error.message,
            path: "",
            suggestion: getParseErrorSuggestion(error.code),
          },
        ],
        warnings: [],
      };
    }
    throw error;
  }
}

/**
 * Get suggestion for parse errors
 */
function getParseErrorSuggestion(code: string): string | undefined {
  switch (code) {
    case "E2001":
      return "Check YAML syntax and structure";
    case "E2002":
      return "Add the missing required field";
    case "E2003":
      return "Check field type and format";
    case "E3001":
      return "Remove or restructure circular dependencies";
    case "E3002":
      return "Create the referenced step or remove the dependency";
    case "E3003":
      return "Remove self-reference from depends_on";
    default:
      return undefined;
  }
}
