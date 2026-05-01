import { describe, it, expect, vi } from "vitest";
import { CostTracker } from "../../cost-tracker.js";
import { ExecutionObserver } from "../execution-observer.js";
import type { ExecutionReport } from "../execution-observer.js";
import { EventBus } from "../../events/event-bus.js";
import { BlackboardManager } from "../blackboard-manager.js";
import type { CostRecord, CostSummary, StorageAdapter } from "@obora/runtime";

describe("ExecutionObserver", () => {
  const execId = "exec-001";

  function createObserver() {
    const eventBus = new EventBus();
    const observer = new ExecutionObserver(eventBus);
    return { eventBus, observer };
  }

  it("should initialize metrics when observing an execution", () => {
    const { observer } = createObserver();
    observer.observe(execId);
    const metrics = observer.getMetrics(execId);
    expect(metrics).toBeDefined();
    expect(metrics!.executionId).toBe(execId);
    expect(metrics!.totalBackEdges).toBe(0);
    expect(metrics!.totalRepairs).toBe(0);
    expect(metrics!.totalValidationFailures).toBe(0);
    expect(metrics!.totalValidationPasses).toBe(0);
    expect(metrics!.stepMetrics.size).toBe(0);
    observer.dispose();
  });

  it("should track step_start events", async () => {
    const { eventBus, observer } = createObserver();
    observer.observe(execId);

    await eventBus.emit("step_start", execId, { stepName: "build" });

    const metrics = observer.getMetrics(execId);
    const step = metrics!.stepMetrics.get("build");
    expect(step).toBeDefined();
    expect(step!.status).toBe("running");
    expect(step!.startedAt).toBeGreaterThan(0);
    observer.dispose();
  });

  it("should track step_end events with duration", async () => {
    const { eventBus, observer } = createObserver();
    observer.observe(execId);

    await eventBus.emit("step_start", execId, { stepName: "build" });
    await eventBus.emit("step_end", execId, { stepName: "build", status: "completed" });

    const step = observer.getMetrics(execId)!.stepMetrics.get("build");
    expect(step!.status).toBe("completed");
    expect(step!.durationMs).toBeDefined();
    expect(step!.durationMs).toBeGreaterThanOrEqual(0);
    observer.dispose();
  });

  it("should track validation failures", async () => {
    const { eventBus, observer } = createObserver();
    observer.observe(execId);

    await eventBus.emit("step_start", execId, { stepName: "validate" });
    await eventBus.emit("workflow.validation_failed", execId, {
      stepName: "validate",
      summary: "Build failed",
    });

    const metrics = observer.getMetrics(execId)!;
    expect(metrics.totalValidationFailures).toBe(1);
    expect(metrics.stepMetrics.get("validate")!.validationFailures).toBe(1);
    observer.dispose();
  });

  it("should track validation passes", async () => {
    const { eventBus, observer } = createObserver();
    observer.observe(execId);

    await eventBus.emit("step_start", execId, { stepName: "validate" });
    await eventBus.emit("workflow.validation_passed", execId, {
      stepName: "validate",
      summary: "All good",
    });

    const metrics = observer.getMetrics(execId)!;
    expect(metrics.totalValidationPasses).toBe(1);
    expect(metrics.stepMetrics.get("validate")!.validationPasses).toBe(1);
    observer.dispose();
  });

  it("should track back-edge triggers", async () => {
    const { eventBus, observer } = createObserver();
    observer.observe(execId);

    await eventBus.emit("workflow.back_edge_triggered", execId, {
      sourceStep: "validate",
      targetStep: "build",
    });

    expect(observer.getMetrics(execId)!.totalBackEdges).toBe(1);
    observer.dispose();
  });

  it("should track repair events", async () => {
    const { eventBus, observer } = createObserver();
    observer.observe(execId);

    await eventBus.emit("step_start", execId, { stepName: "build" });
    await eventBus.emit("workflow.repair_started", execId, {
      stepName: "build",
      attempt: 2,
    });

    const metrics = observer.getMetrics(execId)!;
    expect(metrics.totalRepairs).toBe(1);
    expect(metrics.stepMetrics.get("build")!.retryCount).toBe(1);
    observer.dispose();
  });

  it("should ignore events from other executions", async () => {
    const { eventBus, observer } = createObserver();
    observer.observe(execId);

    await eventBus.emit("step_start", "other-exec", { stepName: "build" });

    expect(observer.getMetrics(execId)!.stepMetrics.size).toBe(0);
    observer.dispose();
  });

  it("should finalize metrics with completion time", () => {
    const { observer } = createObserver();
    observer.observe(execId);

    const metrics = observer.finalize(execId);
    expect(metrics).toBeDefined();
    expect(metrics!.completedAt).toBeGreaterThan(0);
    expect(metrics!.totalDurationMs).toBeGreaterThanOrEqual(0);
    observer.dispose();
  });

  it("should return undefined for unknown execution", () => {
    const { observer } = createObserver();
    expect(observer.getMetrics("unknown")).toBeUndefined();
    expect(observer.finalize("unknown")).toBeUndefined();
    observer.dispose();
  });

  it("should clean up subscriptions on dispose", async () => {
    const { eventBus, observer } = createObserver();
    observer.observe(execId);
    observer.dispose();

    // After dispose, events should not update metrics
    await eventBus.emit("step_start", execId, { stepName: "build" });
    expect(observer.getMetrics(execId)!.stepMetrics.size).toBe(0);
  });

  // ── New: attempt durations ────────────────────────────────────────────

  it("should record attempt durations across retries", async () => {
    const { eventBus, observer } = createObserver();
    observer.observe(execId);

    // First attempt
    await eventBus.emit("step_start", execId, { stepName: "build" });
    await eventBus.emit("step_end", execId, { stepName: "build", status: "completed" });

    // Repair triggers a retry (step_start again)
    await eventBus.emit("workflow.repair_started", execId, { stepName: "build" });
    await eventBus.emit("step_start", execId, { stepName: "build" });
    await eventBus.emit("step_end", execId, { stepName: "build", status: "completed" });

    const step = observer.getMetrics(execId)!.stepMetrics.get("build")!;
    expect(step.attemptDurations).toHaveLength(2);
    for (const d of step.attemptDurations) {
      expect(d).toBeGreaterThanOrEqual(0);
    }
    observer.dispose();
  });

  it("should track failed step_end status", async () => {
    const { eventBus, observer } = createObserver();
    observer.observe(execId);

    await eventBus.emit("step_start", execId, { stepName: "deploy" });
    await eventBus.emit("step_end", execId, { stepName: "deploy", status: "failed" });

    const step = observer.getMetrics(execId)!.stepMetrics.get("deploy")!;
    expect(step.status).toBe("failed");
    observer.dispose();
  });

  // ── New: cost tracking ────────────────────────────────────────────────

  it("should attach cost tracker and record per-step cost", async () => {
    const { eventBus, observer } = createObserver();

    let callCount = 0;
    const storage: StorageAdapter = {
      async saveRun() {},
      async getRun() {
        return null;
      },
      async listRuns() {
        return [];
      },
      async saveStep() {},
      async getSteps() {
        return [];
      },
      async saveArtifact(record) {
        return record;
      },
      async getArtifacts() {
        return [];
      },
      async deleteArtifact() {},
      async saveCheckpoint() {},
      async getLatestCheckpoint() {
        return null;
      },
      async saveCost() {},
      async getCosts(): Promise<CostRecord[]> {
        return [];
      },
      getRunCostSummary: vi.fn(async (): Promise<CostSummary> => {
        callCount++;
        // First call (step_start snapshot): totalCostUsd = 1.00
        // Second call (step_end delta):     totalCostUsd = 1.50
        return {
          totalTokens: 1000 * callCount,
          totalCostUsd: callCount === 1 ? 1.0 : 1.5,
          byStep: [],
          byModel: [],
        };
      }),
      async saveAuditEvent() {},
      async getAuditTimeline() {
        return [];
      },
    };
    const mockCostTracker = new CostTracker(storage, execId);

    observer.attachCostTracker(mockCostTracker);
    observer.observe(execId);

    await eventBus.emit("step_start", execId, { stepName: "generate" });
    // Allow microtask for the async cost snapshot
    await new Promise((r) => setTimeout(r, 10));

    await eventBus.emit("step_end", execId, { stepName: "generate", status: "completed" });
    await new Promise((r) => setTimeout(r, 10));

    const step = observer.getMetrics(execId)!.stepMetrics.get("generate")!;
    expect(step.costUsd).toBeCloseTo(0.5, 2);

    const metrics = observer.getMetrics(execId)!;
    expect(metrics.totalCostUsd).toBe(1.5);
    observer.dispose();
  });

  // ── New: report generation ────────────────────────────────────────────

  describe("generateReport", () => {
    it("should return undefined for unknown execution", () => {
      const { observer } = createObserver();
      expect(observer.generateReport("unknown")).toBeUndefined();
      observer.dispose();
    });

    it("should generate a report with step metrics", async () => {
      const { eventBus, observer } = createObserver();
      observer.observe(execId);

      // Run two steps
      await eventBus.emit("step_start", execId, { stepName: "build" });
      await eventBus.emit("workflow.validation_passed", execId, { stepName: "build" });
      await eventBus.emit("step_end", execId, { stepName: "build", status: "completed" });

      await eventBus.emit("step_start", execId, { stepName: "test" });
      await eventBus.emit("workflow.validation_failed", execId, { stepName: "test" });
      await eventBus.emit("workflow.repair_started", execId, { stepName: "test" });
      await eventBus.emit("step_start", execId, { stepName: "test" });
      await eventBus.emit("workflow.validation_passed", execId, { stepName: "test" });
      await eventBus.emit("step_end", execId, { stepName: "test", status: "completed" });

      await eventBus.emit("workflow.back_edge_triggered", execId, {
        sourceStep: "test",
        targetStep: "build",
      });

      observer.finalize(execId, "success");

      const report = observer.generateReport(execId, {
        workflowName: "my-workflow",
        failurePatterns: ["Test failures repeated"],
      });

      expect(report).toBeDefined();
      const r = report!;

      expect(r.workflowName).toBe("my-workflow");
      expect(r.outcome).toBe("success");
      expect(r.totalSteps).toBe(2);
      expect(r.totalBackEdges).toBe(1);
      expect(r.totalRetries).toBe(1);
      expect(r.totalDuration).toBeGreaterThanOrEqual(0);
      expect(r.totalCost).toBe(0); // no cost tracker attached
      expect(r.failurePatterns).toEqual(["Test failures repeated"]);

      // Check step metrics
      const buildMetric = r.stepMetrics.find((s) => s.stepName === "build");
      expect(buildMetric).toBeDefined();
      expect(buildMetric!.attempts).toBe(1); // 0 retries + 1
      expect(buildMetric!.successCount).toBe(1);
      expect(buildMetric!.failureCount).toBe(0);

      const testMetric = r.stepMetrics.find((s) => s.stepName === "test");
      expect(testMetric).toBeDefined();
      expect(testMetric!.attempts).toBe(2); // 1 retry + 1
      expect(testMetric!.successCount).toBe(1);
      expect(testMetric!.failureCount).toBe(1);

      observer.dispose();
    });

    it("should compute min/max/avg durations from attempt durations", async () => {
      const { eventBus, observer } = createObserver();
      observer.observe(execId);

      // Simulate 3 attempts with controllable timing
      for (let i = 0; i < 3; i++) {
        await eventBus.emit("step_start", execId, { stepName: "flaky" });
        if (i < 2) {
          await eventBus.emit("workflow.repair_started", execId, { stepName: "flaky" });
        }
        await eventBus.emit("step_end", execId, { stepName: "flaky", status: "completed" });
      }

      observer.finalize(execId);
      const report = observer.generateReport(execId, { workflowName: "test" });
      const metric = report!.stepMetrics.find((s) => s.stepName === "flaky")!;

      expect(metric.attempts).toBe(3); // 2 retries + 1
      expect(metric.minDuration).toBeDefined();
      expect(metric.maxDuration).toBeDefined();
      expect(metric.avgDuration).toBeGreaterThanOrEqual(0);
      expect(metric.minDuration!).toBeLessThanOrEqual(metric.maxDuration!);
      observer.dispose();
    });

    it("should record failure outcome", async () => {
      const { eventBus, observer } = createObserver();
      observer.observe(execId);

      await eventBus.emit("step_start", execId, { stepName: "build" });
      await eventBus.emit("step_end", execId, { stepName: "build", status: "failed" });

      observer.finalize(execId, "failure");
      const report = observer.generateReport(execId, { workflowName: "broken" });
      expect(report!.outcome).toBe("failure");
      observer.dispose();
    });

    it("should record timeout outcome", () => {
      const { observer } = createObserver();
      observer.observe(execId);
      observer.finalize(execId, "timeout");
      const report = observer.generateReport(execId, { workflowName: "slow" });
      expect(report!.outcome).toBe("timeout");
      observer.dispose();
    });

    it("should produce JSON-serializable report", async () => {
      const { eventBus, observer } = createObserver();
      observer.observe(execId);

      await eventBus.emit("step_start", execId, { stepName: "build" });
      await eventBus.emit("step_end", execId, { stepName: "build", status: "completed" });

      observer.finalize(execId);
      const report = observer.generateReport(execId, { workflowName: "ci" });

      // Should round-trip through JSON
      const json = JSON.stringify(report);
      const parsed = JSON.parse(json) as ExecutionReport;
      expect(parsed.workflowName).toBe("ci");
      expect(parsed.stepMetrics).toHaveLength(1);
      expect(parsed.stepMetrics[0]!.stepName).toBe("build");
      observer.dispose();
    });
  });

  // ── Blackboard integration ──────────────────────────────────────────

  describe("Blackboard integration", () => {
    const bbExecId = "exec-bb-001";

    function createObserverWithBoard() {
      const eventBus = new EventBus();
      const blackboard = new BlackboardManager({ sessionId: bbExecId });
      const observer = new ExecutionObserver(eventBus, blackboard);
      return { eventBus, observer, blackboard };
    }

    it("should write step_start metrics to blackboard", async () => {
      const { eventBus, observer, blackboard } = createObserverWithBoard();
      observer.observe(bbExecId);

      await eventBus.emit("step_start", bbExecId, { stepName: "build" });

      const startedAt = blackboard.board.read("state.context.observer.steps.build.startedAt", { strict: false });
      expect(startedAt).toBeGreaterThan(0);

      const status = blackboard.board.read("state.context.observer.steps.build.status", { strict: false });
      expect(status).toBe("running");

      observer.dispose();
    });

    it("should write step_end metrics to blackboard", async () => {
      const { eventBus, observer, blackboard } = createObserverWithBoard();
      observer.observe(bbExecId);

      await eventBus.emit("step_start", bbExecId, { stepName: "build" });
      await eventBus.emit("step_end", bbExecId, { stepName: "build", status: "completed" });

      const completedAt = blackboard.board.read("state.context.observer.steps.build.completedAt", { strict: false });
      expect(completedAt).toBeGreaterThan(0);

      const durationMs = blackboard.board.read("state.context.observer.steps.build.durationMs", { strict: false });
      expect(durationMs).toBeGreaterThanOrEqual(0);

      const status = blackboard.board.read("state.context.observer.steps.build.status", { strict: false });
      expect(status).toBe("completed");

      observer.dispose();
    });

    it("should write validation failure to blackboard and create knowledge fact", async () => {
      const { eventBus, observer, blackboard } = createObserverWithBoard();
      observer.observe(bbExecId);

      await eventBus.emit("step_start", bbExecId, { stepName: "validate" });
      await eventBus.emit("workflow.validation_failed", bbExecId, {
        stepName: "validate",
        summary: "Type check failed",
      });

      const validation = blackboard.board.read("state.context.observer.validations.validate", { strict: false });
      expect(validation).toBeDefined();
      expect((validation as Record<string, unknown>).failures).toBe(1);

      const facts = blackboard.board.knowledge.findFacts({ category: "observer_validation_failure" });
      expect(facts).toHaveLength(1);
      expect(facts[0]!.content).toContain("validate");
      expect(facts[0]!.content).toContain("Type check failed");
      expect(facts[0]!.tags).toContain("observer");
      expect(facts[0]!.tags).toContain("validation-failure");

      observer.dispose();
    });

    it("should write validation pass to blackboard", async () => {
      const { eventBus, observer, blackboard } = createObserverWithBoard();
      observer.observe(bbExecId);

      await eventBus.emit("step_start", bbExecId, { stepName: "validate" });
      await eventBus.emit("workflow.validation_passed", bbExecId, {
        stepName: "validate",
        summary: "All checks passed",
      });

      const validation = blackboard.board.read("state.context.observer.validations.validate", { strict: false });
      expect(validation).toBeDefined();
      expect((validation as Record<string, unknown>).passes).toBe(1);

      observer.dispose();
    });

    it("should write back-edge knowledge fact to blackboard", async () => {
      const { eventBus, observer, blackboard } = createObserverWithBoard();
      observer.observe(bbExecId);

      await eventBus.emit("workflow.back_edge_triggered", bbExecId, {
        sourceStep: "validate",
        targetStep: "build",
      });

      const facts = blackboard.board.knowledge.findFacts({ category: "observer_back_edge" });
      expect(facts).toHaveLength(1);
      expect(facts[0]!.content).toContain("validate");
      expect(facts[0]!.content).toContain("build");
      expect(facts[0]!.tags).toContain("back-edge");

      observer.dispose();
    });

    it("should write execution report to blackboard on finalize", async () => {
      const { eventBus, observer, blackboard } = createObserverWithBoard();
      observer.observe(bbExecId);

      await eventBus.emit("step_start", bbExecId, { stepName: "build" });
      await eventBus.emit("step_end", bbExecId, { stepName: "build", status: "completed" });

      observer.finalize(bbExecId, "success");

      const report = blackboard.board.read("state.context.observer.report", { strict: false });
      expect(report).toBeDefined();
      const r = report as Record<string, unknown>;
      expect(r.outcome).toBe("success");
      expect(r.totalSteps).toBe(1);

      observer.dispose();
    });

    it("should work without blackboard (backward compatible)", async () => {
      const eventBus = new EventBus();
      const observer = new ExecutionObserver(eventBus);
      observer.observe(bbExecId);

      await eventBus.emit("step_start", bbExecId, { stepName: "build" });
      await eventBus.emit("step_end", bbExecId, { stepName: "build", status: "completed" });

      observer.finalize(bbExecId, "success");

      const metrics = observer.getMetrics(bbExecId);
      expect(metrics).toBeDefined();
      expect(metrics!.stepMetrics.get("build")!.status).toBe("completed");

      observer.dispose();
    });

    it("should accumulate knowledge facts across multiple events", async () => {
      const { eventBus, observer, blackboard } = createObserverWithBoard();
      observer.observe(bbExecId);

      await eventBus.emit("step_start", bbExecId, { stepName: "build" });
      await eventBus.emit("workflow.validation_failed", bbExecId, {
        stepName: "build",
        summary: "Failure 1",
      });
      await eventBus.emit("workflow.validation_failed", bbExecId, {
        stepName: "build",
        summary: "Failure 2",
      });
      await eventBus.emit("workflow.back_edge_triggered", bbExecId, {
        sourceStep: "build",
        targetStep: "init",
      });

      const failureFacts = blackboard.board.knowledge.findFacts({ category: "observer_validation_failure" });
      expect(failureFacts).toHaveLength(2);
      expect(failureFacts[0]!.content).toContain("Failure 1");
      expect(failureFacts[1]!.content).toContain("Failure 2");

      const backEdgeFacts = blackboard.board.knowledge.findFacts({ category: "observer_back_edge" });
      expect(backEdgeFacts).toHaveLength(1);

      observer.dispose();
    });
  });
});
