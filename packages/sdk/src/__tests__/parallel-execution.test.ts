import { describe, expect, it, vi } from "vitest";

import { StepExecutor, type LLMAdapterLike } from "../step-executor.js";
import { ParallelScheduler } from "../execution/parallel-scheduler.js";
import type { WorkflowStep, MergeStrategy } from "../workflow.js";
import type { StepResult } from "../step-executor.js";

describe("Parallel execution integration", () => {
  function createMockExecutor(
    responseMap: Record<string, string>,
  ): { executor: StepExecutor; chatCompletion: ReturnType<typeof vi.fn> } {
    const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>(async (params) => {
      // Extract step name from user prompt
      const userMessage = params.messages.find((m) => m.role === "user");
      const content = typeof userMessage?.content === "string" ? userMessage.content : "";
      const stepMatch = content.match(/^Step: (\S+)/m);
      const stepName = stepMatch?.[1] ?? "unknown";
      const response = responseMap[stepName] ?? `response for ${stepName}`;
      return { message: { role: "assistant", content: response } };
    });

    const executor = new StepExecutor(
      { chatCompletion },
      new Map(),
      { model: "test-model" },
    );

    return { executor, chatCompletion };
  }

  it("executes two parallel steps via ParallelScheduler", async () => {
    const scheduler = new ParallelScheduler(10);

    const steps: WorkflowStep[] = [
      { name: "step_a", agent: "agent_a", input: { task: "Do A" } },
      { name: "step_b", agent: "agent_b", input: { task: "Do B" } },
    ];

    const { executor } = createMockExecutor({
      step_a: "result_a",
      step_b: "result_b",
    });

    const outputs: Record<string, unknown> = {};
    const outcomes = await scheduler.executeParallelSteps(
      steps,
      async (step) => {
        const result = await executor.executeStep(step, {
          previousOutputs: outputs,
        });
        outputs[step.name] = result.output;
        return result;
      },
    );

    expect(outcomes.length).toBe(2);
    expect(outcomes.every((o) => o.status === "fulfilled")).toBe(true);
    expect(outputs.step_a).toBe("result_a");
    expect(outputs.step_b).toBe("result_b");
  });

  it("one parallel step fails while others succeed", async () => {
    const scheduler = new ParallelScheduler(10);

    const steps: WorkflowStep[] = [
      { name: "good_step", agent: "agent_a", input: { task: "Do good" } },
      { name: "bad_step", agent: "agent_b", input: { task: "Do bad" } },
      { name: "another_good", agent: "agent_c", input: { task: "Do another" } },
    ];

    const { executor } = createMockExecutor({
      good_step: "good_result",
      another_good: "another_result",
    });

    // Override: make bad_step fail
    const originalExecuteStep = executor.executeStep.bind(executor);
    const executeStepSpy = vi.spyOn(executor, "executeStep").mockImplementation(
      async (step, context) => {
        if (step.name === "bad_step") {
          throw new Error("bad_step exploded");
        }
        return originalExecuteStep(step, context);
      },
    );

    const outcomes = await scheduler.executeParallelSteps(
      steps,
      async (step) => executor.executeStep(step, { previousOutputs: {} }),
    );

    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    const rejected = outcomes.filter((o) => o.status === "rejected");

    expect(fulfilled.length).toBe(2);
    expect(rejected.length).toBe(1);
    expect(rejected[0]!.stepName).toBe("bad_step");
    expect(fulfilled.map((o) => o.stepName).sort()).toEqual(["another_good", "good_step"]);

    executeStepSpy.mockRestore();
  });

  it("auto-detects parallel groups from depends_on", () => {
    const scheduler = new ParallelScheduler();

    const steps: WorkflowStep[] = [
      { name: "init" },
      { name: "frontend", depends_on: ["init"] },
      { name: "backend", depends_on: ["init"] },
      { name: "integrate", depends_on: ["frontend", "backend"] },
    ];

    const plan = scheduler.buildExecutionPlan(steps);

    expect(plan.isParallel).toBe(true);
    expect(plan.layers.length).toBe(3);
    // Layer 0: init
    expect(plan.layers[0]!.map((s) => s.name)).toEqual(["init"]);
    // Layer 1: frontend and backend (parallel)
    expect(plan.layers[1]!.map((s) => s.name).sort()).toEqual(["backend", "frontend"]);
    // Layer 2: integrate
    expect(plan.layers[2]!.map((s) => s.name)).toEqual(["integrate"]);
  });

  it("preserves sequential order when no depends_on", () => {
    const scheduler = new ParallelScheduler();

    const steps: WorkflowStep[] = [
      { name: "step1" },
      { name: "step2" },
      { name: "step3" },
    ];

    const plan = scheduler.buildExecutionPlan(steps);

    expect(plan.isParallel).toBe(false);
    // Each step is in its own layer
    expect(plan.layers.length).toBe(3);
    expect(plan.layers.map((l) => l[0]!.name)).toEqual(["step1", "step2", "step3"]);
  });

  // ── Merge strategy integration tests ──────────────────────────────────

  describe("merge strategies with real step outputs", () => {
    const scheduler = new ParallelScheduler();

    it("concat merges multiple outputs into array", () => {
      const results: StepResult[] = [
        { output: "Analysis from researcher A" },
        { output: "Analysis from researcher B" },
      ];

      const merged = scheduler.mergeResults(results, "concat");
      expect(merged).toEqual([
        "Analysis from researcher A",
        "Analysis from researcher B",
      ]);
    });

    it("best_score selects highest scoring research output", () => {
      const results: StepResult[] = [
        { output: { analysis: "shallow", score: 0.4 } },
        { output: { analysis: "deep", score: 0.95 } },
        { output: { analysis: "medium", score: 0.7 } },
      ];

      const merged = scheduler.mergeResults(results, "best_score") as Record<string, unknown>;
      expect(merged.analysis).toBe("deep");
      expect(merged.score).toBe(0.95);
    });

    it("first_success picks the first completed output", () => {
      const results: StepResult[] = [
        { output: "first completed" },
        { output: "second completed" },
      ];

      expect(scheduler.mergeResults(results, "first_success")).toBe("first completed");
    });

    it("consensus picks majority answer", () => {
      const results: StepResult[] = [
        { output: { answer: "TypeScript" } },
        { output: { answer: "TypeScript" } },
        { output: { answer: "Rust" } },
      ];

      const merged = scheduler.mergeResults(results, "consensus") as Record<string, unknown>;
      expect(merged.answer).toBe("TypeScript");
    });
  });

  // ── Explicit parallel branches ────────────────────────────────────────

  describe("explicit parallel branches on a step", () => {
    it("step with parallel branches creates correct structure", () => {
      const step: WorkflowStep = {
        name: "research",
        input: { task: "Research the topic" },
        parallel: [
          { agent: "researcher_a" },
          { agent: "researcher_b", input: { task: "Deep research" } },
        ],
        merge: "best_score",
      };

      expect(step.parallel).toHaveLength(2);
      expect(step.merge).toBe("best_score");
      expect(step.parallel![0]!.agent).toBe("researcher_a");
      expect(step.parallel![1]!.input?.task).toBe("Deep research");
    });
  });
});
