import { ReflectorEngine } from "../reflector/reflector-engine.js";
import { OboraError, type OboraRuntimeConfig } from "../runtime-types.js";
import type { RepairContext } from "../validation-repair.js";

interface ReflectorRepairActionOptions {
  reflector: unknown;
  config: OboraRuntimeConfig;
  repairContext: RepairContext;
  validationStepName?: string;
  stepIndexByName: ReadonlyMap<string, number>;
  forcedRouteTargets: Map<string, string>;
}

interface PendingReflectorAction {
  type: string;
  payload: Record<string, unknown>;
}

function getPendingReflectorAction(metadata: unknown): PendingReflectorAction | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }

  const pendingAction = (metadata as { pendingAction?: unknown }).pendingAction;
  if (!pendingAction || typeof pendingAction !== "object") {
    return undefined;
  }

  const action = pendingAction as { type?: unknown; payload?: unknown };
  if (typeof action.type !== "string") {
    return undefined;
  }

  return {
    type: action.type,
    payload:
      action.payload && typeof action.payload === "object"
        ? (action.payload as Record<string, unknown>)
        : {},
  };
}

export function applyReflectorRepairActions({
  reflector,
  config,
  repairContext,
  validationStepName,
  stepIndexByName,
  forcedRouteTargets,
}: ReflectorRepairActionOptions): void {
  if (!(reflector instanceof ReflectorEngine)) {
    return;
  }

  const lastOutput = reflector.getLastOutput();
  if (!lastOutput) {
    return;
  }

  for (const actionResult of lastOutput.actions) {
    const pending = getPendingReflectorAction(actionResult.metadata);
    if (!pending) {
      continue;
    }

    if (pending.type === "abort") {
      const reason = String(pending.payload.reason ?? "Reflector abort action triggered");
      config.logger?.warn?.(`[reflector] ABORT: ${reason}`);
      throw OboraError.executionFailed(reason);
    }

    if (pending.type === "force_target") {
      const target = String(pending.payload.target ?? "");
      if (!target || !stepIndexByName.has(target)) {
        continue;
      }

      config.logger?.info?.(`[reflector] force_target -> ${target}`);
      repairContext.forceTarget = target;

      if (validationStepName) {
        forcedRouteTargets.set(validationStepName, target);
        config.logger?.info?.(
          `[reflector] queued force_target for validation step ${validationStepName} -> ${target}`
        );
      }
    }
  }
}
