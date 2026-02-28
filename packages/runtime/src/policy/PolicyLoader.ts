import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import type {
  DynamicQuotaConfig,
  DynamicResourceLimit,
  DynamicToolRule,
  GatePolicy,
  PolicySet,
  ResourcePolicy,
  SandboxPolicy,
  ToolPolicy,
} from "./types.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toStringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`Invalid ${field}: expected string[]`);
  }
  return value;
}

function normalizeToolPolicy(input: unknown, index: number): ToolPolicy {
  if (!isObject(input)) {
    throw new Error(`Invalid tools[${index}]: expected object`);
  }

  const { name, effect, when } = input;
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`Invalid tools[${index}].name: expected non-empty string`);
  }

  if (effect !== "allow" && effect !== "deny" && effect !== "transform" && effect !== "gate") {
    throw new Error(`Invalid tools[${index}].effect: ${String(effect)}`);
  }

  let normalizedWhen: ToolPolicy["when"];
  if (when !== undefined) {
    if (!isObject(when)) {
      throw new Error(`Invalid tools[${index}].when: expected object`);
    }

    if (when.condition !== undefined && typeof when.condition !== "string") {
      throw new Error(`Invalid tools[${index}].when.condition: expected string`);
    }

    normalizedWhen = {
      matches: toStringArray(when.matches, `tools[${index}].when.matches`),
      not_matches: toStringArray(when.not_matches, `tools[${index}].when.not_matches`),
      condition: when.condition,
    };
  }

  const transform = input.transform;
  let normalizedTransform: ToolPolicy["transform"];
  if (transform !== undefined) {
    if (!isObject(transform) || typeof transform.fn !== "string" || transform.fn.length === 0) {
      throw new Error(`Invalid tools[${index}].transform.fn: expected non-empty string`);
    }
    normalizedTransform = { fn: transform.fn };
  }

  const gate = input.gate;
  let normalizedGate: ToolPolicy["gate"];
  if (gate !== undefined) {
    if (!isObject(gate)) {
      throw new Error(`Invalid tools[${index}].gate: expected object`);
    }

    if (gate.type !== "human-approval" && gate.type !== "consensus" && gate.type !== "external") {
      throw new Error(`Invalid tools[${index}].gate.type: ${String(gate.type)}`);
    }

    if (gate.timeout !== undefined && typeof gate.timeout !== "string") {
      throw new Error(`Invalid tools[${index}].gate.timeout: expected string`);
    }

    normalizedGate = {
      type: gate.type,
      timeout: gate.timeout,
    };
  }

  return { name, effect, when: normalizedWhen, transform: normalizedTransform, gate: normalizedGate };
}

function normalizeSandboxPolicy(input: unknown): SandboxPolicy | undefined {
  if (input === undefined) return undefined;
  if (!isObject(input)) {
    throw new Error("Invalid sandbox: expected object");
  }

  const root = input.root;
  const denyOutsideRoot = input.denyOutsideRoot ?? input.deny_outside_root;
  const denyPatterns = input.denyPatterns ?? input.deny_patterns;
  const maxFileSize = input.maxFileSize ?? input.max_file_size;

  if (typeof root !== "string" || root.length === 0) {
    throw new Error("Invalid sandbox.root: expected non-empty string");
  }
  if (typeof denyOutsideRoot !== "boolean") {
    throw new Error("Invalid sandbox.denyOutsideRoot: expected boolean");
  }
  if (denyPatterns !== undefined && (!Array.isArray(denyPatterns) || denyPatterns.some((v) => typeof v !== "string"))) {
    throw new Error("Invalid sandbox.denyPatterns: expected string[]");
  }
  if (maxFileSize !== undefined && typeof maxFileSize !== "string") {
    throw new Error("Invalid sandbox.maxFileSize: expected string");
  }

  return {
    root,
    denyOutsideRoot,
    denyPatterns,
    maxFileSize,
  };
}

function normalizeResourcePolicy(input: unknown): ResourcePolicy | undefined {
  if (input === undefined) return undefined;
  if (!isObject(input)) {
    throw new Error("Invalid resources: expected object");
  }

  const timeoutMs = input.timeoutMs ?? input.timeout_ms;
  const maxTokens = input.maxTokens ?? input.max_tokens;
  const maxCostUsd = input.maxCostUsd ?? input.max_cost_usd;
  const maxToolCalls = input.maxToolCalls ?? input.max_tool_calls;
  const maxOutputSize = input.maxOutputSize ?? input.max_output_size;

  const numericFields: Array<[string, unknown]> = [
    ["resources.timeoutMs", timeoutMs],
    ["resources.maxTokens", maxTokens],
    ["resources.maxCostUsd", maxCostUsd],
    ["resources.maxToolCalls", maxToolCalls],
  ];

  for (const [field, value] of numericFields) {
    if (value !== undefined && typeof value !== "number") {
      throw new Error(`Invalid ${field}: expected number`);
    }
  }
  if (maxOutputSize !== undefined && typeof maxOutputSize !== "string") {
    throw new Error("Invalid resources.maxOutputSize: expected string");
  }

  return {
    timeoutMs,
    maxTokens,
    maxCostUsd,
    maxToolCalls,
    maxOutputSize,
    dynamicQuota: normalizeDynamicQuota(input.dynamicQuota ?? input.dynamic_quota),
  };
}

function normalizeDynamicToolRule(input: unknown, index: number): DynamicToolRule {
  if (!isObject(input)) {
    throw new Error(`Invalid dynamicToolRules[${index}]: expected object`);
  }

  const { name, condition, effect, priority } = input;
  if (typeof name !== "string" || name.length === 0) {
    throw new Error(`Invalid dynamicToolRules[${index}].name: expected non-empty string`);
  }
  if (typeof condition !== "string" || condition.length === 0) {
    throw new Error(`Invalid dynamicToolRules[${index}].condition: expected non-empty string`);
  }
  if (effect !== "allow" && effect !== "deny" && effect !== "transform" && effect !== "gate") {
    throw new Error(`Invalid dynamicToolRules[${index}].effect: ${String(effect)}`);
  }
  if (priority !== undefined && typeof priority !== "number") {
    throw new Error(`Invalid dynamicToolRules[${index}].priority: expected number`);
  }

  const transformFn = input.transformFn;
  if (transformFn !== undefined && (typeof transformFn !== "string" || transformFn.length === 0)) {
    throw new Error(`Invalid dynamicToolRules[${index}].transformFn: expected non-empty string`);
  }

  const gate = input.gate;
  let normalizedGate: DynamicToolRule["gate"];
  if (gate !== undefined) {
    if (!isObject(gate)) {
      throw new Error(`Invalid dynamicToolRules[${index}].gate: expected object`);
    }
    if (gate.type !== "human-approval" && gate.type !== "consensus" && gate.type !== "external") {
      throw new Error(`Invalid dynamicToolRules[${index}].gate.type: ${String(gate.type)}`);
    }
    if (gate.timeout !== undefined && typeof gate.timeout !== "string") {
      throw new Error(`Invalid dynamicToolRules[${index}].gate.timeout: expected string`);
    }
    normalizedGate = { type: gate.type, timeout: gate.timeout };
  }

  return { name, condition, effect, priority, transformFn, gate: normalizedGate };
}

function normalizeDynamicQuota(input: unknown): DynamicQuotaConfig | undefined {
  if (input === undefined) {
    return undefined;
  }
  if (!isObject(input)) {
    throw new Error("Invalid resources.dynamicQuota: expected object");
  }

  const limits = input.limits;
  if (!Array.isArray(limits)) {
    throw new Error("Invalid resources.dynamicQuota.limits: expected array");
  }

  const normalizedLimits: DynamicResourceLimit[] = limits.map((limit, index) => {
    if (!isObject(limit)) {
      throw new Error(`Invalid resources.dynamicQuota.limits[${index}]: expected object`);
    }

    const { field, condition, action, limit: limitValue } = limit;
    if (field !== "tokens" && field !== "cost" && field !== "tool_calls" && field !== "duration_ms") {
      throw new Error(`Invalid resources.dynamicQuota.limits[${index}].field: ${String(field)}`);
    }
    if (typeof condition !== "string" || condition.length === 0) {
      throw new Error(`Invalid resources.dynamicQuota.limits[${index}].condition: expected non-empty string`);
    }
    if (typeof limitValue !== "number") {
      throw new Error(`Invalid resources.dynamicQuota.limits[${index}].limit: expected number`);
    }
    if (action !== "deny" && action !== "warn" && action !== "gate") {
      throw new Error(`Invalid resources.dynamicQuota.limits[${index}].action: ${String(action)}`);
    }

    return {
      field,
      condition,
      limit: limitValue,
      action,
    };
  });

  return { limits: normalizedLimits };
}

function normalizeGatePolicy(input: unknown, index: number): GatePolicy {
  if (!isObject(input)) {
    throw new Error(`Invalid gates[${index}]: expected object`);
  }

  const { step, type, required, timeout, fallback } = input;
  if (typeof step !== "string" || step.length === 0) {
    throw new Error(`Invalid gates[${index}].step: expected non-empty string`);
  }
  if (type !== "human-approval" && type !== "consensus" && type !== "external") {
    throw new Error(`Invalid gates[${index}].type: ${String(type)}`);
  }
  if (typeof required !== "boolean") {
    throw new Error(`Invalid gates[${index}].required: expected boolean`);
  }
  if (timeout !== undefined && typeof timeout !== "string") {
    throw new Error(`Invalid gates[${index}].timeout: expected string`);
  }
  if (
    fallback !== undefined
    && fallback !== "fail"
    && fallback !== "escalate"
    && fallback !== "auto-approve"
  ) {
    throw new Error(`Invalid gates[${index}].fallback: ${String(fallback)}`);
  }

  return { step, type, required, timeout, fallback };
}

export function normalizePolicySet(input: unknown): PolicySet {
  if (!isObject(input)) {
    throw new Error("Invalid policy YAML: expected object");
  }

  const toolsRaw = input.tools;
  const gatesRaw = input.gates;
  const dynamicToolRulesRaw = input.dynamicToolRules ?? input.dynamic_tool_rules;

  if (toolsRaw !== undefined && !Array.isArray(toolsRaw)) {
    throw new Error("Invalid tools: expected array");
  }
  if (gatesRaw !== undefined && !Array.isArray(gatesRaw)) {
    throw new Error("Invalid gates: expected array");
  }
  if (dynamicToolRulesRaw !== undefined && !Array.isArray(dynamicToolRulesRaw)) {
    throw new Error("Invalid dynamicToolRules: expected array");
  }

  const policySet: PolicySet = {
    version: typeof input.version === "string" ? input.version : undefined,
    tools: toolsRaw?.map((tool, index) => normalizeToolPolicy(tool, index)),
    dynamicToolRules: dynamicToolRulesRaw?.map((rule, index) => normalizeDynamicToolRule(rule, index)),
    sandbox: normalizeSandboxPolicy(input.sandbox),
    resources: normalizeResourcePolicy(input.resources),
    gates: gatesRaw?.map((gate, index) => normalizeGatePolicy(gate, index)),
  };

  return policySet;
}

export async function loadPolicyFromYaml(path: string): Promise<PolicySet> {
  const content = await readFile(path, "utf-8");
  const parsed = parse(content);
  return normalizePolicySet(parsed);
}
