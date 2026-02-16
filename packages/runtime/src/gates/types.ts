import { evaluateExpression } from "../policy/expressions/ExpressionEvaluator.js";
import { parseExpression } from "../policy/expressions/ExpressionParser.js";

export type GateFallback = "fail" | "escalate" | "auto-approve";

export type HITLAuditEventType =
  | "gate_assignment_created"
  | "gate_assignment_reassigned"
  | "gate_assignment_expired"
  | "gate_approval_decision"
  | "gate_sla_warning"
  | "gate_sla_expired";

export interface GateAuditEvent {
  type: HITLAuditEventType;
  payload: Record<string, unknown>;
}

export interface GateRuntimeContext {
  emit?: (event: GateAuditEvent) => Promise<void> | void;
  now?: () => Date;
  conditionContext?: Record<string, unknown>;
}

export function parseDurationToMs(duration?: string): number | undefined {
  if (!duration) {
    return undefined;
  }

  const match = duration.trim().match(/^(\d+)(ms|s|m|h|d)$/);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  const unit = match[2];

  if (unit === "ms") return value;
  if (unit === "s") return value * 1_000;
  if (unit === "m") return value * 60_000;
  if (unit === "h") return value * 3_600_000;
  return value * 86_400_000;
}

/**
 * Evaluate a gate condition expression.
 *
 * @throws {Error} When parsing or evaluation fails. Callers must handle this
 *   as a fail-closed error path (stage failure), not as a skipped stage.
 */
export function evaluateGateCondition(condition: string | undefined, context: Record<string, unknown>): boolean {
  if (!condition) {
    return true;
  }

  const ast = parseExpression(condition);
  return evaluateExpression(ast, {
    action: { type: "step_start", name: "gate-condition" },
    context,
  });
}
