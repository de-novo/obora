import { parseDurationToMs, type GateRuntimeContext } from "./types.js";

export interface GateAssignment {
  gateId: string;
  stepName: string;
  assignedTo: string;
  assignedAt: Date;
  expiresAt?: Date;
  status: "pending" | "completed" | "expired" | "reassigned";
  reassignedFrom?: string;
  reassignmentReason?: string;
}

export class GateAssignmentManager {
  private readonly assignments = new Map<string, GateAssignment>();

  constructor(private readonly context: GateRuntimeContext = {}) {}

  assign(gateId: string, stepName: string, assignee: string, timeout?: string): GateAssignment {
    const assignedAt = this.now();
    const timeoutMs = parseDurationToMs(timeout);
    const assignment: GateAssignment = {
      gateId,
      stepName,
      assignedTo: assignee,
      assignedAt,
      expiresAt: timeoutMs !== undefined ? new Date(assignedAt.getTime() + timeoutMs) : undefined,
      status: "pending",
    };

    this.assignments.set(gateId, assignment);
    void this.context.emit?.({
      type: "gate_assignment_created",
      payload: {
        gateId,
        stepName,
        assignedTo: assignee,
        assignedAt: assignedAt.toISOString(),
        expiresAt: assignment.expiresAt?.toISOString(),
      },
    });

    return structuredClone(assignment);
  }

  reassign(gateId: string, newAssignee: string, reason: string): GateAssignment {
    const current = this.assignments.get(gateId);
    if (!current) {
      throw new Error(`Gate assignment not found: ${gateId}`);
    }

    current.status = "reassigned";
    this.assignments.set(gateId, current);

    const reassigned: GateAssignment = {
      ...current,
      assignedTo: newAssignee,
      assignedAt: this.now(),
      status: "pending",
      reassignedFrom: current.assignedTo,
      reassignmentReason: reason,
    };

    this.assignments.set(gateId, reassigned);
    void this.context.emit?.({
      type: "gate_assignment_reassigned",
      payload: {
        gateId,
        stepName: reassigned.stepName,
        from: reassigned.reassignedFrom,
        to: newAssignee,
        reason,
      },
    });

    return structuredClone(reassigned);
  }

  expire(gateId: string): GateAssignment {
    const current = this.assignments.get(gateId);
    if (!current) {
      throw new Error(`Gate assignment not found: ${gateId}`);
    }

    const expired: GateAssignment = {
      ...current,
      status: "expired",
    };
    this.assignments.set(gateId, expired);

    void this.context.emit?.({
      type: "gate_assignment_expired",
      payload: {
        gateId,
        stepName: expired.stepName,
        assignedTo: expired.assignedTo,
        expiredAt: this.now().toISOString(),
      },
    });

    return structuredClone(expired);
  }

  getAssignment(gateId: string): GateAssignment | undefined {
    const assignment = this.assignments.get(gateId);
    return assignment ? structuredClone(assignment) : undefined;
  }

  getActiveAssignments(): GateAssignment[] {
    return [...this.assignments.values()]
      .filter((assignment) => assignment.status === "pending")
      .map((assignment) => structuredClone(assignment));
  }

  private now(): Date {
    return this.context.now ? this.context.now() : new Date();
  }
}
