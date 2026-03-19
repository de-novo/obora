import { describe, it, expect } from "vitest";
import { BlackboardManager } from "../blackboard-manager.js";
import type { ValidationResult } from "../../validation-repair.js";

describe("BlackboardManager", () => {
  it("should initialize with a session ID", () => {
    const mgr = new BlackboardManager({ sessionId: "test-session" });
    expect(mgr.sessionId).toBe("test-session");
  });

  it("should auto-generate session ID if not provided", () => {
    const mgr = new BlackboardManager();
    expect(mgr.sessionId).toMatch(/^wf-\d+$/);
  });

  describe("recordStepOutput / getStepOutput", () => {
    it("should record and retrieve string step output", () => {
      const mgr = new BlackboardManager();
      mgr.recordStepOutput("step1", "hello world");
      expect(mgr.getStepOutput("step1")).toBe("hello world");
    });

    it("should record and retrieve object step output", () => {
      const mgr = new BlackboardManager();
      const output = { key: "value", nested: { a: 1 } };
      mgr.recordStepOutput("step2", output);
      expect(mgr.getStepOutput("step2")).toEqual(output);
    });

    it("should return undefined for non-existent step", () => {
      const mgr = new BlackboardManager();
      expect(mgr.getStepOutput("nonexistent")).toBeUndefined();
    });

    it("should create a fact for each recorded step output", () => {
      const mgr = new BlackboardManager();
      mgr.recordStepOutput("step1", "output1");
      mgr.recordStepOutput("step2", "output2");

      const facts = mgr.getFacts();
      expect(facts).toHaveLength(2);
      expect(facts[0].category).toBe("step-output");
      expect(facts[0].tags).toContain("step1");
      expect(facts[1].tags).toContain("step2");
    });
  });

  describe("getAllStepOutputs", () => {
    it("should return all recorded outputs", () => {
      const mgr = new BlackboardManager();
      mgr.recordStepOutput("a", 1);
      mgr.recordStepOutput("b", 2);
      mgr.recordStepOutput("c", 3);

      expect(mgr.getAllStepOutputs()).toEqual({ a: 1, b: 2, c: 3 });
    });

    it("should return empty object when no outputs", () => {
      const mgr = new BlackboardManager();
      expect(mgr.getAllStepOutputs()).toEqual({});
    });
  });

  describe("recordValidation", () => {
    const passingResult: ValidationResult = {
      passed: true,
      summary: "All checks passed",
      failedChecks: [],
    };

    const failingResult: ValidationResult = {
      passed: false,
      summary: "Build failed",
      errorCode: "BUILD_ERROR",
      failedChecks: [
        { name: "typecheck", message: "Type errors found", severity: "error" },
        { name: "lint", message: "Lint violations", severity: "warning" },
      ],
    };

    it("should record passing validation as a fact", () => {
      const mgr = new BlackboardManager();
      mgr.recordValidation("validate-step", passingResult);

      const facts = mgr.getFactsByCategory("validation-pass");
      expect(facts).toHaveLength(1);
      expect(facts[0].content).toContain("Validation passed");
    });

    it("should record failing validation as a fact and a failure entry", () => {
      const mgr = new BlackboardManager();
      mgr.recordValidation("validate-step", failingResult, 2);

      const facts = mgr.getFactsByCategory("validation-fail");
      expect(facts).toHaveLength(1);
      expect(facts[0].content).toContain("Validation failed");

      const failures = mgr.getFailureHistory();
      expect(failures).toHaveLength(1);
      expect(failures[0].stepName).toBe("validate-step");
      expect(failures[0].attempt).toBe(2);
      expect(failures[0].validation).toBe(failingResult);
    });

    it("should not add to failure history for passing validations", () => {
      const mgr = new BlackboardManager();
      mgr.recordValidation("step", passingResult);
      expect(mgr.getFailureHistory()).toHaveLength(0);
    });

    it("should accumulate multiple failures", () => {
      const mgr = new BlackboardManager();
      mgr.recordValidation("step", failingResult, 1);
      mgr.recordValidation("step", failingResult, 2);
      mgr.recordValidation("step", failingResult, 3);

      expect(mgr.getFailureHistory()).toHaveLength(3);
    });
  });

  describe("step timings", () => {
    it("should record start and end times", () => {
      const mgr = new BlackboardManager();
      mgr.recordStepStart("step1");
      mgr.recordStepEnd("step1");

      const timings = mgr.getStepTimings();
      const timing = timings.get("step1");
      expect(timing).toBeDefined();
      expect(timing!.startedAt).toBeGreaterThan(0);
      expect(timing!.durationMs).toBeDefined();
      expect(timing!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should handle end without start gracefully", () => {
      const mgr = new BlackboardManager();
      mgr.recordStepEnd("unknown");
      expect(mgr.getStepTimings().has("unknown")).toBe(false);
    });
  });

  describe("getSnapshot", () => {
    it("should return a complete snapshot", () => {
      const mgr = new BlackboardManager();
      mgr.recordStepOutput("s1", "out1");
      mgr.recordStepStart("s1");
      mgr.recordStepEnd("s1");

      const failResult: ValidationResult = {
        passed: false,
        summary: "failed",
        failedChecks: [{ name: "check1", message: "msg" }],
      };
      mgr.recordValidation("s1", failResult);

      const snapshot = mgr.getSnapshot();
      expect(snapshot.facts.length).toBeGreaterThan(0);
      expect(snapshot.stepOutputs).toEqual({ s1: "out1" });
      expect(snapshot.failures).toHaveLength(1);
      expect(snapshot.stepTimings.s1).toBeDefined();
      expect(snapshot.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("getFactsByCategory", () => {
    it("should filter facts by category", () => {
      const mgr = new BlackboardManager();
      mgr.recordStepOutput("s1", "out");
      mgr.recordValidation("s1", {
        passed: true,
        summary: "ok",
        failedChecks: [],
      });

      expect(mgr.getFactsByCategory("step-output")).toHaveLength(1);
      expect(mgr.getFactsByCategory("validation-pass")).toHaveLength(1);
      expect(mgr.getFactsByCategory("nonexistent")).toHaveLength(0);
    });
  });
});
