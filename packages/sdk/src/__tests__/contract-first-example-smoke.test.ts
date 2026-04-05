import { describe, expect, it } from "vitest";
import { join } from "node:path";

import { Workflow } from "../workflow.js";

describe("contract-first example smoke", () => {
  it("loads the canonical contract-first example and preserves its public authoring surface", async () => {
    const workflowPath = join(
      process.cwd(),
      "..",
      "..",
      "examples",
      "07-contract-first-evaluation",
      "workflow.yaml",
    );

    const workflow = await Workflow.fromYaml(workflowPath);

    expect(workflow.name).toBe("contract-first-evaluation");
    expect(workflow.steps).toHaveLength(1);

    const step = workflow.steps[0]!;
    expect(step.name).toBe("evaluate_submission");
    expect(step.agent).toBe("evaluator");

    expect(step.input).toMatchObject({
      bindings: {
        submission: {
          path: "artifacts/submission.json",
          kind: "json",
        },
        rubric: {
          path: "artifacts/rubric.json",
          kind: "json",
        },
      },
    });

    expect(step.input?.task).toContain("{{submission}}");
    expect(step.input?.task).toContain("{{rubric}}");
    expect(step.input?.task).toContain("Return JSON only");

    expect(step.output).toEqual({
      path: "artifacts/result.json",
      schema: "artifacts/result.schema.json",
    });
  });
});
