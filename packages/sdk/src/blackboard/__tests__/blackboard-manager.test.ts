import { describe, it, expect, vi } from "vitest";
import { BlackboardManager } from "../blackboard-manager.js";
import type { ValidationResult } from "../../validation-repair.js";
import { BoardBlackboard } from "@obora/runtime";

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
      expect(facts[0]!.category).toBe("step-output");
      expect(facts[0]!.tags).toContain("step1");
      expect(facts[1]!.tags).toContain("step2");
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
      expect(facts[0]!.content).toContain("Validation passed");
    });

    it("should record failing validation as a fact and a failure entry", () => {
      const mgr = new BlackboardManager();
      mgr.recordValidation("validate-step", failingResult, 2);

      const facts = mgr.getFactsByCategory("validation-fail");
      expect(facts).toHaveLength(1);
      expect(facts[0]!.content).toContain("Validation failed");

      const failures = mgr.getFailureHistory();
      expect(failures).toHaveLength(1);
      expect(failures[0]!.stepName).toBe("validate-step");
      expect(failures[0]!.attempt).toBe(2);
      expect(failures[0]!.validation).toBe(failingResult);
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

  describe("Runtime Blackboard integration", () => {
    it("should expose the underlying Runtime Blackboard", () => {
      const mgr = new BlackboardManager({ sessionId: "board-test" });
      expect(mgr.board).toBeInstanceOf(BoardBlackboard);
    });

    it("should pass sessionId to the Runtime Blackboard", () => {
      const mgr = new BlackboardManager({ sessionId: "my-session" });
      expect(mgr.board.sessionId).toBe("my-session");
    });

    it("should dual-write step outputs to the board", () => {
      const mgr = new BlackboardManager();
      mgr.recordStepOutput("plan", { title: "My Plan" });

      const stored = mgr.board.read("state.context.stepOutputs.plan", { strict: false });
      expect(stored).toBeDefined();
      expect((stored as { type: string }).type).toBe("step_output");
      expect((stored as { content: unknown }).content).toEqual({ title: "My Plan" });
    });

    it("should dual-write validations to the board", () => {
      const mgr = new BlackboardManager();
      const result: ValidationResult = {
        passed: false,
        summary: "Type errors",
        failedChecks: [{ name: "typecheck", message: "errors" }],
      };
      mgr.recordValidation("build", result, 2);

      const stored = mgr.board.read("state.context.validations.build.attempt_2", { strict: false });
      expect(stored).toBeDefined();
      expect((stored as { validation: ValidationResult }).validation.passed).toBe(false);
    });

    it("should dual-write timings to the board", () => {
      const mgr = new BlackboardManager();
      mgr.recordStepStart("step1");

      const startStored = mgr.board.read("state.context.timings.step1", { strict: false });
      expect(startStored).toBeDefined();
      expect((startStored as { startedAt: number }).startedAt).toBeGreaterThan(0);

      mgr.recordStepEnd("step1");

      const endStored = mgr.board.read("state.context.timings.step1", { strict: false });
      expect((endStored as { durationMs: number }).durationMs).toBeGreaterThanOrEqual(0);
    });

    it("should provide access to board section accessors", () => {
      const mgr = new BlackboardManager();
      expect(mgr.board.state).toBeDefined();
      expect(mgr.board.knowledge).toBeDefined();
      expect(mgr.board.decisions).toBeDefined();
    });

    it("should support board event subscriptions", () => {
      const mgr = new BlackboardManager();
      const events: string[] = [];

      mgr.board.on("state.updated", (event: unknown) => {
        events.push((event as { path: string }).path);
      });

      mgr.recordStepOutput("step1", "output");

      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.includes("stepOutputs"))).toBe(true);
    });

    it("should support board snapshots", async () => {
      const mgr = new BlackboardManager();
      mgr.recordStepOutput("plan", "my plan");

      const snapshot = await mgr.board.createSnapshot();
      expect(snapshot).toBeDefined();
    });

    it("should increment board version on each write", () => {
      const mgr = new BlackboardManager();
      const v1 = mgr.board.version;

      mgr.recordStepOutput("s1", "out");
      expect(mgr.board.version).toBeGreaterThan(v1);

      const v2 = mgr.board.version;
      mgr.recordStepStart("s2");
      expect(mgr.board.version).toBeGreaterThan(v2);
    });
  });

  describe("shared memory snapshot", () => {
    it("exports persistent snapshot without transient step-output facts", () => {
      const mgr = new BlackboardManager({ sessionId: "persist-session" });
      mgr.recordStepOutput("plan", { title: "draft" });
      mgr.recordValidation("validate", {
        passed: false,
        summary: "backup restore failed",
        failedChecks: [{ name: "implementation_bug", message: "backup broken" }],
      });

      const snapshot = mgr.exportPersistentSnapshot("exec-1");

      expect(snapshot.knowledge.facts.every((fact) => fact.category !== "step-output")).toBe(true);
      expect(snapshot.knowledge.facts.some((fact) => fact.category === "validation-fail")).toBe(true);
      expect(snapshot.context.projectFacts.knownStepOutputs).toEqual(["plan"]);
    });

    it("imports shared-memory facts into local facts and runtime board", () => {
      const mgr = new BlackboardManager({ sessionId: "import-session" });
      const result = mgr.importPersistentSnapshot(
        {
          knowledge: {
            facts: [
              {
                id: "fact-1",
                content: "Reuse backup redesign insight",
                category: "lesson",
                tags: ["backup"],
                confidence: 0.9,
                createdAt: new Date().toISOString(),
              },
            ],
          },
          decisions: { history: [] },
          context: { projectFacts: { project: "obora" } },
        },
        { level: "project", key: "obora-kit" },
      );

      expect(result.importedFacts).toBe(1);
      expect(mgr.getFactsByCategory("shared-memory-import")).toHaveLength(1);
      const stored = mgr.board.read("state.context.sharedMemory.project.obora-kit", { strict: false });
      expect(stored).toBeDefined();
    });

    it("can record raw scope snapshots and import merged facts with provenance", () => {
      const mgr = new BlackboardManager({ sessionId: "import-session-merged" });
      const snapshot = {
        knowledge: {
          facts: [
            {
              id: "fact-1",
              content: "Use workflow guidance",
              category: "lesson",
              tags: ["workflow"],
              confidence: 0.95,
              createdAt: new Date().toISOString(),
            },
          ],
        },
        decisions: { history: [] },
        context: { projectFacts: { owner: "workflow" } },
      };

      mgr.recordSharedMemorySnapshot(snapshot, { level: "global", key: "global" });
      mgr.importPersistentSnapshot(snapshot, { level: "workflow", key: "merged" }, {
        factSources: { "fact-1": { level: "workflow", key: "build-app" } },
        storeSnapshot: false,
      });

      const imported = mgr.getFactsByCategory("shared-memory-import");
      expect(imported).toHaveLength(1);
      expect(imported[0]?.id).toBe("shared:workflow:build-app:fact-1");
      expect(imported[0]?.tags).toContain("build-app");
      expect(mgr.board.read("state.context.sharedMemory.global.global", { strict: false })).toEqual(snapshot);
      expect(mgr.board.read("state.context.sharedMemory.workflow.merged", { strict: false })).toBeUndefined();
    });
  });
});
