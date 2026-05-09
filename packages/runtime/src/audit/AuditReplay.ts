import type { AuditEvent, AuditEventType } from "./types.js";
import type { StorageAdapter, StructuredAuditEvent } from "../storage/types.js";

const categoryFromType = (type: AuditEventType): StructuredAuditEvent["category"] => {
  if (type.startsWith("consensus_")) return "consensus";
  if (type.startsWith("policy_") || type.startsWith("gate_")) return "policy";
  if (type.startsWith("recovery_") || type.startsWith("snapshot_") || type === "reexecution_start" || type === "reexecution_step_start" || type === "reexecution_step_end" || type === "reexecution_end") {
    return "recovery";
  }
  return "execution";
};

const voteFromData = (data: unknown): StructuredAuditEvent["vote"] | undefined => {
  if (!data || typeof data !== "object") return undefined;
  const record = data as Record<string, unknown>;
  const vote = (record.vote ?? record) as Record<string, unknown>;

  if (typeof vote.approved === "boolean") {
    return {
      decision: vote.approved ? "approve" : "reject",
      confidence: typeof vote.score === "number" ? vote.score : undefined,
      reasoning: typeof vote.reasoning === "string" ? vote.reasoning : undefined,
    };
  }

  if (typeof vote.decision === "string" && ["approve", "reject", "abstain"].includes(vote.decision)) {
    return {
      decision: vote.decision as "approve" | "reject" | "abstain",
      confidence: typeof vote.confidence === "number" ? vote.confidence : undefined,
      reasoning: typeof vote.reasoning === "string" ? vote.reasoning : undefined,
    };
  }

  return undefined;
};

const inferActor = (data: unknown): string => {
  if (!data || typeof data !== "object") return "system";
  const record = data as Record<string, unknown>;
  const candidates = [record.actor, record.agent, record.voterId, (record.vote as Record<string, unknown> | undefined)?.voterId];
  return candidates.find((v): v is string => typeof v === "string" && v.length > 0) ?? "system";
};

const inferStepName = (data: unknown): string => {
  if (!data || typeof data !== "object") return "runtime";
  const record = data as Record<string, unknown>;
  return typeof record.stepName === "string" && record.stepName.length > 0 ? record.stepName : "runtime";
};

export function toStructuredAuditEvent(runId: string, event: AuditEvent): StructuredAuditEvent {
  const detail = (event.data && typeof event.data === "object") ? (event.data as Record<string, unknown>) : { value: event.data };
  const detailAction = typeof detail.action === "string" ? detail.action : undefined;
  return {
    id: event.id,
    runId,
    stepName: inferStepName(event.data),
    timestamp: event.timestamp.toISOString(),
    category: categoryFromType(event.type),
    action: detailAction ?? event.type,
    actor: inferActor(event.data),
    detail,
    vote: voteFromData(event.data),
  };
}

export async function persistStructuredAuditEvent(adapter: StorageAdapter | undefined, runId: string, event: AuditEvent): Promise<void> {
  if (!adapter) return;
  const save = (adapter as Partial<StorageAdapter>).saveAuditEvent;
  if (typeof save !== "function") return;
  await save.call(adapter, toStructuredAuditEvent(runId, event));
}
