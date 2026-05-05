import { describe, it, expect } from "vitest";
import { ParallelScheduler } from "../execution/parallel-scheduler.js";
import type { WorkflowStep } from "../workflow.js";

describe("Parallel Scheduler Performance", () => {
  const createSteps = (count: number): WorkflowStep[] =>
    Array.from({ length: count }, (_, i) => ({
      name: `step-${i}`,
      agent: "test-agent",
      input: { task: `task-${i}` },
    }));

  const scheduler = new ParallelScheduler(3);

  it("schedules independent steps sequentially when dependency metadata is absent", () => {
    const steps = createSteps(100);
    const start = performance.now();
    const plan = scheduler.buildExecutionPlan(steps);
    const duration = performance.now() - start;
    
    // No explicit deps -> preserve sequential ordering.
    expect(plan.isParallel).toBe(false);
    expect(plan.layers).toHaveLength(100);
    expect(duration).toBeLessThan(50);
  });

  it("schedules dependent steps into parallel layers", () => {
    // Create a diamond pattern: A → B,C → D
    const steps: WorkflowStep[] = [
      { name: "A", agent: "test", input: {} },
      { name: "B", agent: "test", input: {}, depends_on: ["A"] },
      { name: "C", agent: "test", input: {}, depends_on: ["A"] },
      { name: "D", agent: "test", input: {}, depends_on: ["B", "C"] },
    ];
    
    const start = performance.now();
    const plan = scheduler.buildExecutionPlan(steps);
    const duration = performance.now() - start;
    
    expect(plan.isParallel).toBe(true);
    expect(plan.layers).toHaveLength(3); // [A], [B,C], [D]
    expect(plan.layers[1]).toHaveLength(2); // B,C parallel
    expect(duration).toBeLessThan(10);
  });

  it("handles 50 steps with dependency chains efficiently", () => {
    const steps = createSteps(50).map((step, i) => ({
      ...step,
      depends_on: i > 0 ? [`step-${i - 1}`] : undefined,
    }));
    
    const start = performance.now();
    const plan = scheduler.buildExecutionPlan(steps);
    const duration = performance.now() - start;
    
    // Chain dependencies → no parallelism
    expect(plan.isParallel).toBe(false);
    expect(plan.layers).toHaveLength(50);
    expect(duration).toBeLessThan(50);
  });

  it("handles 100 steps with layered dependencies efficiently", () => {
    // Every 10th step depends on previous group
    const steps = createSteps(100).map((step, i) => ({
      ...step,
      depends_on: i >= 10 && i % 10 === 0 ? [`step-${i - 10}`] : undefined,
    }));
    
    const start = performance.now();
    const plan = scheduler.buildExecutionPlan(steps);
    const duration = performance.now() - start;
    
    expect(plan.isParallel).toBe(true);
    expect(plan.layers.length).toBeGreaterThan(1);
    expect(duration).toBeLessThan(100);
  });

  it("merges results efficiently", () => {
    const results = Array.from({ length: 100 }, (_, i) => ({
      output: { score: i, value: `result-${i}` },
    }));
    
    const start = performance.now();
    const merged = scheduler.mergeResults(results, "best_score");
    const duration = performance.now() - start;
    
    expect(merged).toEqual({ score: 99, value: "result-99" });
    expect(duration).toBeLessThan(50);
  });
});
