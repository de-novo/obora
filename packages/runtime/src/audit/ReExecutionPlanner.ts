import type { AuditTrail } from "./AuditTrail.js";
import type { AuditEvent } from "./types.js";

export interface ReExecutionPlan {
  executionId: string;
  originalWorkflow: string;
  workflowVersion?: string;
  snapshotRef?: string;
  mode: "full" | "from_checkpoint";
  startFromStep?: string;
  restoredState?: Record<string, unknown>;
  stepsToRerun: string[];
  stepsToSkip: string[];
  nonDeterminismWarnings: NonDeterminismWarning[];
  createdAt: Date;
}

export interface NonDeterminismWarning {
  type: "model_change" | "time_drift" | "policy_change" | "state_external" | "tool_output";
  description: string;
  stepName?: string;
  severity: "info" | "warning" | "critical";
}

export interface ReExecutionPlannerOptions {
  mode: "full" | "from_checkpoint";
  checkpointStep?: string;
  detectNonDeterminism?: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getStepName(event: AuditEvent): string | undefined {
  if (!isObject(event.data)) {
    return undefined;
  }

  return asString(event.data.stepName);
}

function getWorkflowName(events: AuditEvent[]): string {
  const executionStart = events.find((event) => event.type === "execution_start");
  if (!executionStart || !isObject(executionStart.data)) {
    return "unknown";
  }

  const workflowName = asString(executionStart.data.workflowName);
  return workflowName ?? "unknown";
}

function getWorkflowVersion(events: AuditEvent[]): string | undefined {
  const executionStart = events.find((event) => event.type === "execution_start");
  if (!executionStart || !isObject(executionStart.data)) {
    return undefined;
  }
  return asString(executionStart.data.workflowVersion) ?? asString(executionStart.data.contractVersion);
}

function getSnapshotRef(events: AuditEvent[], mode: "full" | "from_checkpoint", checkpointStep?: string): string | undefined {
  if (mode === "from_checkpoint" && checkpointStep) {
    // Prefer snapshot events whose stepName or checkpointStep matches the checkpoint
    let fallbackRef: string | undefined;
    for (const event of events) {
      if ((event.type === "snapshot_create" || event.type === "snapshot_restore") && isObject(event.data)) {
        const ref = asString(event.data.snapshotId) ?? asString(event.data.snapshotRef);
        if (!ref) continue;
        const eventStep = asString(event.data.stepName) ?? asString(event.data.checkpointStep);
        if (eventStep === checkpointStep) return ref;
        if (!fallbackRef) fallbackRef = ref;
      }
    }
    if (fallbackRef) return fallbackRef;
  } else if (mode === "from_checkpoint") {
    // No checkpointStep specified, pick first snapshot
    for (const event of events) {
      if ((event.type === "snapshot_create" || event.type === "snapshot_restore") && isObject(event.data)) {
        const ref = asString(event.data.snapshotId) ?? asString(event.data.snapshotRef);
        if (ref) return ref;
      }
    }
  }
  // Fallback: check execution_start for a snapshotRef
  const executionStart = events.find((event) => event.type === "execution_start");
  if (executionStart && isObject(executionStart.data)) {
    return asString(executionStart.data.snapshotRef) ?? asString(executionStart.data.snapshotId);
  }
  return undefined;
}

function getStepOrder(events: AuditEvent[]): string[] {
  const executionStart = events.find((event) => event.type === "execution_start");
  if (executionStart && isObject(executionStart.data) && Array.isArray(executionStart.data.stepOrder)) {
    const fromStart = executionStart.data.stepOrder.filter((v): v is string => typeof v === "string");
    if (fromStart.length > 0) {
      return [...new Set(fromStart)];
    }
  }

  const seen = new Set<string>();
  const order: string[] = [];
  for (const event of events) {
    if (event.type !== "step_start") {
      continue;
    }
    const stepName = getStepName(event);
    if (!stepName || seen.has(stepName)) {
      continue;
    }
    seen.add(stepName);
    order.push(stepName);
  }
  return order;
}

function reconstructStateAtCheckpoint(events: AuditEvent[], checkpointStep: string): Record<string, unknown> {
  const state: Record<string, unknown> = {};

  for (const event of events) {
    if (event.type === "step_start" && getStepName(event) === checkpointStep) {
      break;
    }

    if (event.type !== "state_change" || !isObject(event.data)) {
      continue;
    }

    const path = asString(event.data.path);
    if (!path) {
      continue;
    }

    state[path] = event.data.newValue;
  }

  return state;
}

function detectNonDeterminismWarnings(events: AuditEvent[]): NonDeterminismWarning[] {
  const warnings: NonDeterminismWarning[] = [];

  const models = new Set<string>();
  for (const event of events) {
    if (event.metadata?.model) {
      models.add(event.metadata.model);
    }

    if (event.type === "llm_request" || event.type === "llm_response") {
      if (isObject(event.data) && asString(event.data.model)) {
        models.add(asString(event.data.model)!);
      }
    }
  }

  const currentModel = process.env.OBORA_MODEL ?? process.env.MODEL;
  if (currentModel && models.size > 0 && !models.has(currentModel)) {
    warnings.push({
      type: "model_change",
      severity: "warning",
      description: `Original execution used model(s): ${[...models].join(", ")}, current model is '${currentModel}'.`,
    });
  }

  const startedAt = events.find((event) => event.type === "execution_start")?.timestamp;
  if (startedAt) {
    const driftMs = Date.now() - startedAt.getTime();
    if (driftMs > 24 * 60 * 60 * 1000) {
      warnings.push({
        type: "time_drift",
        severity: "warning",
        description: `Original execution started ${Math.floor(driftMs / (60 * 60 * 1000))}h ago; re-execution may diverge.`,
      });
    }
  }

  const policyVersions = new Set<string>();
  for (const event of events) {
    if (!isObject(event.data)) {
      continue;
    }

    if (event.type === "execution_start") {
      const policyVersion = asString(event.data.policyVersion);
      if (policyVersion) {
        policyVersions.add(policyVersion);
      }
    }

    if (event.type === "policy_check") {
      const policyVersion = asString(event.data.policyVersion);
      if (policyVersion) {
        policyVersions.add(policyVersion);
      }
    }
  }

  const currentPolicyVersion = process.env.OBORA_POLICY_VERSION;
  if (currentPolicyVersion && policyVersions.size > 0 && !policyVersions.has(currentPolicyVersion)) {
    warnings.push({
      type: "policy_change",
      severity: "warning",
      description: `Original execution used policy version(s): ${[...policyVersions].join(", ")}, current policy is '${currentPolicyVersion}'.`,
    });
  }

  for (const event of events) {
    if (event.type === "state_change" && isObject(event.data)) {
      const path = asString(event.data.path);
      if (path && (path.startsWith("external.") || path.includes("api") || path.includes("cache"))) {
        warnings.push({
          type: "state_external",
          severity: "info",
          stepName: getStepName(event),
          description: `State path '${path}' may depend on mutable external systems.`,
        });
      }
    }

    if ((event.type === "tool_call" || event.type === "tool_result") && isObject(event.data)) {
      const toolName = asString(event.data.toolName)?.toLowerCase();
      if (toolName && ["date_now", "clock", "time", "random", "uuid"].some((token) => toolName.includes(token))) {
        warnings.push({
          type: "tool_output",
          severity: "warning",
          stepName: getStepName(event),
          description: `Tool '${toolName}' may produce time-dependent or random output.`,
        });
      }
    }
  }

  return warnings;
}

export class ReExecutionPlanner {
  constructor(private readonly auditTrail: AuditTrail) {}

  async createPlan(executionId: string, options: ReExecutionPlannerOptions): Promise<ReExecutionPlan> {
    const events = await this.auditTrail.query({ executionId });

    if (events.length === 0) {
      throw new Error(`No audit events found for execution: ${executionId}`);
    }

    if (!events.some((event) => event.type === "execution_start")) {
      throw new Error(`Invalid audit log for execution '${executionId}': missing execution_start event`);
    }

    const originalWorkflow = getWorkflowName(events);
    const stepOrder = getStepOrder(events);
    if (stepOrder.length === 0) {
      throw new Error(`Execution '${executionId}' has no step sequence in audit events`);
    }

    const detectNonDeterminism = options.detectNonDeterminism ?? true;

    const workflowVersion = getWorkflowVersion(events);
    const snapshotRef = getSnapshotRef(events, options.mode, options.checkpointStep);

    if (options.mode === "full") {
      return {
        executionId,
        originalWorkflow,
        ...(workflowVersion ? { workflowVersion } : {}),
        ...(snapshotRef ? { snapshotRef } : {}),
        mode: "full",
        stepsToRerun: stepOrder,
        stepsToSkip: [],
        nonDeterminismWarnings: detectNonDeterminism ? detectNonDeterminismWarnings(events) : [],
        createdAt: new Date(),
      };
    }

    if (!options.checkpointStep) {
      throw new Error("checkpointStep is required when mode is 'from_checkpoint'");
    }

    const checkpointIndex = stepOrder.indexOf(options.checkpointStep);
    if (checkpointIndex < 0) {
      throw new Error(`Checkpoint step not found: ${options.checkpointStep}`);
    }

    const stepsToSkip = stepOrder.slice(0, checkpointIndex);
    const stepsToRerun = stepOrder.slice(checkpointIndex);
    const restoredState = reconstructStateAtCheckpoint(events, options.checkpointStep);

    return {
      executionId,
      originalWorkflow,
      ...(workflowVersion ? { workflowVersion } : {}),
      ...(snapshotRef ? { snapshotRef } : {}),
      mode: "from_checkpoint",
      startFromStep: options.checkpointStep,
      restoredState,
      stepsToRerun,
      stepsToSkip,
      nonDeterminismWarnings: detectNonDeterminism ? detectNonDeterminismWarnings(events) : [],
      createdAt: new Date(),
    };
  }
}
