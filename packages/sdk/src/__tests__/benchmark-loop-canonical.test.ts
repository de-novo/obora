import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import { Workflow } from "../workflow.js";

const WORKFLOW_PATH = fileURLToPath(
  new URL("../../../../sandbox/09-benchmark-loop/workflows/00-benchmark-loop.yaml", import.meta.url)
);

describe("canonical sandbox 09 benchmark-loop", () => {
  it("preserves the runtime-native benchmark loop contract", async () => {
    const workflow = await Workflow.fromYaml(WORKFLOW_PATH);

    expect(workflow.name).toBe("benchmark-loop");
    expect(workflow.steps).toHaveLength(3);

    expect(workflow.steps[0]).toMatchObject({ name: "solve_or_repair", agent: "solver" });
    expect(workflow.steps[1]).toMatchObject({
      name: "judge",
      agent: "judge",
      depends_on: ["solve_or_repair"],
      on_fail: { goto: "solve_or_repair", max_iterations: 1 },
    });
    expect(workflow.steps[2]).toMatchObject({
      name: "archive-benchmark-loop",
      agent: "archivist",
      depends_on: ["judge"],
    });

    const solveTask = String(workflow.steps[0]?.input?.task ?? "");
    const judgeTask = String(workflow.steps[1]?.input?.task ?? "");
    const archiveTask = String(workflow.steps[2]?.input?.task ?? "");

    expect(solveTask).toContain("Intentionally provide an incorrect final answer of 8");
    expect(solveTask).toContain("Use the injected repair context");
    expect(judgeTask).toContain('"failedChecks": [{ "name": "string", "message": "string" }]');
    expect(judgeTask).toContain("If the answer is still incorrect");
    expect(archiveTask).toContain("runtime-native solve_or_repair <-> judge");
  });
});
