import { describe, expect, it } from "vitest";

import { InMemoryAuditStore } from "../InMemoryAuditStore.js";
import { ReExecutionPlanner } from "../ReExecutionPlanner.js";
import { ReExecutionRuntime } from "../ReExecutionRuntime.js";
import type { AuditEvent } from "../types.js";

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: crypto.randomUUID(),
    executionId: "exec-1",
    timestamp: new Date("2026-02-16T00:00:00.000Z"),
    type: "tool_call",
    data: {},
    ...overrides,
  };
}

async function seedExecution(store: InMemoryAuditStore, executionId = "exec-1") {
  const base = new Date("2026-02-16T00:00:00.000Z");

  await store.record(
    makeEvent({
      executionId,
      timestamp: base,
      type: "execution_start",
      data: {
        workflowName: "wf.reexecute",
        stepOrder: ["analyze", "review", "finalize"],
      },
    })
  );

  await store.record(
    makeEvent({
      executionId,
      timestamp: new Date(base.getTime() + 1_000),
      type: "step_start",
      data: { stepName: "analyze", agent: "analyst" },
    })
  );

  await store.record(
    makeEvent({
      executionId,
      timestamp: new Date(base.getTime() + 2_000),
      type: "cell_end",
      data: { stepName: "analyze", output: { summary: "ok" } },
    })
  );

  await store.record(
    makeEvent({
      executionId,
      timestamp: new Date(base.getTime() + 3_000),
      type: "step_start",
      data: { stepName: "review", agent: "reviewer" },
    })
  );

  await store.record(
    makeEvent({
      executionId,
      timestamp: new Date(base.getTime() + 4_000),
      type: "cell_end",
      data: { stepName: "review", output: { summary: "original" } },
    })
  );

  await store.record(
    makeEvent({
      executionId,
      timestamp: new Date(base.getTime() + 5_000),
      type: "step_start",
      data: { stepName: "finalize", agent: "writer" },
    })
  );

  await store.record(
    makeEvent({
      executionId,
      timestamp: new Date(base.getTime() + 6_000),
      type: "cell_end",
      data: { stepName: "finalize", output: { report: "done" } },
    })
  );
}

class MutatingReExecutionStore extends InMemoryAuditStore {
  async record(event: AuditEvent): Promise<void> {
    if (
      event.type === "cell_end" &&
      String(event.executionId).startsWith("reexec-") &&
      typeof event.data === "object" &&
      event.data !== null &&
      "stepName" in event.data &&
      (event.data as { stepName?: unknown }).stepName === "review"
    ) {
      const data = event.data as Record<string, unknown>;
      const output = data.output;
      if (typeof output === "object" && output !== null) {
        data.output = { ...output, summary: "changed" };
      }
    }

    return super.record(event);
  }
}

describe("ReExecutionRuntime", () => {
  it("re-executes all steps in full mode", async () => {
    const store = new InMemoryAuditStore();
    await seedExecution(store);

    const planner = new ReExecutionPlanner(store);
    const runtime = new ReExecutionRuntime(store, planner);

    const result = await runtime.reexecute({ executionId: "exec-1", mode: "full" });

    expect(result.plan.mode).toBe("full");
    expect(result.stepResults).toHaveLength(3);
    expect(result.stepResults.every((step) => step.status === "done")).toBe(true);
    expect(result.diffReport.summary.changed).toBe(0);
    expect(result.success).toBe(true);

    const reexecEvents = await store.query({ executionId: result.reExecutionId });
    expect(reexecEvents.some((event) => event.type === "reexecution_start")).toBe(true);
    expect(reexecEvents.some((event) => event.type === "reexecution_end")).toBe(true);
  });

  it("skips completed steps and reruns from checkpoint", async () => {
    const store = new InMemoryAuditStore();
    await seedExecution(store);

    const planner = new ReExecutionPlanner(store);
    const runtime = new ReExecutionRuntime(store, planner);

    const result = await runtime.reexecute({
      executionId: "exec-1",
      mode: "from_checkpoint",
      checkpointStep: "review",
    });

    expect(result.plan.mode).toBe("from_checkpoint");
    expect(result.plan.stepsToSkip).toEqual(["analyze"]);
    expect(result.plan.stepsToRerun).toEqual(["review", "finalize"]);

    expect(result.stepResults.find((step) => step.stepName === "analyze")?.status).toBe("skipped");
    expect(result.stepResults.find((step) => step.stepName === "review")?.status).toBe("done");
    expect(result.diffReport.summary.skipped).toBe(1);
  });

  it("supports dry run (plan only) without step execution", async () => {
    const store = new InMemoryAuditStore();
    await seedExecution(store);

    const planner = new ReExecutionPlanner(store);
    const runtime = new ReExecutionRuntime(store, planner);

    const result = await runtime.reexecute({ executionId: "exec-1", mode: "full", dryRun: true });

    expect(result.stepResults).toEqual([]);
    expect(result.success).toBe(true);

    const reexecEvents = await store.query({ executionId: result.reExecutionId });
    expect(reexecEvents.some((event) => event.type === "execution_start")).toBe(false);
    expect(reexecEvents.some((event) => event.type === "cell_end")).toBe(false);
    expect(reexecEvents.some((event) => event.type === "reexecution_start")).toBe(true);
    expect(reexecEvents.some((event) => event.type === "reexecution_end")).toBe(true);
  });

  it("detects changed output in diff report when re-execution output diverges", async () => {
    const store = new MutatingReExecutionStore();
    await seedExecution(store);

    const planner = new ReExecutionPlanner(store);
    const runtime = new ReExecutionRuntime(store, planner);

    const result = await runtime.reexecute({ executionId: "exec-1", mode: "full" });

    expect(result.diffReport.summary.changed).toBe(1);
    expect(result.diffReport.differences.some((step) => step.stepName === "review" && step.status === "changed")).toBe(true);
    expect(result.success).toBe(false);
  });

  it("throws for missing execution", async () => {
    const store = new InMemoryAuditStore();
    const planner = new ReExecutionPlanner(store);
    const runtime = new ReExecutionRuntime(store, planner);

    await expect(runtime.reexecute({ executionId: "missing", mode: "full" })).rejects.toThrow(
      "No audit events found"
    );
  });

  it("calls onStepComplete for each processed step", async () => {
    const store = new InMemoryAuditStore();
    await seedExecution(store);

    const planner = new ReExecutionPlanner(store);
    const runtime = new ReExecutionRuntime(store, planner);

    const completedSteps: string[] = [];
    await runtime.reexecute({
      executionId: "exec-1",
      mode: "from_checkpoint",
      checkpointStep: "review",
      onStepComplete: async (stepName) => {
        completedSteps.push(stepName);
      },
    });

    expect(completedSteps).toEqual(["analyze", "review", "finalize"]);
  });
});
