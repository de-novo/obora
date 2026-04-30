/**
 * Workflow YAML parser
 * @module @obora/core/parser/workflow-parser
 */

import { parse as parseYaml, YAMLParseError } from "yaml";

import { DependencyError, ParseError } from "../errors/index.js";
import { buildGraph, topologicalSort } from "../graph/index.js";
import type {
  BackEdgeEscalation,
  ConsensusConfig,
  DependencyMap,
  GateConfig,
  GateType,
  ParserOptions,
  PolicyOverride,
  RecoveryStrategyConfig,
  StateBinding,
  Step,
  StepOnFailConfig,
  Workflow,
  WorkflowConfig,
  WorkflowMode,
  AuditConfig,
} from "../types/workflow.js";

// Known fields for strict mode validation
const KNOWN_WORKFLOW_FIELDS = ["name", "version", "description", "mode", "config", "policy", "steps", "recovery", "audit"];

const KNOWN_STEP_FIELDS = [
  "name",
  "agent",
  "description",
  "provider",
  "model",
  "depends_on",
  "inputs",
  "outputs",
  "timeout",
  "skills",
  "tools",
  "bindings",
  "consensus",
  "gate",
  "gate_config",
  "pattern",
  "participants",
  "policy",
  "on_fail",
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
function parseStateBindings(raw: unknown, stepName: string): StateBinding[] | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (!Array.isArray(raw)) {
    throw new ParseError("E2003", `Step '${stepName}': 'bindings' must be an array`);
  }

  return raw.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new ParseError("E2003", `Step '${stepName}': 'bindings[${index}]' must be an object`);
    }
    const binding = item as Record<string, unknown>;
    if (typeof binding.source !== "string" || typeof binding.target !== "string") {
      throw new ParseError("E2003", `Step '${stepName}': binding requires string 'source' and 'target'`);
    }

    return {
      source: binding.source,
      target: binding.target,
      transform: typeof binding.transform === "string" ? binding.transform : undefined,
      condition: typeof binding.condition === "string" ? binding.condition : undefined,
    };
  });
}

function parseConsensus(raw: unknown, stepName: string): ConsensusConfig | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (typeof raw !== "object" || raw === null) {
    throw new ParseError("E2003", `Step '${stepName}': 'consensus' must be an object`);
  }

  const obj = raw as Record<string, unknown>;
  const validTypes = ["majority", "unanimous", "weighted", "score-threshold", "custom"] as const;
  const type = obj.type;
  if (typeof type !== "string" || !validTypes.includes(type as (typeof validTypes)[number])) {
    throw new ParseError("E2003", `Step '${stepName}': 'consensus.type' is invalid`);
  }

  return {
    type: type as ConsensusConfig["type"],
    voters: Array.isArray(obj.voters) ? obj.voters as ConsensusConfig["voters"] : undefined,
    min: typeof obj.min === "number" ? obj.min : undefined,
    of: typeof obj.of === "number" ? obj.of : undefined,
    threshold: typeof obj.threshold === "number" ? obj.threshold : undefined,
    timeout: typeof obj.timeout === "string" ? obj.timeout : undefined,
    best_effort: Array.isArray(obj.best_effort) ? obj.best_effort.filter((x): x is string => typeof x === "string") : undefined,
    custom: typeof obj.custom === "string" ? obj.custom : undefined,
  };
}

function parseGateConfig(raw: unknown, stepName: string): GateConfig | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== "object" || raw === null) {
    throw new ParseError("E2003", `Step '${stepName}': 'gate_config' must be an object`);
  }

  const config = raw as Record<string, unknown>;
  return {
    timeout: typeof config.timeout === "string" ? config.timeout : undefined,
    fallback:
      config.fallback === "fail" || config.fallback === "escalate" || config.fallback === "auto-approve"
        ? config.fallback
        : undefined,
    escalation_to: typeof config.escalation_to === "string" ? config.escalation_to : undefined,
  };
}

function parsePolicyOverride(raw: unknown, stepName: string): PolicyOverride | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== "object" || raw === null) {
    throw new ParseError("E2003", `Step '${stepName}': 'policy' must be an object`);
  }

  const policy = raw as Record<string, unknown>;
  return {
    sandbox: typeof policy.sandbox === "string" ? policy.sandbox : undefined,
    tools_override: Array.isArray(policy.tools_override)
      ? policy.tools_override.filter((item): item is { name: string; effect: "allow" | "deny" | "transform" | "gate" } => {
        if (typeof item !== "object" || item === null) {
          return false;
        }
        const candidate = item as Record<string, unknown>;
        return typeof candidate.name === "string"
          && (candidate.effect === "allow" || candidate.effect === "deny" || candidate.effect === "transform" || candidate.effect === "gate");
      })
      : undefined,
  };
}

function parseOnFail(raw: unknown, stepName: string): StepOnFailConfig | undefined {
  if (raw === undefined) {
    return undefined;
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ParseError("E2003", `Step '${stepName}': 'on_fail' must be an object`);
  }

  const config = raw as Record<string, unknown>;
  if (typeof config.goto !== "string" || config.goto.length === 0) {
    throw new ParseError("E2003", `Step '${stepName}': 'on_fail.goto' must be a non-empty string`);
  }

  if (config.max_iterations === undefined || typeof config.max_iterations !== "number" || !Number.isInteger(config.max_iterations)) {
    throw new ParseError("E2003", `Step '${stepName}': 'max_iterations' is required and must be an integer`);
  }
  if (config.max_iterations < 1) {
    throw new ParseError("E2003", `max_iterations must be \u2265 1, got ${config.max_iterations}`);
  }

  const escalation = config.escalate_on_exhaust ?? "fail";
  if (escalation !== "human" && escalation !== "dlq" && escalation !== "fail") {
    throw new ParseError("E2003", `unknown escalation: ${String(escalation)}`);
  }

  const cooldownMs = config.cooldown_ms ?? 0;
  if (typeof cooldownMs !== "number" || !Number.isInteger(cooldownMs) || cooldownMs < 0 || cooldownMs > 300000) {
    throw new ParseError("E2003", `cooldown_ms must be 0~300000ms, got ${String(cooldownMs)}`);
  }

  if (config.max_cost !== undefined && config.max_cost !== null) {
    if (typeof config.max_cost !== "number" || config.max_cost <= 0) {
      throw new ParseError("E2003", `max_cost must be positive, got ${String(config.max_cost)}`);
    }
  }

  // Spec: omitted max_cost_escalation = null at parser level. Inheritance from escalate_on_exhaust happens at runtime.
  const maxCostEscalationRaw = config.max_cost_escalation ?? null;
  if (maxCostEscalationRaw !== null && maxCostEscalationRaw !== "human" && maxCostEscalationRaw !== "dlq" && maxCostEscalationRaw !== "fail") {
    throw new ParseError("E2003", `unknown escalation: ${String(maxCostEscalationRaw)}`);
  }

  return {
    goto: config.goto,
    max_iterations: config.max_iterations,
    escalate_on_exhaust: escalation as BackEdgeEscalation,
    cooldown_ms: cooldownMs,
    reset_state: Boolean(config.reset_state ?? false),
    max_cost: config.max_cost === undefined ? null : config.max_cost as number | null,
    max_cost_escalation: maxCostEscalationRaw as BackEdgeEscalation | null,
  };
}

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

  if (obj.provider !== undefined && typeof obj.provider !== "string") {
    throw new ParseError("E2003", `Step '${obj.name}': 'provider' must be a string`);
  }

  if (obj.model !== undefined && typeof obj.model !== "string") {
    throw new ParseError("E2003", `Step '${obj.name}': 'model' must be a string`);
  }

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
    if (!obj.inputs.every((i) => typeof i === "string")) {
      throw new ParseError("E2003", `Step '${obj.name}': 'inputs' must be an array of strings`);
    }
  }

  if (obj.outputs !== undefined) {
    if (!Array.isArray(obj.outputs)) {
      throw new ParseError("E2003", `Step '${obj.name}': 'outputs' must be an array`);
    }
    if (!obj.outputs.every((o) => typeof o === "string")) {
      throw new ParseError("E2003", `Step '${obj.name}': 'outputs' must be an array of strings`);
    }
  }

  // Validate description type
  if (obj.description !== undefined && typeof obj.description !== "string") {
    throw new ParseError("E2003", `Step '${obj.name}': 'description' must be a string`);
  }

  if (obj.skills !== undefined) {
    if (!Array.isArray(obj.skills)) {
      throw new ParseError("E2003", `Step '${obj.name}': 'skills' must be an array`);
    }
    if (!obj.skills.every((skill) => typeof skill === "string")) {
      throw new ParseError("E2003", `Step '${obj.name}': 'skills' must be an array of strings`);
    }
  }

  if (obj.tools !== undefined) {
    if (!Array.isArray(obj.tools) || !obj.tools.every((tool) => typeof tool === "string")) {
      throw new ParseError("E2003", `Step '${obj.name}': 'tools' must be an array of strings`);
    }
  }

  if (obj.gate !== undefined) {
    const validGates: GateType[] = ["human-approval", "consensus", "external"];
    if (!validGates.includes(obj.gate as GateType)) {
      throw new ParseError("E2003", `Step '${obj.name}': 'gate' must be one of ${validGates.join(", ")}`);
    }
  }

  if (obj.pattern !== undefined && typeof obj.pattern !== "string") {
    throw new ParseError("E2003", `Step '${obj.name}': 'pattern' must be a string`);
  }

  if (obj.participants !== undefined && (typeof obj.participants !== "object" || obj.participants === null || Array.isArray(obj.participants))) {
    throw new ParseError("E2003", `Step '${obj.name}': 'participants' must be an object`);
  }

  return {
    name: obj.name,
    agent: obj.agent,
    description: obj.description as string | undefined,
    provider: obj.provider as string | undefined,
    model: obj.model as string | undefined,
    depends_on: obj.depends_on as string[] | undefined,
    inputs: obj.inputs as string[] | undefined,
    outputs: obj.outputs as string[] | undefined,
    timeout: obj.timeout as string | undefined,
    skills: obj.skills as string[] | undefined,
    tools: obj.tools as string[] | undefined,
    bindings: parseStateBindings(obj.bindings, obj.name),
    consensus: parseConsensus(obj.consensus, obj.name),
    gate: obj.gate as GateType | undefined,
    gate_config: parseGateConfig(obj.gate_config, obj.name),
    pattern: obj.pattern as string | undefined,
    participants: obj.participants as Record<string, string> | undefined,
    policy: parsePolicyOverride(obj.policy, obj.name),
    on_fail: parseOnFail(obj.on_fail, obj.name),
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

  // Validate config field types
  if (obj.retry !== undefined && typeof obj.retry !== "number") {
    throw new ParseError("E2003", "'config.retry' must be a number");
  }

  if (obj.retry_delay !== undefined) {
    if (typeof obj.retry_delay !== "string") {
      throw new ParseError("E2003", "'config.retry_delay' must be a string");
    }
    validateDuration(obj.retry_delay, "config.retry_delay");
  }

  if (obj.continue_on_error !== undefined && typeof obj.continue_on_error !== "boolean") {
    throw new ParseError("E2003", "'config.continue_on_error' must be a boolean");
  }

  if (obj.max_parallel !== undefined && typeof obj.max_parallel !== "number") {
    throw new ParseError("E2003", "'config.max_parallel' must be a number");
  }

  return {
    retry: obj.retry as number | undefined,
    retry_delay: obj.retry_delay as string | undefined,
    continue_on_error: obj.continue_on_error as boolean | undefined,
    max_parallel: obj.max_parallel as number | undefined,
  };
}

function parseAudit(raw: unknown): AuditConfig | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ParseError("E2003", "'audit' must be an object");
  }

  const audit = raw as Record<string, unknown>;
  const store = audit.store;
  if (store !== "duckdb" && store !== "sqlite" && store !== "custom") {
    throw new ParseError("E2003", "'audit.store' must be one of: duckdb, sqlite, custom");
  }

  return {
    store,
    path: typeof audit.path === "string" ? audit.path : undefined,
    retention: typeof audit.retention === "string" ? audit.retention : undefined,
    custom: typeof audit.custom === "string" ? audit.custom : undefined,
  };
}

function parseRecovery(raw: unknown): Record<string, RecoveryStrategyConfig> | undefined {
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ParseError("E2003", "'recovery' must be an object");
  }

  const recovery = raw as Record<string, unknown>;
  const parsed: Record<string, RecoveryStrategyConfig> = {};

  for (const [stepName, config] of Object.entries(recovery)) {
    if (typeof config !== "object" || config === null) {
      throw new ParseError("E2003", `'recovery.${stepName}' must be an object`);
    }

    const item = config as Record<string, unknown>;
    const valid = ["retry", "rollback", "escalate", "alternative", "custom"];
    if (!valid.includes(String(item.on_fail))) {
      throw new ParseError("E2003", `'recovery.${stepName}.on_fail' is invalid`);
    }

    parsed[stepName] = {
      on_fail: item.on_fail as RecoveryStrategyConfig["on_fail"],
      max_retries: typeof item.max_retries === "number" ? item.max_retries : undefined,
      backoff: item.backoff === "linear" || item.backoff === "exponential" ? item.backoff : undefined,
      backoff_base: typeof item.backoff_base === "string" ? item.backoff_base : undefined,
      to: typeof item.to === "string" ? item.to : undefined,
      fallback: item.fallback as RecoveryStrategyConfig["fallback"],
      custom: typeof item.custom === "string" ? item.custom : undefined,
    };
  }

  return parsed;
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

function checkOnFailMutualExclusion(
  steps: Step[],
  recovery: Record<string, RecoveryStrategyConfig> | undefined,
): void {
  for (const step of steps) {
    if (!step.on_fail?.goto) {
      continue;
    }

    const workflowRecovery = recovery?.[step.name];
    const stepConfigRecovery = (step.config as Record<string, unknown> | undefined)?.recovery as Record<string, unknown> | undefined;
    const hasStepConfigOnFail = typeof stepConfigRecovery?.on_fail === "string";
    const hasWorkflowOnFail = typeof workflowRecovery?.on_fail === "string";

    if (hasStepConfigOnFail || hasWorkflowOnFail) {
      throw new ParseError(
        "E2003",
        `Step '${step.name}': 'on_fail.goto' and 'recovery.on_fail' are mutually exclusive`,
      );
    }
  }
}

function checkOnFailBackEdges(steps: Step[]): void {
  const stepNames = new Set(steps.map((s) => s.name));
  const byTarget = new Map<string, string[]>();
  const graph = buildGraph(steps);
  const topo = topologicalSort(graph);

  if (!topo.success) {
    return;
  }

  const canReachDependency = (from: string, target: string): boolean => {
    const visited = new Set<string>();
    const queue = [from];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const deps = graph.reverseEdges.get(current) ?? new Set<string>();
      for (const dep of deps) {
        if (dep === target) {
          return true;
        }
        if (!visited.has(dep)) {
          visited.add(dep);
          queue.push(dep);
        }
      }
    }
    return false;
  };

  for (const step of steps) {
    const backEdge = step.on_fail;
    if (!backEdge) {
      continue;
    }

    if (backEdge.goto === step.name) {
      throw new ParseError("E2003", `Step '${step.name}': self-loop is not allowed for on_fail.goto`);
    }

    if (!stepNames.has(backEdge.goto)) {
      throw new DependencyError("E3002", `Step '${step.name}' on_fail.goto references non-existent step '${backEdge.goto}'`);
    }

    if (!canReachDependency(step.name, backEdge.goto)) {
      throw new ParseError(
        "E2003",
        `back-edge target '${backEdge.goto}' must precede source '${step.name}' in dependency graph`,
      );
    }

    const sources = byTarget.get(backEdge.goto) ?? [];
    sources.push(step.name);
    byTarget.set(backEdge.goto, sources);
  }

  for (const [target, sources] of byTarget) {
    if (sources.length >= 3) {
      throw new ParseError("E2003", `Too many back-edges point to '${target}': ${sources.length} (maximum: 2)`);
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

  // Validate optional workflow field types
  if (obj.version !== undefined && typeof obj.version !== "string") {
    throw new ParseError("E2003", "'version' must be a string");
  }

  if (obj.description !== undefined && typeof obj.description !== "string") {
    throw new ParseError("E2003", "'description' must be a string");
  }

  if (obj.policy !== undefined && typeof obj.policy !== "string") {
    throw new ParseError("E2003", "'policy' must be a string");
  }

  // Validate mode if present
  if (obj.mode !== undefined) {
    const validModes: WorkflowMode[] = ["auto", "supervised", "gated", "manual"];
    if (!validModes.includes(obj.mode as WorkflowMode)) {
      throw new ParseError("E2003", `'mode' must be one of: ${validModes.join(", ")}`);
    }
  }

  // Parse steps
  const steps = obj.steps.map((s, i) => parseStep(s, i, options));
  const recovery = parseRecovery(obj.recovery);

  // Validate steps
  checkDuplicateSteps(steps);
  checkSelfDependencies(steps);
  checkMissingDependencies(steps);
  checkCircularDependencies(steps);
  checkOnFailMutualExclusion(steps, recovery);
  checkOnFailBackEdges(steps);
  checkUnresolvedInputs(steps, options);

  return {
    name: obj.name,
    version: obj.version as string | undefined,
    description: obj.description as string | undefined,
    mode: obj.mode as WorkflowMode | undefined,
    config: parseConfig(obj.config, options),
    policy: obj.policy as string | undefined,
    steps,
    recovery,
    audit: parseAudit(obj.audit),
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
