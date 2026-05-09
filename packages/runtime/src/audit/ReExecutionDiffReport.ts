import type { AuditEvent } from "./types.js";
import type { ReExecutionPlan } from "./ReExecutionPlanner.js";

export interface ReExecutionDiffReport {
  executionId: string;
  reExecutionId?: string;
  plan: ReExecutionPlan;
  differences: StepDiff[];
  summary: { total_steps: number; changed: number; unchanged: number; skipped: number; new: number; removed: number };
}

export interface StepDiff {
  stepName: string;
  status: "unchanged" | "changed" | "new" | "removed" | "skipped";
  originalOutput?: unknown;
  reExecutionOutput?: unknown;
  diffDetails?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStepName(event: AuditEvent): string | undefined {
  if (!isObject(event.data)) {
    return undefined;
  }

  const stepName = event.data.stepName;
  return typeof stepName === "string" && stepName.length > 0 ? stepName : undefined;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  }

  if (isObject(value)) {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function outputsByStep(events: AuditEvent[]): Map<string, unknown> {
  return events.reduce<Map<string, unknown>>((map, event) => {
    if (event.type !== "cell_end") {
      return map;
    }

    const stepName = getStepName(event);
    if (!stepName || !isObject(event.data)) {
      return map;
    }

    if ("output" in event.data) {
      map.set(stepName, event.data.output);
      return map;
    }

    if ("metrics" in event.data) {
      map.set(stepName, event.data.metrics);
    }
    return map;
  }, new Map());
}

export function createDiffReport(
  plan: ReExecutionPlan,
  originalEvents: AuditEvent[],
  reExecutionEvents?: AuditEvent[]
): ReExecutionDiffReport {
  const originalOutputs = outputsByStep(originalEvents);
  const reExecutionOutputs = outputsByStep(reExecutionEvents ?? []);

  const allSteps = new Set<string>([
    ...originalOutputs.keys(),
    ...reExecutionOutputs.keys(),
    ...plan.stepsToRerun,
    ...plan.stepsToSkip,
  ]);

  const differences = [...allSteps].map<StepDiff>((stepName) => {
    if (plan.stepsToSkip.includes(stepName)) {
      return { stepName, status: "skipped", originalOutput: originalOutputs.get(stepName) };
    }

    const originalOutput = originalOutputs.get(stepName);
    const reExecutionOutput = reExecutionOutputs.get(stepName);

    if (originalOutput === undefined && reExecutionOutput !== undefined) {
      return {
        stepName,
        status: "new",
        originalOutput,
        reExecutionOutput,
        diffDetails: "Step exists only in re-execution output.",
      };
    }

    if (originalOutput !== undefined && reExecutionOutput === undefined) {
      return {
        stepName,
        status: "removed",
        originalOutput,
        reExecutionOutput,
        diffDetails: "Step output missing in re-execution.",
      };
    }

    const originalDigest = stableStringify(originalOutput);
    const reExecutionDigest = stableStringify(reExecutionOutput);

    if (originalDigest === reExecutionDigest) {
      return { stepName, status: "unchanged", originalOutput, reExecutionOutput };
    }

    return {
      stepName,
      status: "changed",
      originalOutput,
      reExecutionOutput,
      diffDetails: "Output payload differs between original execution and re-execution.",
    };
  });

  const summary = differences.reduce(
    (acc, diff) => {
      if (diff.status === "changed") {
        acc.changed += 1;
      }
      if (diff.status === "unchanged") {
        acc.unchanged += 1;
      }
      if (diff.status === "skipped") {
        acc.skipped += 1;
      }
      if (diff.status === "new") {
        acc.new += 1;
      }
      if (diff.status === "removed") {
        acc.removed += 1;
      }
      return acc;
    },
    { total_steps: differences.length, changed: 0, unchanged: 0, skipped: 0, new: 0, removed: 0 }
  );

  const reExecutionId = reExecutionEvents?.find((event) => event.type === "execution_start")?.executionId;

  return {
    executionId: plan.executionId,
    reExecutionId,
    plan,
    differences,
    summary,
  };
}
