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
  it("preserves the runtime-native cyclic convergence workflow contract", async () => {
    const workflow = await Workflow.fromYaml(WORKFLOW_PATH);

    expect(workflow.name).toBe("longrun-feedback-convergence-loop");
    expect(workflow.steps).toHaveLength(3);

    expect(workflow.steps[0]).toMatchObject({
      name: "build_or_repair",
      agent: "planner",
      config: {
        repair_loop: {
          enabled: true,
          validation_step: "validate",
          max_no_progress_iterations: 2,
          repeated_critical_issue_ceiling: 2,
        },
      },
    });
    expect(workflow.steps[1]).toMatchObject({
      name: "validate",
      agent: "evaluator",
      depends_on: ["build_or_repair"],
      config: {
        validation: {
          enabled: true,
          emit_structured_result: true,
        },
      },
      on_fail: {
        goto: "build_or_repair",
        max_iterations: 4,
      },
    });
    expect(workflow.steps[2]).toMatchObject({
      name: "archive-convergence",
      agent: "archivist",
      depends_on: ["validate"],
    });

    const buildTask = String(workflow.steps[0]?.input?.task ?? "");
    const validateTask = String(workflow.steps[1]?.input?.task ?? "");
    const archiveTask = String(workflow.steps[2]?.input?.task ?? "");

    expect(buildTask).toContain("Use the injected repair context");
    expect(buildTask).toContain("latestValidation");
    expect(buildTask).toContain("previousValidationResults");
    expect(buildTask).toContain("Do not follow a fixed stage script");
    expect(buildTask).toContain("Feedback applied from latest validation:");

    expect(validateTask).toContain("PASS only when score >= 9");
    expect(validateTask).toContain(
      "the runtime should use your structured result to re-enter build_or_repair"
    );
    expect(validateTask).toContain("ValidationResult JSON object");
    expect(validateTask).toContain('"threshold-met"');
    expect(validateTask).toContain('"missing:" followed by the failed check IDs');

    expect(archiveTask).toContain("Summary of Convergence");
    expect(archiveTask).toContain("Score Trajectory");
    expect(archiveTask).toContain("runtime-native cyclic feedback loop");
    expect(archiveTask).toContain("Do not hard-code any score sequence");
  });
});
