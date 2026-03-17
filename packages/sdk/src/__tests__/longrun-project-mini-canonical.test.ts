import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import { Workflow } from "../workflow.js";

const WORKFLOW_PATH = fileURLToPath(
  new URL("../../../../sandbox/14-longrun-project-mini/workflows/00-longrun-project-mini.yaml", import.meta.url),
);

describe("canonical sandbox 14 longrun-project-mini", () => {
  it("preserves the longrun project mini workflow contract", async () => {
    const workflow = await Workflow.fromYaml(WORKFLOW_PATH);

    expect(workflow.name).toBe("longrun-project-mini");
    expect(workflow.steps).toHaveLength(4);

    expect(workflow.steps[0]).toMatchObject({ name: "draft-project", agent: "writer" });
    expect(workflow.steps[1]).toMatchObject({ name: "review-project", agent: "reviewer", depends_on: ["draft-project"] });
    expect(workflow.steps[2]).toMatchObject({ name: "validate-project", agent: "validator", depends_on: ["review-project"] });
    expect(workflow.steps[3]).toMatchObject({ name: "archive-project", agent: "archivist", depends_on: ["validate-project"] });

    const draftTask = String(workflow.steps[0]?.input?.task ?? "");
    const reviewTask = String(workflow.steps[1]?.input?.task ?? "");
    const validateTask = String(workflow.steps[2]?.input?.task ?? "");

    expect(draftTask).toContain("Project Summary");
    expect(reviewTask).toContain("Suggested Revisions");
    expect(validateTask).toContain("If all checklist items are satisfied, verdict should be PASS.");
  });
});
