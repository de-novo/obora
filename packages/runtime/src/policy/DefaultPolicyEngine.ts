import path from "node:path";
import type { PolicyAction, PolicyContext, PolicyEngine } from "./PolicyEngine.js";
import { loadPolicyFromYaml } from "./PolicyLoader.js";
import type { PolicyDecision, PolicySet, ToolPolicy } from "./types.js";

function toActionText(action: PolicyAction): string {
  if (typeof action.params === "string") {
    return action.params;
  }
  if (action.params === undefined) {
    return "";
  }

  try {
    return JSON.stringify(action.params);
  } catch {
    return String(action.params);
  }
}

function matchesToolRule(rule: ToolPolicy, action: PolicyAction): boolean {
  if (rule.name !== action.name) {
    return false;
  }

  const when = rule.when;
  if (!when) {
    return true;
  }

  const text = toActionText(action);
  const matches = when.matches ?? [];
  const notMatches = when.not_matches ?? [];

  const includesAnyMatch = matches.length === 0 || matches.some((pattern) => text.includes(pattern));
  const includesNotMatch = notMatches.some((pattern) => text.includes(pattern));

  return includesAnyMatch && !includesNotMatch;
}

export class DefaultPolicyEngine implements PolicyEngine {
  private policyPath?: string;
  private policySet: PolicySet = {};

  async load(pathToPolicy: string): Promise<void> {
    const loaded = await loadPolicyFromYaml(pathToPolicy);
    this.policyPath = pathToPolicy;
    this.policySet = loaded;
  }

  loadInline(policies: PolicySet): void {
    this.policyPath = undefined;
    this.policySet = policies;
  }

  enforce(action: PolicyAction, context: PolicyContext): PolicyDecision {
    if (action.type === "tool_call") {
      for (const rule of this.policySet.tools ?? []) {
        if (!matchesToolRule(rule, action)) {
          continue;
        }

        if (rule.effect === "allow") {
          return { type: "allow" };
        }

        if (rule.effect === "deny") {
          return {
            type: "deny",
            reason: `Tool call denied for ${action.name}`,
            rule: `tools.${rule.name}`,
          };
        }

        if (rule.effect === "gate") {
          return {
            type: "gate",
            gateType: "human-approval",
            config: { tool: action.name, rule: `tools.${rule.name}` },
          };
        }

        return {
          type: "transform",
          original: action.params,
          transformed: action.params,
        };
      }
    }

    if (action.type === "file_access" && this.policySet.sandbox) {
      const filePath = (action.params as { path?: string } | undefined)?.path;
      if (filePath) {
        const root = path.resolve(this.policySet.sandbox.root);
        const resolvedPath = path.resolve(filePath);

        if (this.policySet.sandbox.denyOutsideRoot && !resolvedPath.startsWith(root)) {
          return {
            type: "deny",
            reason: `File path outside sandbox root: ${filePath}`,
            rule: "sandbox.denyOutsideRoot",
          };
        }

        for (const pattern of this.policySet.sandbox.denyPatterns ?? []) {
          if (resolvedPath.includes(pattern)) {
            return {
              type: "deny",
              reason: `File path blocked by sandbox pattern: ${pattern}`,
              rule: "sandbox.denyPatterns",
            };
          }
        }
      }
    }

    if (action.type === "step_start") {
      const gate = (this.policySet.gates ?? []).find((policy) => policy.step === action.name && policy.required);
      if (gate) {
        return {
          type: "gate",
          gateType: gate.type,
          config: {
            step: gate.step,
            timeout: gate.timeout,
            fallback: gate.fallback,
          },
        };
      }
    }

    if (action.type === "resource_use" && this.policySet.resources) {
      const resources = this.policySet.resources;

      if (resources.maxTokens !== undefined && (context.currentTokens ?? 0) > resources.maxTokens) {
        return { type: "deny", reason: "Token limit exceeded", rule: "resources.maxTokens" };
      }
      if (resources.maxCostUsd !== undefined && (context.currentCost ?? 0) > resources.maxCostUsd) {
        return { type: "deny", reason: "Cost limit exceeded", rule: "resources.maxCostUsd" };
      }
      if (resources.maxToolCalls !== undefined && (context.currentToolCalls ?? 0) > resources.maxToolCalls) {
        return { type: "deny", reason: "Tool call limit exceeded", rule: "resources.maxToolCalls" };
      }
    }

    return { type: "allow" };
  }

  async reload(): Promise<void> {
    if (!this.policyPath) {
      return;
    }

    const reloaded = await loadPolicyFromYaml(this.policyPath);
    this.policySet = reloaded;
  }

  version(): string {
    return this.policySet.version ?? "unknown";
  }
}
