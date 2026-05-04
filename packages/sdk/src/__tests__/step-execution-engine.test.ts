import { describe, expect, it, vi } from "vitest";
import { StepExecutionEngine } from "../execution/step-execution-engine.js";
import type { EventBus } from "../events/event-bus.js";
import type { BlackboardManager, BlackboardSnapshot } from "../blackboard/blackboard-manager.js";
import type { ExecutionMetrics } from "../blackboard/execution-observer.js";
import type { WorkflowStep } from "../workflow.js";
import { RepairLoopTracker } from "../execution/repair-loop-tracker.js";

describe("StepExecutionEngine", () => {
  const createMockEventBus = (): EventBus =>
    ({
      emit: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockReturnValue(() => {}),
    }) as unknown as EventBus;

  const createEngine = () =>
    new StepExecutionEngine({
      eventBus: createMockEventBus(),
      config: {},
      repairLoopTracker: new RepairLoopTracker(),
    });

  describe("extractFailurePatterns", () => {
    it("returns empty array when no failures", () => {
      const engine = createEngine();
      const blackboard = { getFailureHistory: vi.fn().mockReturnValue([]) } as unknown as BlackboardManager;
      const reflector = { analyzeFailures: vi.fn() };
      expect(engine.extractFailurePatterns(blackboard, reflector)).toEqual([]);
      expect(reflector.analyzeFailures).not.toHaveBeenCalled();
    });

    it("returns hint when reflector provides one", () => {
      const engine = createEngine();
      const failures = [{ stepName: "s1", attempt: 1, validation: { passed: false, summary: "bad", failedChecks: [] } }];
      const blackboard = { getFailureHistory: vi.fn().mockReturnValue(failures) } as unknown as BlackboardManager;
      const reflector = { analyzeFailures: vi.fn().mockReturnValue("pattern: null dereference") };
      expect(engine.extractFailurePatterns(blackboard, reflector)).toEqual(["pattern: null dereference"]);
    });

    it("returns empty array when reflector returns undefined", () => {
      const engine = createEngine();
      const failures = [{ stepName: "s1", attempt: 1, validation: { passed: false, summary: "bad", failedChecks: [] } }];
      const blackboard = { getFailureHistory: vi.fn().mockReturnValue(failures) } as unknown as BlackboardManager;
      const reflector = { analyzeFailures: vi.fn().mockReturnValue(undefined) };
      expect(engine.extractFailurePatterns(blackboard, reflector)).toEqual([]);
    });
  });

  describe("summarizeBlackboardSnapshot", () => {
    it("summarizes empty snapshot", () => {
      const engine = createEngine();
      const snapshot: BlackboardSnapshot = {
        facts: [],
        failures: [],
        stepOutputs: {},
        stepTimings: {},
      };
      const summary = engine.summarizeBlackboardSnapshot(snapshot);
      expect(summary).toEqual({
        facts: 0,
        failures: 0,
        stepOutputs: [],
        stepTimings: [],
        lastFailure: undefined,
      });
    });

    it("summarizes snapshot with data", () => {
      const engine = createEngine();
      const snapshot: BlackboardSnapshot = {
        facts: [{ id: "f1" }],
        failures: [{ stepName: "s1", attempt: 2, validation: { passed: false, summary: "oops", failedChecks: [] } }],
        stepOutputs: { s1: "output" },
        stepTimings: { s1: 100 },
      };
      const summary = engine.summarizeBlackboardSnapshot(snapshot);
      expect(summary).toMatchObject({
        facts: 1,
        failures: 1,
        stepOutputs: ["s1"],
        stepTimings: ["s1"],
        lastFailure: {
          stepName: "s1",
          attempt: 2,
          summary: "oops",
        },
      });
    });
  });

  describe("summarizeObserverMetrics", () => {
    it("returns undefined when metrics are undefined", () => {
      const engine = createEngine();
      expect(engine.summarizeObserverMetrics(undefined)).toBeUndefined();
    });

    it("summarizes metrics correctly", () => {
      const engine = createEngine();
      const metrics: ExecutionMetrics = {
        stepMetrics: new Map([
          ["s1", { stepName: "s1", status: "completed", retryCount: 0, validationFailures: 0, validationPasses: 1 }],
          ["s2", { stepName: "s2", status: "failed", retryCount: 2, validationFailures: 3, validationPasses: 0 }],
        ]),
        totalBackEdges: 5,
        totalRepairs: 3,
        totalValidationFailures: 3,
        totalValidationPasses: 1,
      };
      const summary = engine.summarizeObserverMetrics(metrics);
      expect(summary).toMatchObject({
        totalSteps: 2,
        totalBackEdges: 5,
        totalRepairs: 3,
        totalValidationFailures: 3,
        totalValidationPasses: 1,
        steps: [
          { stepName: "s1", status: "completed", retryCount: 0, validationFailures: 0, validationPasses: 1 },
          { stepName: "s2", status: "failed", retryCount: 2, validationFailures: 3, validationPasses: 0 },
        ],
      });
    });
  });

  describe("buildRepairContext", () => {
    it("returns undefined when repair loop is disabled", () => {
      const engine = createEngine();
      const step: WorkflowStep = { name: "s1", config: { repair_loop: { enabled: false } } };
      expect(engine.buildRepairContext(step, new Map())).toBeUndefined();
    });

    it("returns initial build context on first encounter", () => {
      const engine = createEngine();
      const step: WorkflowStep = { name: "s1", config: { repair_loop: { enabled: true, max_no_progress_iterations: 3, repeated_critical_issue_ceiling: 2, validation_step: "validate" } } };
      const ctx = engine.buildRepairContext(step, new Map())!;
      expect(ctx.mode).toBe("initial_build");
      expect(ctx.attempt).toBe(1);
      expect(ctx.validationStep).toBe("validate");
      expect(ctx.maxNoProgressIterations).toBe(3);
      expect(ctx.repeatedCriticalIssueCeiling).toBe(2);
    });

    it("returns repair context with history when state exists", () => {
      const engine = createEngine();
      const step: WorkflowStep = { name: "s1", config: { repair_loop: { enabled: true, validation_step: "validate" } } };
      const states = new Map([
        ["s1", {
          attempt: 3,
          history: [{ passed: false, summary: "bad", failedChecks: [] }],
          latestValidation: { passed: false, summary: "still bad", failedChecks: [] },
          repeatedSignatureCount: 1,
          lastSignature: "sig-1",
        }],
      ]);
      const ctx = engine.buildRepairContext(step, states)!;
      expect(ctx.mode).toBe("repair");
      expect(ctx.attempt).toBe(3);
      expect(ctx.latestValidation).toBeDefined();
      expect(ctx.previousValidationResults).toHaveLength(1);
      expect(ctx.repeatedSignatureCount).toBe(1);
    });
  });

  describe("resolveValidationResult", () => {
    it("returns undefined when validation is disabled", () => {
      const engine = createEngine();
      const step: WorkflowStep = { name: "s1" };
      expect(engine.resolveValidationResult(step, "anything")).toBeUndefined();
    });

    it("normalizes structured output when validation is enabled", () => {
      const engine = createEngine();
      const step: WorkflowStep = { name: "s1", config: { validation: { enabled: true } } };
      const output = { passed: true, summary: "looks good", failedChecks: [] };
      const result = engine.resolveValidationResult(step, output);
      expect(result).toMatchObject({ passed: true, summary: "looks good", failedChecks: [] });
    });

    it("throws when structured result is required but missing", () => {
      const engine = createEngine();
      const step: WorkflowStep = { name: "s1", config: { validation: { enabled: true, emit_structured_result: true } } };
      expect(() => engine.resolveValidationResult(step, "plain text")).toThrow("must emit a structured ValidationResult");
    });
  });

  describe("runStepHook", () => {
    it("returns undefined when no hook is configured", async () => {
      const engine = createEngine();
      const step: WorkflowStep = { name: "s1" };
      const result = await engine.runStepHook(
        { name: "wf", steps: [] },
        step,
        "pre_step",
        "exec-1"
      );
      expect(result).toBeUndefined();
    });
  });
});
