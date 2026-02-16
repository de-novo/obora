import type { AuditEvent } from "../audit/types.js";
import type { DynamicPolicyVars } from "./types.js";

export interface BuildDynamicPolicyVarsParams {
  executionId: string;
  workflowName: string;
  startedAt: Date;
  stepName: string;
  stepAgent: string;
  stepIndex: number;
  stepConfig?: Record<string, unknown>;
  actorId: string;
  actorRole?: string;
  state: Record<string, unknown>;
  auditEvents: AuditEvent[];
  completedSteps: string[];
  previousResults: Record<string, { success: boolean; output?: unknown }>;
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function buildDynamicPolicyVars(params: BuildDynamicPolicyVarsParams): DynamicPolicyVars {
  const now = Date.now();
  const durations = params.auditEvents
    .map((event) => toNumber(event.metadata?.durationMs))
    .filter((duration) => duration > 0);

  const errorCount = params.auditEvents.filter((event) => event.type === "error").length;
  const retryCount = params.auditEvents.filter((event) => event.type === "recovery_start").length;

  const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
  const avgStepDurationMs = durations.length === 0 ? 0 : totalDuration / durations.length;
  const maxStepDurationMs = durations.length === 0 ? 0 : Math.max(...durations);

  const totalTokens = params.auditEvents.reduce((sum, event) => sum + toNumber(event.metadata?.tokens), 0);
  const totalCost = params.auditEvents.reduce((sum, event) => sum + toNumber(event.metadata?.costUsd), 0);
  const totalToolCalls = params.auditEvents.filter((event) => event.type === "tool_call").length;

  return {
    execution: {
      id: params.executionId,
      workflowName: params.workflowName,
      startedAt: params.startedAt,
      elapsedMs: Math.max(0, now - params.startedAt.getTime()),
      totalTokens,
      totalCost,
      totalToolCalls,
      completedSteps: [...params.completedSteps],
    },
    step: {
      name: params.stepName,
      agent: params.stepAgent,
      index: params.stepIndex,
      config: params.stepConfig,
    },
    actor: {
      id: params.actorId,
      role: params.actorRole,
    },
    state: { ...params.state },
    metrics: {
      errorCount,
      retryCount,
      avgStepDurationMs,
      maxStepDurationMs,
    },
    previousResults: structuredClone(params.previousResults),
  };
}
