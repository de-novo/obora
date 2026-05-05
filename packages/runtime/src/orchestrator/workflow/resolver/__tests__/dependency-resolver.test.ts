import { describe, expect, it } from "vitest";

import type { Step, Workflow } from "../../types/workflow";
import {
  buildDependencyGraph,
  calculateExecutionLevels,
  detectCyclesDFS,
  generateExecutionPlan,
  getNextSteps,
  groupStepsByLevel,
  resolveTopologicalOrder,
  validateExecutionOrder,
} from "../dependency-resolver";

function step(name: string, overrides: Partial<Step> = {}): Step {
  return {
    name,
    agent: `${name}-agent`,
    ...overrides,
  };
}

function onFail(goto: string): Step["on_fail"] {
  return {
    goto,
    max_iterations: 2,
    escalate_on_exhaust: "fail",
    cooldown_ms: 0,
    reset_state: false,
    max_cost: null,
    max_cost_escalation: null,
  };
}

function workflow(steps: Step[]): Workflow {
  return { name: "runtime-plan", steps };
}

describe("dependency-resolver", () => {
  it("builds explicit and implicit dependencies from workflow steps", () => {
    const steps = [
      step("collect", { outputs: ["raw.json"] }),
      step("lint", { depends_on: ["collect"], outputs: ["lint.json"] }),
      step("report", { inputs: ["raw.json", "lint.json"] }),
    ];

    const graph = buildDependencyGraph(steps);

    expect(graph.nodes.get("collect")).toBe(steps[0]);
    expect(graph.edges).toEqual(
      new Map([
        ["collect", []],
        ["lint", ["collect"]],
        ["report", ["collect", "lint"]],
      ]),
    );
    expect(resolveTopologicalOrder(steps)).toEqual(["collect", "lint", "report"]);
    expect(calculateExecutionLevels(steps)).toEqual(
      new Map([
        ["collect", 0],
        ["lint", 1],
        ["report", 2],
      ]),
    );
  });

  it("groups parallelizable levels and generates execution plans with back-edge warnings", () => {
    const steps = [
      step("start"),
      step("review-a", { depends_on: ["start"], on_fail: onFail("start") }),
      step("review-b", { depends_on: ["start"], on_fail: onFail("start") }),
      step("publish", { depends_on: ["review-a", "review-b"] }),
    ];

    expect(groupStepsByLevel(steps)).toEqual([
      { level: 0, steps: [steps[0]], parallelizable: false },
      { level: 1, steps: [steps[1], steps[2]], parallelizable: true },
      { level: 2, steps: [steps[3]], parallelizable: false },
    ]);
    expect(generateExecutionPlan(workflow(steps))).toMatchObject({
      isValid: true,
      executionOrder: ["start", "review-a", "review-b", "publish"],
      backEdges: [
        { source: "review-a", target: "start" },
        { source: "review-b", target: "start" },
      ],
      warnings: ["Multiple back-edges point to 'start': review-a, review-b"],
    });
  });

  it("returns invalid plans and null topological order for cyclic workflows", () => {
    const steps = [
      step("a", { depends_on: ["b"] }),
      step("b", { depends_on: ["a"] }),
    ];

    expect(detectCyclesDFS(steps)).toMatchObject({ hasCycle: true });
    expect(resolveTopologicalOrder(steps)).toBeNull();
    expect(generateExecutionPlan(workflow(steps))).toMatchObject({
      isValid: false,
      executionOrder: [],
      stepGroups: [],
    });
  });

  it("finds next executable steps based on completed dependencies", () => {
    const current = workflow([
      step("collect"),
      step("lint", { depends_on: ["collect"] }),
      step("build", { depends_on: ["collect"] }),
      step("publish", { depends_on: ["lint", "build"] }),
    ]);

    expect(getNextSteps(current, new Set()).map((item) => item.name)).toEqual(["collect"]);
    expect(getNextSteps(current, new Set(["collect"])).map((item) => item.name)).toEqual(["lint", "build"]);
    expect(getNextSteps(current, new Set(["collect", "lint", "build"])).map((item) => item.name)).toEqual([
      "publish",
    ]);
  });

  it("validates order completeness, unknown steps, and dependency ordering", () => {
    const current = workflow([
      step("collect"),
      step("lint", { depends_on: ["collect"] }),
      step("publish", { depends_on: ["lint"] }),
    ]);

    expect(validateExecutionOrder(current, ["collect", "lint", "publish"])).toEqual({ valid: true, errors: [] });
    expect(validateExecutionOrder(current, ["lint", "collect", "unknown"])).toEqual({
      valid: false,
      errors: [
        "Step 'publish' is missing from execution order",
        "Execution order contains unknown step 'unknown'",
        "Step 'lint' comes before its dependency 'collect'",
      ],
    });
  });
});
