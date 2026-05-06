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

  it("uses metrics as replay output and reports missing original outputs", async () => {
    const store = new InMemoryAuditStore();
    const base = new Date("2026-02-16T00:00:00.000Z");

    await store.record(
      makeEvent({
        timestamp: base,
        type: "execution_start",
        data: {
          workflowName: "wf.metrics",
          workflowVersion: "2026.02",
          snapshotRef: "snapshot-start",
          stepOrder: ["metrics-only", "missing-output"],
        },
      })
    );
    await store.record(
      makeEvent({
        timestamp: new Date(base.getTime() + 1_000),
        type: "step_start",
        data: { stepName: "metrics-only", agent: "metrics-agent" },
      })
    );
    await store.record(
      makeEvent({
        timestamp: new Date(base.getTime() + 2_000),
        type: "cell_end",
        data: { stepName: "", output: { ignored: true } },
      })
    );
    await store.record(
      makeEvent({
        timestamp: new Date(base.getTime() + 2_500),
        type: "cell_end",
        data: { stepName: "metrics-only", metrics: { tokens: 42 } },
      })
    );
    await store.record(
      makeEvent({
        timestamp: new Date(base.getTime() + 3_000),
        type: "step_start",
        data: { stepName: "missing-output", agent: "writer" },
      })
    );

    const planner = new ReExecutionPlanner(store);
    const runtime = new ReExecutionRuntime(store, planner);
    const completed: Array<{ stepName: string; status: string }> = [];

    const result = await runtime.reexecute({
      executionId: "exec-1",
      mode: "full",
      onStepComplete: (stepName, stepResult) => {
        completed.push({ stepName, status: stepResult.status });
      },
    });

    expect(result.workflowVersion).toBe("2026.02");
    expect(result.snapshotRef).toBe("snapshot-start");
    expect(result.stepResults).toEqual([
      {
        stepName: "metrics-only",
        status: "done",
        output: { tokens: 42 },
        matchesOriginal: true,
      },
      {
        stepName: "missing-output",
        status: "failed",
        matchesOriginal: false,
        diff: "No original step output found in audit trail.",
      },
    ]);
    expect(completed).toEqual([
      { stepName: "metrics-only", status: "done" },
      { stepName: "missing-output", status: "failed" },
    ]);
    expect(result.success).toBe(false);
  });

  it("includes workflow version and snapshot ref in dry-run results", async () => {
    const store = new InMemoryAuditStore();
    await store.record(
      makeEvent({
        type: "execution_start",
        data: {
          workflowName: "wf.dry",
          workflowVersion: "dry-version",
          snapshotId: "snapshot-dry",
          stepOrder: ["analyze"],
        },
      })
    );
    await store.record(
      makeEvent({
        type: "step_start",
        data: { stepName: "analyze" },
      })
    );

    const planner = new ReExecutionPlanner(store);
    const runtime = new ReExecutionRuntime(store, planner);

    const result = await runtime.reexecute({ executionId: "exec-1", mode: "full", dryRun: true });

    expect(result.workflowVersion).toBe("dry-version");
    expect(result.snapshotRef).toBe("snapshot-dry");
    expect(result.success).toBe(true);
  });

  it("restores empty checkpoint state when the plan has no restoredState", async () => {
    const store = new InMemoryAuditStore();
    await store.record(
      makeEvent({
        type: "execution_start",
        data: {
          workflowName: "wf.fake-plan",
          stepOrder: ["resume"],
        },
      })
    );

    const planner = {
      createPlan: async () => ({
        executionId: "exec-1",
        originalWorkflow: "wf.fake-plan",
        mode: "from_checkpoint" as const,
        startFromStep: "resume",
        stepsToSkip: [],
        stepsToRerun: [],
        nonDeterminismWarnings: [],
        createdAt: new Date("2026-02-16T00:00:00.000Z"),
      }),
    } as unknown as ReExecutionPlanner;
    const runtime = new ReExecutionRuntime(store, planner);

    const result = await runtime.reexecute({
      executionId: "exec-1",
      mode: "from_checkpoint",
      checkpointStep: "resume",
    });

    expect(result.success).toBe(true);
    const reexecEvents = await store.query({ executionId: result.reExecutionId });
    const snapshotRestore = reexecEvents.find((event) => event.type === "snapshot_restore");
    expect(snapshotRestore?.data).toMatchObject({
      restoredState: {},
    });
    expect(snapshotRestore?.data).not.toHaveProperty("snapshotRef");
  });
});

describe("ReExecutionRuntime – reexecution_diff audit event (M2-15)", () => {
  it("emits reexecution_diff event with diffReport in full mode", async () => {
    const store = new InMemoryAuditStore();
    await seedExecution(store);

    const planner = new ReExecutionPlanner(store);
    const runtime = new ReExecutionRuntime(store, planner);

    const result = await runtime.reexecute({ executionId: "exec-1", mode: "full" });

    const reexecEvents = await store.query({ executionId: result.reExecutionId });
    const diffEvent = reexecEvents.find((e) => e.type === "reexecution_diff");

    expect(diffEvent).toBeDefined();
    expect((diffEvent!.data as Record<string, unknown>).reExecutionId).toBe(result.reExecutionId);
    expect((diffEvent!.data as Record<string, unknown>).originalExecutionId).toBe("exec-1");
    expect((diffEvent!.data as Record<string, unknown>).diffReport).toBeDefined();
    expect((diffEvent!.data as Record<string, unknown>).simulation).toBe(true);
  });

  it("does NOT emit reexecution_diff in dry run mode", async () => {
    const store = new InMemoryAuditStore();
    await seedExecution(store);

    const planner = new ReExecutionPlanner(store);
    const runtime = new ReExecutionRuntime(store, planner);

    const result = await runtime.reexecute({ executionId: "exec-1", mode: "full", dryRun: true });

    const reexecEvents = await store.query({ executionId: result.reExecutionId });
    const diffEvent = reexecEvents.find((e) => e.type === "reexecution_diff");

    expect(diffEvent).toBeUndefined();
  });
});

describe("ReExecutionRuntime – dryRun summary schema (M2-15)", () => {
  it("dryRun summary includes new=0 and removed=0", async () => {
    const store = new InMemoryAuditStore();
    await seedExecution(store);

    const planner = new ReExecutionPlanner(store);
    const runtime = new ReExecutionRuntime(store, planner);

    const result = await runtime.reexecute({ executionId: "exec-1", mode: "full", dryRun: true });

    expect(result.diffReport.summary).toHaveProperty("new", 0);
    expect(result.diffReport.summary).toHaveProperty("removed", 0);
    expect(result.diffReport.summary).toHaveProperty("changed", 0);
    expect(result.diffReport.summary).toHaveProperty("unchanged", 0);
    expect(result.diffReport.summary).toHaveProperty("skipped", 0);
    expect(result.diffReport.summary).toHaveProperty("total_steps", 3);
  });
});

describe("ReExecutionRuntime – success=false when new or removed > 0 (M2-15)", () => {
  it("success is false when diffReport has new steps", async () => {
    const store = new MutatingReExecutionStore();
    await seedExecution(store);
    // Add an extra step output only in re-execution by making the mutating store also add a new step
    const origRecord = store.record.bind(store);
    let injected = false;
    store.record = async (event: AuditEvent) => {
      await origRecord(event);
      // After execution_start of reexec, inject an extra cell_end for a "bonus" step
      if (
        !injected &&
        event.type === "execution_start" &&
        String(event.executionId).startsWith("reexec-")
      ) {
        injected = true;
        await origRecord({
          id: crypto.randomUUID(),
          executionId: event.executionId,
          timestamp: new Date(),
          type: "cell_end",
          data: { stepName: "bonus_step", output: { extra: true } },
        });
      }
    };

    const planner = new ReExecutionPlanner(store);
    const runtime = new ReExecutionRuntime(store, planner);

    const result = await runtime.reexecute({ executionId: "exec-1", mode: "full" });

    expect(result.diffReport.summary.new).toBeGreaterThanOrEqual(1);
    expect(result.success).toBe(false);
  });
});
