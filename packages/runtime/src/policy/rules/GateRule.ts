import type { PolicyAction, PolicyContext, PolicyDecision, PolicyRulePlugin, PolicySet } from "../types.js";

export class GateRule implements PolicyRulePlugin {
  readonly name = "gate";
  readonly version = "1.0.0";
  readonly type = "policy-rule" as const;

  evaluate(action: PolicyAction, _context: PolicyContext, policies: PolicySet): PolicyDecision | null {
    if (action.type !== "step_start") {
      return null;
    }

    const gate = (policies.gates ?? []).find((policy) => policy.step === action.name && policy.required);
    if (!gate) {
      return null;
    }

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
