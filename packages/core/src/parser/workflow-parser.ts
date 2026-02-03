/**
 * Workflow YAML parser
 * @module @obora/core/parser/workflow-parser
 */

import { parse as parseYaml, YAMLParseError } from "yaml";

import { DependencyError, ParseError } from "../errors/index.js";
import type {
  DependencyMap,
  ParserOptions,
  Step,
  Workflow,
  WorkflowConfig,
  WorkflowMode,
} from "../types/workflow.js";

// Known fields for strict mode validation
const KNOWN_WORKFLOW_FIELDS = ["name", "version", "description", "mode", "config", "steps"];

const KNOWN_STEP_FIELDS = [
  "name",
  "agent",
  "description",
  "depends_on",
  "inputs",
  "outputs",
  "timeout",
  "config",
];

const KNOWN_CONFIG_FIELDS = ["retry", "retry_delay", "continue_on_error", "max_parallel"];

// Valid duration pattern: positive integer followed by s/m/h/d
const DURATION_PATTERN = /^[1-9]\d*[smhd]$/;

// Spec files that don't need to be produced by a step
const SPEC_FILES = ["proposal.md", "design.md", "tasks.md", "status.yaml"];

/**
 * Validate duration format
 */
function validateDuration(value: string, field: string): void {
  if (!DURATION_PATTERN.test(value)) {
    throw new ParseError(
      "E2005",
      `'${field}' has invalid duration format: '${value}'. Use format like '5s', '1m', '2h', '1d'`
    );
  }
}

/**
 * Check for unknown fields
 */
function checkUnknownFields(
  obj: Record<string, unknown>,
  knownFields: string[],
  context: string,
  options: ParserOptions
): void {
  const unknownFields = Object.keys(obj).filter((k) => !knownFields.includes(k));

  if (unknownFields.length > 0) {
    const message = `Unknown field(s) in ${context}: ${unknownFields.join(", ")}`;
    if (options.strict) {
      throw new ParseError("E2004", message);
    } else if (options.onWarning) {
      options.onWarning(`E2004: ${message}`);
    }
  }
}

/**
 * Parse a raw YAML object into a Step
 */
function parseStep(raw: unknown, index: number, options: ParserOptions): Step {
  if (typeof raw !== "object" || raw === null) {
    throw new ParseError("E2003", `Step at index ${index} must be an object`);
  }

  const obj = raw as Record<string, unknown>;

  // Check required fields
  if (!obj.name) {
    throw new ParseError("E2002", `Step at index ${index} is missing required field 'name'`);
  }
  if (typeof obj.name !== "string") {
    throw new ParseError("E2003", `Step at index ${index}: 'name' must be a string`);
  }

  if (!obj.agent) {
    throw new ParseError("E2002", `Step '${obj.name}' is missing required field 'agent'`);
  }
  if (typeof obj.agent !== "string") {
    throw new ParseError("E2003", `Step '${obj.name}': 'agent' must be a string`);
  }

  // Check unknown fields
  checkUnknownFields(obj, KNOWN_STEP_FIELDS, `step '${obj.name}'`, options);

  // Validate optional fields
  if (obj.timeout !== undefined) {
    if (typeof obj.timeout !== "string") {
      throw new ParseError("E2003", `Step '${obj.name}': 'timeout' must be a string`);
    }
    validateDuration(obj.timeout, `step '${obj.name}'.timeout`);
  }

  if (obj.depends_on !== undefined) {
    if (!Array.isArray(obj.depends_on)) {
      throw new ParseError("E2003", `Step '${obj.name}': 'depends_on' must be an array`);
    }
    if (!obj.depends_on.every((d) => typeof d === "string")) {
      throw new ParseError("E2003", `Step '${obj.name}': 'depends_on' must be an array of strings`);
    }
  }

  if (obj.inputs !== undefined) {
    if (!Array.isArray(obj.inputs)) {
      throw new ParseError("E2003", `Step '${obj.name}': 'inputs' must be an array`);
    }
  }

  if (obj.outputs !== undefined) {
    if (!Array.isArray(obj.outputs)) {
      throw new ParseError("E2003", `Step '${obj.name}': 'outputs' must be an array`);
    }
  }

  return {
    name: obj.name,
    agent: obj.agent,
    description: obj.description as string | undefined,
    depends_on: obj.depends_on as string[] | undefined,
    inputs: obj.inputs as string[] | undefined,
    outputs: obj.outputs as string[] | undefined,
    timeout: obj.timeout as string | undefined,
    config: obj.config as Record<string, unknown> | undefined,
  };
}

/**
 * Parse workflow config
 */
function parseConfig(raw: unknown, options: ParserOptions): WorkflowConfig | undefined {
  if (raw === undefined) return undefined;

  if (typeof raw !== "object" || raw === null) {
    throw new ParseError("E2003", "'config' must be an object");
  }

  const obj = raw as Record<string, unknown>;

  checkUnknownFields(obj, KNOWN_CONFIG_FIELDS, "config", options);

  // Validate duration fields
  if (obj.retry_delay !== undefined) {
    if (typeof obj.retry_delay !== "string") {
      throw new ParseError("E2003", "'config.retry_delay' must be a string");
    }
    validateDuration(obj.retry_delay, "config.retry_delay");
  }

  return {
    retry: obj.retry as number | undefined,
    retry_delay: obj.retry_delay as string | undefined,
    continue_on_error: obj.continue_on_error as boolean | undefined,
    max_parallel: obj.max_parallel as number | undefined,
  };
}

/**
 * Check for duplicate step names
 */
function checkDuplicateSteps(steps: Step[]): void {
  const names = new Set<string>();
  for (const step of steps) {
    if (names.has(step.name)) {
      throw new ParseError("E2006", `Duplicate step name: '${step.name}'`);
    }
    names.add(step.name);
  }
}

/**
 * Check for self-dependencies
 */
function checkSelfDependencies(steps: Step[]): void {
  for (const step of steps) {
    if (step.depends_on?.includes(step.name)) {
      throw new DependencyError("E3003", `Step '${step.name}' depends on itself`);
    }
  }
}

/**
 * Check for missing dependencies
 */
function checkMissingDependencies(steps: Step[]): void {
  const stepNames = new Set(steps.map((s) => s.name));

  for (const step of steps) {
    if (step.depends_on) {
      for (const dep of step.depends_on) {
        if (!stepNames.has(dep)) {
          throw new DependencyError(
            "E3002",
            `Step '${step.name}' depends on non-existent step '${dep}'`
          );
        }
      }
    }
  }
}

/**
 * Check for circular dependencies using DFS
 */
function checkCircularDependencies(steps: Step[]): void {
  const graph = new Map<string, string[]>();
  for (const step of steps) {
    graph.set(step.name, step.depends_on || []);
  }

  const visited = new Set<string>();
  const recStack = new Set<string>();

  function hasCycle(node: string, path: string[]): boolean {
    visited.add(node);
    recStack.add(node);

    const deps = graph.get(node) || [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        if (hasCycle(dep, [...path, dep])) {
          return true;
        }
      } else if (recStack.has(dep)) {
        throw new DependencyError(
          "E3001",
          `Circular dependency detected: ${[...path, node, dep].join(" -> ")}`
        );
      }
    }

    recStack.delete(node);
    return false;
  }

  for (const step of steps) {
    if (!visited.has(step.name)) {
      hasCycle(step.name, [step.name]);
    }
  }
}

/**
 * Check for unresolved input files
 */
function checkUnresolvedInputs(steps: Step[], options: ParserOptions): void {
  // Collect all outputs
  const availableOutputs = new Set<string>();
  for (const step of steps) {
    if (step.outputs) {
      for (const output of step.outputs) {
        availableOutputs.add(output);
      }
    }
  }

  // Check inputs
  for (const step of steps) {
    if (step.inputs) {
      for (const input of step.inputs) {
        // Skip spec files
        const filename = input.split("/").pop() || input;
        if (SPEC_FILES.includes(filename)) {
          continue;
        }

        if (!availableOutputs.has(input)) {
          if (options.strict) {
            throw new DependencyError(
              "E3004",
              `Step '${step.name}' requires input '${input}' but no step produces it`
            );
          } else if (options.onWarning) {
            options.onWarning(
              `E3004: Step '${step.name}' requires input '${input}' but no step produces it`
            );
          }
        }
      }
    }
  }
}

/**
 * Parse workflow YAML string into typed Workflow object
 */
export function parseWorkflow(yamlContent: string, options: ParserOptions = {}): Workflow {
  let raw: unknown;

  // Parse YAML
  try {
    raw = parseYaml(yamlContent);
  } catch (error) {
    if (error instanceof YAMLParseError) {
      throw new ParseError("E2001", error.message);
    }
    throw error;
  }

  if (typeof raw !== "object" || raw === null) {
    throw new ParseError("E2001", "Workflow must be a YAML object");
  }

  const obj = raw as Record<string, unknown>;

  // Check unknown fields
  checkUnknownFields(obj, KNOWN_WORKFLOW_FIELDS, "workflow", options);

  // Check required fields
  if (!obj.name) {
    throw new ParseError("E2002", "Missing required field 'name'");
  }
  if (typeof obj.name !== "string") {
    throw new ParseError("E2003", "'name' must be a string");
  }

  if (!obj.steps) {
    throw new ParseError("E2002", "Missing required field 'steps'");
  }
  if (!Array.isArray(obj.steps)) {
    throw new ParseError("E2003", "'steps' must be an array");
  }

  // Validate mode if present
  if (obj.mode !== undefined) {
    const validModes: WorkflowMode[] = ["auto", "gated", "manual"];
    if (!validModes.includes(obj.mode as WorkflowMode)) {
      throw new ParseError("E2003", `'mode' must be one of: ${validModes.join(", ")}`);
    }
  }

  // Parse steps
  const steps = obj.steps.map((s, i) => parseStep(s, i, options));

  // Validate steps
  checkDuplicateSteps(steps);
  checkSelfDependencies(steps);
  checkMissingDependencies(steps);
  checkCircularDependencies(steps);
  checkUnresolvedInputs(steps, options);

  return {
    name: obj.name,
    version: obj.version as string | undefined,
    description: obj.description as string | undefined,
    mode: obj.mode as WorkflowMode | undefined,
    config: parseConfig(obj.config, options),
    steps,
  };
}

/**
 * Resolve dependencies including implicit ones from inputs/outputs
 */
export function resolveDependencies(workflow: Workflow): DependencyMap {
  const deps = new Map<string, string[]>();

  // Build output map: file -> step name
  const outputMap = new Map<string, string>();
  for (const step of workflow.steps) {
    if (step.outputs) {
      for (const output of step.outputs) {
        outputMap.set(output, step.name);
      }
    }
  }

  // Resolve dependencies for each step
  for (const step of workflow.steps) {
    const stepDeps = new Set<string>(step.depends_on || []);

    // Add implicit dependencies from inputs
    if (step.inputs) {
      for (const input of step.inputs) {
        const producer = outputMap.get(input);
        if (producer && producer !== step.name) {
          stepDeps.add(producer);
        }
      }
    }

    deps.set(step.name, Array.from(stepDeps));
  }

  return deps;
}
