import type { AuditEvent } from "./types.js";
import type { ReExecutionPlan } from "./ReExecutionPlanner.js";

export interface ReExecutionDiffReport {
  executionId: string;
  reExecutionId?: string;
  plan: ReExecutionPlan;
  differences: StepDiff[];
  summary: { total_steps: number; changed: number; unchanged: number; skipped: number };
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
  const map = new Map<string, unknown>();

  for (const event of events) {
    if (event.type !== "cell_end") {
      continue;
    }

    const stepName = getStepName(event);
    if (!stepName || !isObject(event.data)) {
      continue;
    }

    if ("output" in event.data) {
      map.set(stepName, event.data.output);
      continue;
    }

    if ("metrics" in event.data) {
      map.set(stepName, event.data.metrics);
    }
  }

  return map;
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

  const differences: StepDiff[] = [];

  for (const stepName of allSteps) {
    if (plan.stepsToSkip.includes(stepName)) {
      differences.push({ stepName, status: "skipped", originalOutput: originalOutputs.get(stepName) });
      continue;
    }

    const originalOutput = originalOutputs.get(stepName);
    const reExecutionOutput = reExecutionOutputs.get(stepName);

    if (originalOutput === undefined && reExecutionOutput !== undefined) {
      differences.push({
        stepName,
        status: "new",
        originalOutput,
        reExecutionOutput,
        diffDetails: "Step exists only in re-execution output.",
      });
      continue;
    }

    if (originalOutput !== undefined && reExecutionOutput === undefined) {
      differences.push({
        stepName,
        status: "removed",
        originalOutput,
        reExecutionOutput,
        diffDetails: "Step output missing in re-execution.",
      });
      continue;
    }

    const originalDigest = stableStringify(originalOutput);
    const reExecutionDigest = stableStringify(reExecutionOutput);

    if (originalDigest === reExecutionDigest) {
      differences.push({ stepName, status: "unchanged", originalOutput, reExecutionOutput });
    } else {
      differences.push({
        stepName,
        status: "changed",
        originalOutput,
        reExecutionOutput,
        diffDetails: "Output payload differs between original execution and re-execution.",
      });
    }
  }

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
      return acc;
    },
    { total_steps: differences.length, changed: 0, unchanged: 0, skipped: 0 }
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
