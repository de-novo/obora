import { describe, it, expect } from "vitest";
import { BlackboardManager } from "../blackboard-manager.js";
import { ExecutionObserver } from "../execution-observer.js";
import { ExecutionReflector } from "../execution-reflector.js";
import { EventBus } from "../../events/event-bus.js";
import type { ValidationResult } from "../../validation-repair.js";

describe("Blackboard integration: Manager + Observer + Reflector", () => {
  it("should track a complete workflow execution lifecycle", async () => {
    const eventBus = new EventBus();
    const blackboard = new BlackboardManager({ sessionId: "integration-test" });
    const observer = new ExecutionObserver(eventBus);
    const reflector = new ExecutionReflector();
    const execId = "exec-integration-001";

    observer.observe(execId);

    // Step 1: build
    blackboard.recordStepStart("build");
    await eventBus.emit("step_start", execId, { stepName: "build" });

    blackboard.recordStepOutput("build", "Build artifacts generated");
    blackboard.recordStepEnd("build");
    await eventBus.emit("step_end", execId, { stepName: "build", status: "completed" });

    // Step 2: validate (fails)
    blackboard.recordStepStart("validate");
    await eventBus.emit("step_start", execId, { stepName: "validate" });

    const failResult: ValidationResult = {
      passed: false,
      summary: "Type errors in module A",
      failedChecks: [
        { name: "typecheck", message: "Cannot find module 'foo'", severity: "error" },
      ],
    };
    blackboard.recordValidation("validate", failResult, 1);
    await eventBus.emit("workflow.validation_failed", execId, {
      stepName: "validate",
      summary: failResult.summary,
    });

    // Back-edge triggered
    await eventBus.emit("workflow.back_edge_triggered", execId, {
      sourceStep: "validate",
      targetStep: "build",
    });

    // Repair: build again (attempt 2)
    await eventBus.emit("workflow.repair_started", execId, {
      stepName: "build",
      attempt: 2,
    });

    // Reflector should detect the failure pattern
    const hint = reflector.analyzeFailures(
      blackboard.getFailureHistory(),
      "build"
    );
    // Only 1 failure for "validate" step, not "build" step, so no hint for build
    expect(hint).toBeUndefined();

    // Add another failure for build step
    const buildFailResult: ValidationResult = {
      passed: false,
      summary: "Type errors in module A",
      failedChecks: [
        { name: "typecheck", message: "Cannot find module 'foo'", severity: "error" },
      ],
    };
    blackboard.recordValidation("build", buildFailResult, 1);
    blackboard.recordValidation("build", buildFailResult, 2);
    blackboard.recordValidation("build", buildFailResult, 3);

    const hint2 = reflector.analyzeFailures(
      blackboard.getFailureHistory(),
      "build"
    );
    expect(hint2).toBeDefined();
    expect(hint2).toContain("typecheck");
    expect(hint2).toContain("fundamentally different approach");

    // Step 2 passes on retry
    blackboard.recordStepOutput("validate", { passed: true, summary: "All checks passed" });
    blackboard.recordStepEnd("validate");
    await eventBus.emit("step_end", execId, { stepName: "validate", status: "completed" });
    await eventBus.emit("workflow.validation_passed", execId, {
      stepName: "validate",
      summary: "All checks passed",
    });

    // Finalize
    const metrics = observer.finalize(execId);
    observer.dispose();

    // Verify observer metrics
    expect(metrics).toBeDefined();
    expect(metrics!.totalBackEdges).toBe(1);
    expect(metrics!.totalRepairs).toBe(1);
    expect(metrics!.totalValidationFailures).toBe(1);
    expect(metrics!.totalValidationPasses).toBe(1);
    expect(metrics!.stepMetrics.get("build")).toBeDefined();
    expect(metrics!.stepMetrics.get("validate")).toBeDefined();

    // Verify blackboard state
    expect(blackboard.getStepOutput("build")).toBe("Build artifacts generated");
    expect(blackboard.getStepOutput("validate")).toEqual({
      passed: true,
      summary: "All checks passed",
    });
    expect(blackboard.getFailureHistory().length).toBe(4); // 1 validate + 3 build

    // Verify snapshot
    const snapshot = blackboard.getSnapshot();
    expect(snapshot.stepOutputs).toEqual({
      build: "Build artifacts generated",
      validate: { passed: true, summary: "All checks passed" },
    });
    expect(snapshot.facts.length).toBeGreaterThan(0);
  });

  it("should work independently — blackboard without observer", () => {
    const blackboard = new BlackboardManager();
    blackboard.recordStepOutput("step1", "output");
    blackboard.recordStepStart("step1");
    blackboard.recordStepEnd("step1");

    expect(blackboard.getStepOutput("step1")).toBe("output");
    expect(blackboard.getFacts()).toHaveLength(1);
  });

  it("should work independently — observer without blackboard", async () => {
    const eventBus = new EventBus();
    const observer = new ExecutionObserver(eventBus);
    observer.observe("exec-002");

    await eventBus.emit("step_start", "exec-002", { stepName: "s1" });
    await eventBus.emit("step_end", "exec-002", { stepName: "s1" });

    const metrics = observer.getMetrics("exec-002");
    expect(metrics).toBeDefined();
    expect(metrics!.stepMetrics.get("s1")!.status).toBe("completed");
    observer.dispose();
  });
});
