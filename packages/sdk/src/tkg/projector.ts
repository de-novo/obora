import { randomUUID } from "node:crypto";

import type { EventBus } from "../events/event-bus.js";
import type { AuditEvent, Unsubscribe } from "../runtime-types.js";
import type { MemoryScope } from "../shared-memory/store.js";
import {
  PROJECTABLE_TKG_EVENT_TYPES,
  type ProjectableTKGEventType,
  type StagingTKGStore,
  type TemporalNode,
  type TemporalNodeRelation,
} from "./store.js";

export interface TKGProjectorOptions {
  workflowName: string;
  scopes: MemoryScope[];
}

export interface TKGProjectionSummary {
  projectedNodeCount: number;
  projectedScopes: string[];
  eventTypes: ProjectableTKGEventType[];
}

export function projectAuditEventToTemporalNode(
  event: AuditEvent & { type: ProjectableTKGEventType },
  workflowName: string,
): TemporalNode {
  const data = (event.data ?? {}) as Record<string, unknown>;
  const stepName = typeof data.stepName === "string" ? data.stepName : undefined;
  const relations: TemporalNodeRelation[] = [
    { type: "workflow", target: workflowName },
    { type: "execution", target: event.executionId },
  ];
  let summary: string = event.type;

  switch (event.type) {
    case "workflow.validation_failed": {
      summary = `Validation failed${stepName ? ` for ${stepName}` : ""}: ${String(data.summary ?? "validation failed")}`;
      if (stepName) relations.push({ type: "step", target: stepName });
      break;
    }
    case "workflow.validation_passed": {
      summary = `Validation passed${stepName ? ` for ${stepName}` : ""}: ${String(data.summary ?? "validation passed")}`;
      if (stepName) relations.push({ type: "step", target: stepName });
      break;
    }
    case "workflow.back_edge_triggered": {
      const sourceStep = String(data.sourceStep ?? "");
      const targetStep = String(data.targetStep ?? "");
      summary = `Back-edge triggered: ${sourceStep} -> ${targetStep}`;
      if (sourceStep) relations.push({ type: "source_step", target: sourceStep });
      if (targetStep) relations.push({ type: "target_step", target: targetStep });
      break;
    }
    case "workflow.repair_started": {
      summary = `Repair started${stepName ? ` for ${stepName}` : ""} (attempt ${String(data.attempt ?? "?")})`;
      if (stepName) relations.push({ type: "step", target: stepName });
      break;
    }
    case "workflow.repair_completed": {
      summary = `Repair completed${stepName ? ` for ${stepName}` : ""} (attempt ${String(data.attempt ?? "?")})`;
      if (stepName) relations.push({ type: "step", target: stepName });
      break;
    }
  }

  return {
    id: randomUUID(),
    eventType: event.type,
    executionId: event.executionId,
    workflowName,
    ...(stepName ? { stepName } : {}),
    timestamp: event.timestamp.toISOString(),
    summary,
    attributes: { ...data },
    relations,
  };
}

export class TKGProjector {
  private readonly unsubscribes: Unsubscribe[] = [];
  private readonly projectedNodes: TemporalNode[] = [];
  private readonly lastNodeIdByStep = new Map<string, string>();
  private readonly lastValidationFailureNodeIdByStep = new Map<string, string>();
  private readonly lastRepairStartedNodeIdByStep = new Map<string, string>();
  private lastValidationFailureNodeId?: string;

  constructor(
    private readonly eventBus: EventBus,
    private readonly store: StagingTKGStore,
    private readonly options: TKGProjectorOptions,
  ) {}

  observe(executionId: string): void {
    for (const eventType of PROJECTABLE_TKG_EVENT_TYPES) {
      const unsub = this.eventBus.on(eventType, async (event) => {
        if (event.executionId !== executionId) return;
        const node = projectAuditEventToTemporalNode(event, this.options.workflowName);
        this.enrichNodeRelations(node, event);
        await this.persistNode(node);
      });
      this.unsubscribes.push(unsub);
    }
  }

  getSummary(): TKGProjectionSummary {
    return {
      projectedNodeCount: this.projectedNodes.length,
      projectedScopes: this.options.scopes.map((scope) => `${scope.level}:${scope.key}`),
      eventTypes: [...new Set(this.projectedNodes.map((node) => node.eventType))],
    };
  }

  dispose(): void {
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes.length = 0;
  }

  private enrichNodeRelations(
    node: TemporalNode,
    event: AuditEvent & { type: ProjectableTKGEventType },
  ): void {
    const stepName = node.stepName;
    if (stepName) {
      const previousNodeId = this.lastNodeIdByStep.get(stepName);
      if (previousNodeId) {
        node.relations.push({ type: "follows", target: previousNodeId });
      }
    }

    const data = (event.data ?? {}) as Record<string, unknown>;

    switch (node.eventType) {
      case "workflow.validation_failed": {
        if (stepName) {
          this.lastValidationFailureNodeIdByStep.set(stepName, node.id);
        }
        this.lastValidationFailureNodeId = node.id;
        break;
      }
      case "workflow.validation_passed": {
        if (stepName) {
          const previousFailureNodeId = this.lastValidationFailureNodeIdByStep.get(stepName);
          if (previousFailureNodeId) {
            node.relations.push({ type: "resolves", target: previousFailureNodeId });
            this.lastValidationFailureNodeIdByStep.delete(stepName);
          }
        }
        break;
      }
      case "workflow.back_edge_triggered": {
        const sourceStep = typeof data.sourceStep === "string" ? data.sourceStep : undefined;
        const targetStep = typeof data.targetStep === "string" ? data.targetStep : undefined;

        if (sourceStep) {
          const sourceNodeId = this.lastNodeIdByStep.get(sourceStep);
          if (sourceNodeId) {
            node.relations.push({ type: "triggered_by", target: sourceNodeId });
          }
        }

        if (targetStep) {
          const targetNodeId = this.lastNodeIdByStep.get(targetStep);
          if (targetNodeId) {
            node.relations.push({ type: "returns_to", target: targetNodeId });
          }
        }
        break;
      }
      case "workflow.repair_started": {
        if (this.lastValidationFailureNodeId) {
          node.relations.push({ type: "caused_by", target: this.lastValidationFailureNodeId });
        }
        if (stepName) {
          this.lastRepairStartedNodeIdByStep.set(stepName, node.id);
        }
        break;
      }
      case "workflow.repair_completed": {
        if (stepName) {
          const repairStartedNodeId = this.lastRepairStartedNodeIdByStep.get(stepName);
          if (repairStartedNodeId) {
            node.relations.push({ type: "completes", target: repairStartedNodeId });
            this.lastRepairStartedNodeIdByStep.delete(stepName);
          }
        }
        break;
      }
    }

    if (stepName) {
      this.lastNodeIdByStep.set(stepName, node.id);
    }
  }

  private async persistNode(node: TemporalNode): Promise<void> {
    this.projectedNodes.push(node);

    for (const scope of this.options.scopes) {
      if (typeof this.store.append === "function") {
        await this.store.append(scope, [node]);
        continue;
      }

      const existing = await this.store.load(scope);
      await this.store.save(scope, {
        nodes: [...(existing?.nodes ?? []), node],
      });
    }
  }
}
