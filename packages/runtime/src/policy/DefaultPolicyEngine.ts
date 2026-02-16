import type { PolicyEngine } from "./PolicyEngine.js";
import { loadPolicyFromYaml } from "./PolicyLoader.js";
import { GateRule, ResourceRule, SandboxRule, ToolRule } from "./rules/index.js";
import type { PolicyAction, PolicyContext, PolicyDecision, PolicyRulePlugin, PolicySet } from "./types.js";

const DEFAULT_RULE_ORDER: PolicyRulePlugin[] = [new ToolRule(), new SandboxRule(), new ResourceRule(), new GateRule()];

export class DefaultPolicyEngine implements PolicyEngine {
  private policyPath?: string;
  private policySet: PolicySet = {};
  private readonly rules: readonly PolicyRulePlugin[];

  constructor(rules: readonly PolicyRulePlugin[] = DEFAULT_RULE_ORDER) {
    this.rules = rules;
  }

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
    for (const rule of this.rules) {
      const decision = rule.evaluate(action, context, this.policySet);
      if (decision) {
        return decision;
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
