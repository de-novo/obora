import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import { Workflow } from "../workflow.js";

const WORKFLOW_PATH = fileURLToPath(
  new URL("../../../../sandbox/15-longrun-project-loop/workflows/00-longrun-project-loop.yaml", import.meta.url),
);

describe("canonical sandbox 15 longrun-project-loop", () => {
  it("preserves the longrun project loop workflow contract", async () => {
    const workflow = await Workflow.fromYaml(WORKFLOW_PATH);

    expect(workflow.name).toBe("longrun-project-loop");
    expect(workflow.steps).toHaveLength(6);

    expect(workflow.steps[0]).toMatchObject({ name: "draft-project", agent: "writer" });
    expect(workflow.steps[1]).toMatchObject({ name: "review-project", agent: "reviewer", depends_on: ["draft-project"] });
    expect(workflow.steps[2]).toMatchObject({ name: "validate-project", agent: "validator", depends_on: ["review-project"] });
    expect(workflow.steps[3]).toMatchObject({ name: "repair-project", agent: "writer", depends_on: ["validate-project"] });
    expect(workflow.steps[4]).toMatchObject({ name: "validate-repaired-project", agent: "validator", depends_on: ["repair-project"] });
    expect(workflow.steps[5]).toMatchObject({ name: "archive-project", agent: "archivist", depends_on: ["validate-repaired-project"] });

    const draftTask = String(workflow.steps[0]?.input?.task ?? "");
    const reviewTask = String(workflow.steps[1]?.input?.task ?? "");
    const validationTask = String(workflow.steps[2]?.input?.task ?? "");
    const repairTask = String(workflow.steps[3]?.input?.task ?? "");
    const finalValidationTask = String(workflow.steps[4]?.input?.task ?? "");

    expect(draftTask).toContain("Intentionally omit Next Action so the first validation fails.");
    expect(reviewTask).toContain("Explicitly mention that Next Action is missing.");
    expect(validationTask).toContain("Verdict must clearly say FAIL.");
    expect(repairTask).toContain("Fix the validation failure.");
    expect(finalValidationTask).toContain("Verdict must clearly say PASS.");
  });
});
