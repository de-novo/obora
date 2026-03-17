import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import { Workflow } from "../workflow.js";

const WORKFLOW_PATH = fileURLToPath(
  new URL(
    "../../../../sandbox/20-longrun-feedback-convergence-loop/workflows/00-longrun-feedback-convergence-loop.yaml",
    import.meta.url
  )
);

describe("canonical sandbox 20 longrun-feedback-convergence-loop", () => {
  it("preserves the repeated evaluation-driven convergence workflow contract", async () => {
    const workflow = await Workflow.fromYaml(WORKFLOW_PATH);

    expect(workflow.name).toBe("longrun-feedback-convergence-loop");
    expect(workflow.steps).toHaveLength(9);

    expect(workflow.steps[0]).toMatchObject({ name: "produce-v1", agent: "planner" });
    expect(workflow.steps[1]).toMatchObject({
      name: "evaluate-v1",
      agent: "evaluator",
      depends_on: ["produce-v1"],
    });
    expect(workflow.steps[2]).toMatchObject({
      name: "revise-v2",
      agent: "reviser",
      depends_on: ["evaluate-v1"],
    });
    expect(workflow.steps[3]).toMatchObject({
      name: "evaluate-v2",
      agent: "evaluator",
      depends_on: ["revise-v2"],
    });
    expect(workflow.steps[4]).toMatchObject({
      name: "revise-v3",
      agent: "reviser",
      depends_on: ["evaluate-v2"],
    });
    expect(workflow.steps[5]).toMatchObject({
      name: "evaluate-v3",
      agent: "evaluator",
      depends_on: ["revise-v3"],
    });
    expect(workflow.steps[6]).toMatchObject({
      name: "revise-v4",
      agent: "reviser",
      depends_on: ["evaluate-v3"],
    });
    expect(workflow.steps[7]).toMatchObject({
      name: "evaluate-v4",
      agent: "evaluator",
      depends_on: ["revise-v4"],
    });
    expect(workflow.steps[8]).toMatchObject({
      name: "archive-convergence",
      agent: "archivist",
      depends_on: ["evaluate-v4"],
    });

    const produceTask = String(workflow.steps[0]?.input?.task ?? "");
    const evalV1Task = String(workflow.steps[1]?.input?.task ?? "");
    const reviseV2Task = String(workflow.steps[2]?.input?.task ?? "");
    const reviseV3Task = String(workflow.steps[4]?.input?.task ?? "");
    const reviseV4Task = String(workflow.steps[6]?.input?.task ?? "");
    const evalV4Task = String(workflow.steps[7]?.input?.task ?? "");
    const archiveTask = String(workflow.steps[8]?.input?.task ?? "");

    expect(produceTask).toContain("Explicitly satisfy only rubric checks C1, C2, C3, and C4");
    expect(produceTask).toContain("Do not mention or satisfy C5 through C10");

    expect(evalV1Task).toContain("Score equals the count of passed checks");
    expect(evalV1Task).toContain("Under Score, put the score on its own line in the form N/10");

    expect(reviseV2Task).toContain("Add rubric checks C5 and C6");
    expect(reviseV2Task).toContain("Feedback applied from 02-eval-v1:");
    expect(reviseV2Task).toContain("include exactly six bullets labeled C1 through C6");

    expect(reviseV3Task).toContain("Add rubric checks C7 and C8");
    expect(reviseV3Task).toContain("Do not mention or satisfy C9 or C10 yet");
    expect(reviseV3Task).toContain("Feedback applied from 04-eval-v2:");

    expect(reviseV4Task).toContain("Add rubric checks C9 and C10");
    expect(reviseV4Task).toContain("Feedback applied from 06-eval-v3:");
    expect(reviseV4Task).toContain("ready to stop because the threshold has been reached");

    expect(evalV4Task).toContain("Final score must be at least 9/10");
    expect(evalV4Task).toContain(
      "the threshold was reached and the convergence loop can be archived"
    );

    expect(archiveTask).toContain("Summary of Convergence");
    expect(archiveTask).toContain("Score Trajectory");
    expect(archiveTask).toContain("sequence 4 -> 6 -> 8 -> 10");
  });
});
