import { describe, expect, it, vi } from "vitest";

import { ParallelScheduler } from "../execution/parallel-scheduler.js";
import type { WorkflowStep } from "../workflow.js";
import type { StepResult } from "../step-executor.js";

// ── buildExecutionPlan ─────────────────────────────────────────────────────

describe("ParallelScheduler", () => {
  describe("buildExecutionPlan", () => {
    it("returns sequential plan when no depends_on or parallel", () => {
      const scheduler = new ParallelScheduler();
      const steps: WorkflowStep[] = [
        { name: "a" },
        { name: "b" },
        { name: "c" },
      ];

      const plan = scheduler.buildExecutionPlan(steps);

      expect(plan.isParallel).toBe(false);
      expect(plan.layers).toEqual([[steps[0]], [steps[1]], [steps[2]]]);
    });

    it("groups independent steps into same layer when depends_on is used", () => {
      const scheduler = new ParallelScheduler();
      const steps: WorkflowStep[] = [
        { name: "start" },
        { name: "a", depends_on: ["start"] },
        { name: "b", depends_on: ["start"] },
        { name: "end", depends_on: ["a", "b"] },
      ];

      const plan = scheduler.buildExecutionPlan(steps);

      expect(plan.isParallel).toBe(true);
      expect(plan.layers.length).toBe(3);
      expect(plan.layers[0]!.map((s) => s.name)).toEqual(["start"]);
      expect(plan.layers[1]!.map((s) => s.name).sort()).toEqual(["a", "b"]);
      expect(plan.layers[2]!.map((s) => s.name)).toEqual(["end"]);
    });

    it("puts dependent steps in different layers", () => {
      const scheduler = new ParallelScheduler();
      const steps: WorkflowStep[] = [
        { name: "a" },
        { name: "b", depends_on: ["a"] },
        { name: "c", depends_on: ["b"] },
      ];

      const plan = scheduler.buildExecutionPlan(steps);

      expect(plan.isParallel).toBe(false); // no layer has >1 step
      expect(plan.layers.length).toBe(3);
      expect(plan.layers[0]!.map((s) => s.name)).toEqual(["a"]);
      expect(plan.layers[1]!.map((s) => s.name)).toEqual(["b"]);
      expect(plan.layers[2]!.map((s) => s.name)).toEqual(["c"]);
    });

    it("detects parallel groups as triggering parallel mode", () => {
      const scheduler = new ParallelScheduler();
      const steps: WorkflowStep[] = [
        {
          name: "research",
          parallel: [
            { agent: "researcher_a" },
            { agent: "researcher_b" },
          ],
          merge: "best_score",
        },
      ];

      const plan = scheduler.buildExecutionPlan(steps);
      // Even with 1 step, parallel groups should not break
      expect(plan.layers.length).toBe(1);
    });

    it("handles steps with no dependencies alongside dependent steps", () => {
      const scheduler = new ParallelScheduler();
      const steps: WorkflowStep[] = [
        { name: "independent" },
        { name: "start" },
        { name: "dependent", depends_on: ["start"] },
      ];

      const plan = scheduler.buildExecutionPlan(steps);

      expect(plan.isParallel).toBe(true);
      // independent and start both have no deps → layer 0
      // dependent depends on start → layer 1
      expect(plan.layers[0]!.map((s) => s.name).sort()).toEqual(["independent", "start"]);
      expect(plan.layers[1]!.map((s) => s.name)).toEqual(["dependent"]);
    });
  });

  // ── mergeResults ──────────────────────────────────────────────────────────

  describe("mergeResults", () => {
    const scheduler = new ParallelScheduler();

    it("concat strategy returns array of all outputs", () => {
      const results: StepResult[] = [
        { output: "result_a" },
        { output: "result_b" },
        { output: "result_c" },
      ];

      const merged = scheduler.mergeResults(results, "concat");

      expect(merged).toEqual(["result_a", "result_b", "result_c"]);
    });

    it("best_score picks output with highest score", () => {
      const results: StepResult[] = [
        { output: { text: "low", score: 0.3 } },
        { output: { text: "high", score: 0.9 } },
        { output: { text: "mid", score: 0.6 } },
      ];

      const merged = scheduler.mergeResults(results, "best_score");

      expect(merged).toEqual({ text: "high", score: 0.9 });
    });

    it("best_score falls back to first output when no scores", () => {
      const results: StepResult[] = [
        { output: "first" },
        { output: "second" },
      ];

      const merged = scheduler.mergeResults(results, "best_score");

      expect(merged).toBe("first");
    });

    it("first_success returns first output", () => {
      const results: StepResult[] = [
        { output: "first" },
        { output: "second" },
      ];

      const merged = scheduler.mergeResults(results, "first_success");

      expect(merged).toBe("first");
    });

    it("consensus returns most common output", () => {
      const results: StepResult[] = [
        { output: "option_a" },
        { output: "option_b" },
        { output: "option_a" },
      ];

      const merged = scheduler.mergeResults(results, "consensus");

      expect(merged).toBe("option_a");
    });

    it("consensus with all unique outputs picks first", () => {
      const results: StepResult[] = [
        { output: "a" },
        { output: "b" },
        { output: "c" },
      ];

      const merged = scheduler.mergeResults(results, "consensus");

      // All have count 1, first encountered wins
      expect(merged).toBe("a");
    });

    it("returns null for empty results", () => {
      expect(scheduler.mergeResults([], "concat")).toBeNull();
      expect(scheduler.mergeResults([], "best_score")).toBeNull();
      expect(scheduler.mergeResults([], "first_success")).toBeNull();
      expect(scheduler.mergeResults([], "consensus")).toBeNull();
    });
  });

  // ── executeParallelSteps ──────────────────────────────────────────────────

  describe("executeParallelSteps", () => {
    it("executes steps in parallel and returns all results", async () => {
      const scheduler = new ParallelScheduler(10);
      const steps: WorkflowStep[] = [
        { name: "a" },
        { name: "b" },
        { name: "c" },
      ];

      const executionOrder: string[] = [];
      const executeOne = vi.fn(async (step: WorkflowStep): Promise<StepResult> => {
        executionOrder.push(step.name);
        return { output: `result_${step.name}` };
      });

      const outcomes = await scheduler.executeParallelSteps(steps, executeOne);

      expect(outcomes.length).toBe(3);
      expect(outcomes.every((o) => o.status === "fulfilled")).toBe(true);
      expect(outcomes.map((o) => o.stepName)).toEqual(["a", "b", "c"]);
      expect(
        outcomes
          .filter((o) => o.status === "fulfilled")
          .map((o) => (o as { result: StepResult }).result.output),
      ).toEqual(["result_a", "result_b", "result_c"]);
    });

    it("respects maxConcurrency", async () => {
      const scheduler = new ParallelScheduler(2);
      const steps: WorkflowStep[] = [
        { name: "a" },
        { name: "b" },
        { name: "c" },
        { name: "d" },
      ];

      let activeConcurrency = 0;
      let maxObserved = 0;

      const executeOne = vi.fn(async (step: WorkflowStep): Promise<StepResult> => {
        activeConcurrency += 1;
        maxObserved = Math.max(maxObserved, activeConcurrency);
        // Simulate async work
        await new Promise((r) => setTimeout(r, 10));
        activeConcurrency -= 1;
        return { output: step.name };
      });

      const outcomes = await scheduler.executeParallelSteps(steps, executeOne);

      expect(outcomes.length).toBe(4);
      expect(maxObserved).toBeLessThanOrEqual(2);
    });

    it("continues on individual step failure (Promise.allSettled)", async () => {
      const scheduler = new ParallelScheduler(10);
      const steps: WorkflowStep[] = [
        { name: "success_a" },
        { name: "fail_b" },
        { name: "success_c" },
      ];

      const executeOne = vi.fn(async (step: WorkflowStep): Promise<StepResult> => {
        if (step.name === "fail_b") {
          throw new Error("Step B failed");
        }
        return { output: `result_${step.name}` };
      });

      const outcomes = await scheduler.executeParallelSteps(steps, executeOne);

      expect(outcomes.length).toBe(3);

      const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
      const rejected = outcomes.filter((o) => o.status === "rejected");

      expect(fulfilled.length).toBe(2);
      expect(rejected.length).toBe(1);
      expect(rejected[0]!.stepName).toBe("fail_b");
      expect(fulfilled.map((o) => o.stepName).sort()).toEqual(["success_a", "success_c"]);
    });

    it("handles all steps failing", async () => {
      const scheduler = new ParallelScheduler(10);
      const steps: WorkflowStep[] = [
        { name: "a" },
        { name: "b" },
      ];

      const executeOne = vi.fn(async (): Promise<StepResult> => {
        throw new Error("boom");
      });

      const outcomes = await scheduler.executeParallelSteps(steps, executeOne);

      expect(outcomes.every((o) => o.status === "rejected")).toBe(true);
    });
  });

  // ── maxConcurrency configuration ──────────────────────────────────────────

  describe("maxConcurrency", () => {
    it("defaults to 3", () => {
      const scheduler = new ParallelScheduler();
      expect(scheduler.maxConcurrency).toBe(3);
    });

    it("accepts custom value", () => {
      const scheduler = new ParallelScheduler(5);
      expect(scheduler.maxConcurrency).toBe(5);
    });

    it("clamps to minimum of 1", () => {
      const scheduler = new ParallelScheduler(0);
      expect(scheduler.maxConcurrency).toBe(1);

      const scheduler2 = new ParallelScheduler(-5);
      expect(scheduler2.maxConcurrency).toBe(1);
    });
  });
});
