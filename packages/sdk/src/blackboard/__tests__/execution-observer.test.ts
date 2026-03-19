import { describe, it, expect } from "vitest";
import { ExecutionObserver } from "../execution-observer.js";
import { EventBus } from "../../events/event-bus.js";

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
});
