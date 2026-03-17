import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import { Workflow } from "../workflow.js";

const WORKFLOW_PATH = fileURLToPath(
  new URL("../../../../sandbox/13-longrun-benchmark-loop/workflows/00-longrun-benchmark-loop.yaml", import.meta.url),
);

describe("canonical sandbox 13 longrun-benchmark-loop", () => {
  it("preserves the longrun benchmark loop workflow contract", async () => {
    const workflow = await Workflow.fromYaml(WORKFLOW_PATH);

    expect(workflow.name).toBe("longrun-benchmark-loop");
    expect(workflow.steps).toHaveLength(5);

    expect(workflow.steps[0]).toMatchObject({ name: "solve-initial", agent: "solver" });
    expect(workflow.steps[1]).toMatchObject({ name: "judge-initial", agent: "judge", depends_on: ["solve-initial"] });
    expect(workflow.steps[2]).toMatchObject({ name: "repair-attempt", agent: "solver", depends_on: ["judge-initial"] });
    expect(workflow.steps[3]).toMatchObject({ name: "judge-repaired", agent: "judge", depends_on: ["repair-attempt"] });
    expect(workflow.steps[4]).toMatchObject({ name: "archive-longrun-benchmark-loop", agent: "archivist", depends_on: ["judge-repaired"] });

    const initialTask = String(workflow.steps[0]?.input?.task ?? "");
    const initialJudgeTask = String(workflow.steps[1]?.input?.task ?? "");
    const repairTask = String(workflow.steps[2]?.input?.task ?? "");
    const finalJudgeTask = String(workflow.steps[3]?.input?.task ?? "");

    expect(initialTask).toContain("Intentionally provide an incorrect answer of 10");
    expect(initialJudgeTask).toContain("Verdict must clearly say FAIL.");
    expect(repairTask).toContain("The repaired answer should be 12.");
    expect(finalJudgeTask).toContain("Verdict must clearly say PASS.");
  });
});
