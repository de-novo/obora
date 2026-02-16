import type { GateAssignment } from "./GateAssignment.js";
import { parseDurationToMs, type GateFallback, type GateRuntimeContext } from "./types.js";

export interface SLAConfig {
  timeout: string;
  warning_at?: string;
  fallback: GateFallback;
  escalation_chain?: string[];
}

export interface SLACheckResult {
  status: "ok" | "warning" | "expired";
  remainingMs?: number;
  action?: "none" | "warn" | "escalate" | "auto-approve" | "fail";
  escalationTarget?: string;
}

export class SLAManager {
  constructor(private readonly context: GateRuntimeContext = {}) {}

  checkSLA(assignment: GateAssignment, config: SLAConfig): SLACheckResult {
    const now = this.now();
    const timeoutMs = parseDurationToMs(config.timeout);
    if (timeoutMs === undefined) {
      return { status: "ok", action: "none" };
    }

    const deadline = assignment.expiresAt ?? new Date(assignment.assignedAt.getTime() + timeoutMs);
    const remainingMs = deadline.getTime() - now.getTime();

    if (remainingMs <= 0) {
      const expired = this.resolveExpired(config);
      void this.context.emit?.({
        type: "gate_sla_expired",
        payload: {
          gateId: assignment.gateId,
          stepName: assignment.stepName,
          assignedTo: assignment.assignedTo,
          fallback: config.fallback,
          escalationTarget: expired.escalationTarget,
        },
      });
      return {
        status: "expired",
        remainingMs: 0,
        action: expired.action,
        escalationTarget: expired.escalationTarget,
      };
    }

    const warningMs = parseDurationToMs(config.warning_at);
    if (warningMs !== undefined && remainingMs <= warningMs) {
      void this.context.emit?.({
        type: "gate_sla_warning",
        payload: {
          gateId: assignment.gateId,
          stepName: assignment.stepName,
          assignedTo: assignment.assignedTo,
          remainingMs,
        },
      });
      return { status: "warning", remainingMs, action: "warn" };
    }

    return { status: "ok", remainingMs, action: "none" };
  }

  private resolveExpired(config: SLAConfig): { action: "escalate" | "auto-approve" | "fail"; escalationTarget?: string } {
    if (config.fallback === "escalate") {
      return {
        action: "escalate",
        escalationTarget: config.escalation_chain?.[0],
      };
    }

    if (config.fallback === "auto-approve") {
      return { action: "auto-approve" };
    }

    return { action: "fail" };
  }

  private now(): Date {
    return this.context.now ? this.context.now() : new Date();
  }
}
