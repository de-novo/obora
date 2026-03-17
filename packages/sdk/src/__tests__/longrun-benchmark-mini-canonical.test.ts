import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import { Workflow } from "../workflow.js";

const WORKFLOW_PATH = fileURLToPath(
  new URL("../../../../sandbox/12-longrun-benchmark-mini/workflows/00-longrun-benchmark-mini.yaml", import.meta.url),
);

describe("canonical sandbox 12 longrun-benchmark-mini", () => {
  it("preserves the longrun benchmark mini workflow contract", async () => {
    const workflow = await Workflow.fromYaml(WORKFLOW_PATH);

    expect(workflow.name).toBe("longrun-benchmark-mini");
    expect(workflow.steps).toHaveLength(3);

    expect(workflow.steps[0]).toMatchObject({
      name: "solve-problem",
      agent: "solver",
    });

    expect(workflow.steps[1]).toMatchObject({
      name: "judge-attempt",
      agent: "judge",
      depends_on: ["solve-problem"],
    });

    expect(workflow.steps[2]).toMatchObject({
      name: "archive-longrun-benchmark",
      agent: "archivist",
      depends_on: ["judge-attempt"],
    });

    const solveTask = String(workflow.steps[0]?.input?.task ?? "");
    const judgeTask = String(workflow.steps[1]?.input?.task ?? "");

    expect(solveTask).toContain("Do not read any reference or answer key.");
    expect(judgeTask).toContain("Verdict should say PASS or FAIL.");
    expect(judgeTask).toContain("If the attempt answer is 15 and the reasoning is consistent, verdict should be PASS.");
  });
});
