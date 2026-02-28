import { afterEach, describe, expect, it } from "vitest";

import { InMemoryAuditStore } from "../InMemoryAuditStore.js";
import { ReExecutionPlanner } from "../ReExecutionPlanner.js";
import { createDiffReport } from "../ReExecutionDiffReport.js";
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
  const base = new Date("2026-02-14T00:00:00.000Z");
  await store.record(
    makeEvent({
      executionId,
      timestamp: base,
      type: "execution_start",
      data: {
        workflowName: "wf.review",
        workflowVersion: "1.2.0",
        input: { pr: 42 },
        stepOrder: ["analyze", "review", "finalize"],
        policyVersion: "policy-v1",
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
      timestamp: new Date(base.getTime() + 1_500),
      type: "state_change",
      data: { stepName: "analyze", path: "knowledge.findings", oldValue: null, newValue: ["x"] },
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
      timestamp: new Date(base.getTime() + 3_500),
      type: "state_change",
      data: { stepName: "review", path: "external.api_snapshot", oldValue: null, newValue: "t1" },
    })
  );

  await store.record(
    makeEvent({
      executionId,
      timestamp: new Date(base.getTime() + 3_800),
      type: "tool_call",
      data: { stepName: "review", toolName: "date_now", params: {} },
    })
  );

  await store.record(
    makeEvent({
      executionId,
      timestamp: new Date(base.getTime() + 4_000),
      type: "llm_request",
      data: { stepName: "review", model: "gpt-old" },
      metadata: { model: "gpt-old" },
    })
  );

  await store.record(
    makeEvent({
      executionId,
      timestamp: new Date(base.getTime() + 4_500),
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
      timestamp: new Date(base.getTime() + 5_500),
      type: "cell_end",
      data: { stepName: "finalize", output: { report: "done" } },
    })
  );
}

afterEach(() => {
  delete process.env.OBORA_MODEL;
  delete process.env.MODEL;
  delete process.env.OBORA_POLICY_VERSION;
});

describe("ReExecutionPlanner", () => {
  it("creates full mode plan with all steps", async () => {
    const store = new InMemoryAuditStore();
    await seedExecution(store);
    const planner = new ReExecutionPlanner(store);

    const plan = await planner.createPlan("exec-1", { mode: "full", detectNonDeterminism: false });

    expect(plan.mode).toBe("full");
    expect(plan.originalWorkflow).toBe("wf.review");
    expect(plan.stepsToRerun).toEqual(["analyze", "review", "finalize"]);
    expect(plan.stepsToSkip).toEqual([]);
  });

  it("creates checkpoint mode plan with correct skip/rerun split", async () => {
    const store = new InMemoryAuditStore();
    await seedExecution(store);
    const planner = new ReExecutionPlanner(store);

    const plan = await planner.createPlan("exec-1", {
      mode: "from_checkpoint",
      checkpointStep: "review",
      detectNonDeterminism: false,
    });

    expect(plan.mode).toBe("from_checkpoint");
    expect(plan.startFromStep).toBe("review");
    expect(plan.stepsToSkip).toEqual(["analyze"]);
    expect(plan.stepsToRerun).toEqual(["review", "finalize"]);
  });

  it("restores state from prior state_change events for checkpoint mode", async () => {
    const store = new InMemoryAuditStore();
    await seedExecution(store);
    const planner = new ReExecutionPlanner(store);

    const plan = await planner.createPlan("exec-1", {
      mode: "from_checkpoint",
      checkpointStep: "review",
      detectNonDeterminism: false,
    });

    expect(plan.restoredState).toEqual({ "knowledge.findings": ["x"] });
  });

  it("detects model_change, time_drift, policy_change warnings", async () => {
    const store = new InMemoryAuditStore();
    await seedExecution(store);

    process.env.OBORA_MODEL = "gpt-new";
    process.env.OBORA_POLICY_VERSION = "policy-v2";

    const planner = new ReExecutionPlanner(store);
    const plan = await planner.createPlan("exec-1", { mode: "full" });

    expect(plan.nonDeterminismWarnings.some((w) => w.type === "model_change")).toBe(true);
    expect(plan.nonDeterminismWarnings.some((w) => w.type === "time_drift")).toBe(true);
    expect(plan.nonDeterminismWarnings.some((w) => w.type === "policy_change")).toBe(true);
  });

  it("throws when execution does not exist", async () => {
    const store = new InMemoryAuditStore();
    const planner = new ReExecutionPlanner(store);

    await expect(planner.createPlan("missing", { mode: "full" })).rejects.toThrow(
      "No audit events found"
    );
  });

  it("throws when execution has no step sequence", async () => {
    const store = new InMemoryAuditStore();
    await store.record(
      makeEvent({
        executionId: "exec-empty",
        type: "execution_start",
        data: { workflowName: "wf.empty", input: {} },
      })
    );

    const planner = new ReExecutionPlanner(store);
    await expect(planner.createPlan("exec-empty", { mode: "full" })).rejects.toThrow(
      "has no step sequence"
    );
  });

  it("throws when checkpoint step is not found", async () => {
    const store = new InMemoryAuditStore();
    await seedExecution(store);
    const planner = new ReExecutionPlanner(store);

    await expect(
      planner.createPlan("exec-1", { mode: "from_checkpoint", checkpointStep: "unknown" })
    ).rejects.toThrow("Checkpoint step not found");
  });
  it("includes workflowVersion from execution_start data", async () => {
    const store = new InMemoryAuditStore();
    await seedExecution(store);
    const planner = new ReExecutionPlanner(store);

    const plan = await planner.createPlan("exec-1", { mode: "full", detectNonDeterminism: false });

    expect(plan.workflowVersion).toBe("1.2.0");
  });

  it("includes snapshotRef when snapshot events exist", async () => {
    const store = new InMemoryAuditStore();
    await seedExecution(store);
    // Add a snapshot_create event
    await store.record(
      makeEvent({
        executionId: "exec-1",
        type: "snapshot_create",
        data: { snapshotId: "snap-abc123", reason: "checkpoint" },
      })
    );
    const planner = new ReExecutionPlanner(store);

    const plan = await planner.createPlan("exec-1", {
      mode: "from_checkpoint",
      checkpointStep: "review",
      detectNonDeterminism: false,
    });

    expect(plan.snapshotRef).toBe("snap-abc123");
  });
});

describe("createDiffReport", () => {
  it("builds diff report with changed/unchanged/skipped summary", async () => {
    const store = new InMemoryAuditStore();
    await seedExecution(store);
    const planner = new ReExecutionPlanner(store);
    const plan = await planner.createPlan("exec-1", {
      mode: "from_checkpoint",
      checkpointStep: "review",
      detectNonDeterminism: false,
    });

    const originalEvents = await store.query({ executionId: "exec-1" });
    const reExecutionEvents: AuditEvent[] = [
      makeEvent({
        executionId: "exec-2",
        type: "execution_start",
        data: { workflowName: "wf.review", input: { pr: 42 } },
      }),
      makeEvent({
        executionId: "exec-2",
        type: "cell_end",
        data: { stepName: "review", output: { summary: "changed" } },
      }),
      makeEvent({
        executionId: "exec-2",
        type: "cell_end",
        data: { stepName: "finalize", output: { report: "done" } },
      }),
    ];

    const report = createDiffReport(plan, originalEvents, reExecutionEvents);
    expect(report.executionId).toBe("exec-1");
    expect(report.reExecutionId).toBe("exec-2");
    expect(report.differences.some((d) => d.stepName === "analyze" && d.status === "skipped")).toBe(true);
    expect(report.differences.some((d) => d.stepName === "review" && d.status === "changed")).toBe(true);
    expect(report.differences.some((d) => d.stepName === "finalize" && d.status === "unchanged")).toBe(true);
    expect(report.summary.total_steps).toBe(3);
    expect(report.summary.changed).toBe(1);
    expect(report.summary.unchanged).toBe(1);
    expect(report.summary.skipped).toBe(1);
  });

  it("counts new and removed steps in summary", async () => {
    const store = new InMemoryAuditStore();
    await seedExecution(store);
    const planner = new ReExecutionPlanner(store);
    const plan = await planner.createPlan("exec-1", {
      mode: "full",
      detectNonDeterminism: false,
    });

    const originalEvents = await store.query({ executionId: "exec-1" });
    // Re-execution has an extra step and missing one
    const reExecutionEvents: AuditEvent[] = [
      makeEvent({
        executionId: "exec-3",
        type: "execution_start",
        data: { workflowName: "wf.review" },
      }),
      makeEvent({
        executionId: "exec-3",
        type: "cell_end",
        data: { stepName: "analyze", output: { summary: "ok" } },
      }),
      makeEvent({
        executionId: "exec-3",
        type: "cell_end",
        data: { stepName: "review", output: { summary: "original" } },
      }),
      // finalize is missing (removed), extra_step is new
      makeEvent({
        executionId: "exec-3",
        type: "cell_end",
        data: { stepName: "extra_step", output: { data: "new" } },
      }),
    ];

    const report = createDiffReport(plan, originalEvents, reExecutionEvents);
    expect(report.summary.new).toBeGreaterThanOrEqual(1);
    expect(report.summary.removed).toBeGreaterThanOrEqual(1);
  });
});
