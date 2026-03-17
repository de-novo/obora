import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import { Workflow } from "../workflow.js";

const WORKFLOW_PATH = fileURLToPath(
  new URL("../../../../sandbox/07-project-loop/workflows/00-project-loop.yaml", import.meta.url)
);

describe("canonical sandbox 07 project-loop", () => {
  it("preserves the runtime-native project loop contract", async () => {
    const workflow = await Workflow.fromYaml(WORKFLOW_PATH);

    expect(workflow.name).toBe("project-loop");
    expect(workflow.steps).toHaveLength(4);

    expect(workflow.steps[0]).toMatchObject({ name: "build_or_repair", agent: "writer" });
    expect(workflow.steps[1]).toMatchObject({
      name: "review_project",
      agent: "reviewer",
      depends_on: ["build_or_repair"],
    });
    expect(workflow.steps[2]).toMatchObject({
      name: "validate_project",
      agent: "validator",
      depends_on: ["review_project"],
      on_fail: { goto: "build_or_repair", max_iterations: 1 },
    });
    expect(workflow.steps[3]).toMatchObject({
      name: "archive_project",
      agent: "archivist",
      depends_on: ["validate_project"],
    });

    const buildTask = String(workflow.steps[0]?.input?.task ?? "");
    const reviewTask = String(workflow.steps[1]?.input?.task ?? "");
    const validationTask = String(workflow.steps[2]?.input?.task ?? "");
    const archiveTask = String(workflow.steps[3]?.input?.task ?? "");

    expect(buildTask).toContain("If this is the first attempt");
    expect(buildTask).toContain("Use the injected repair context");
    expect(buildTask).toContain("Do not follow a fixed scripted stage narrative.");
    expect(reviewTask).toContain("This review is advisory context only");
    expect(validationTask).toContain('"passed": boolean');
    expect(validationTask).toContain("Next Action must direct build_or_repair");
    expect(archiveTask).toContain("runtime-native project loop");
  });
});
