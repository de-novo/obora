import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import { Workflow } from "../workflow.js";

const WORKFLOW_PATH = fileURLToPath(
  new URL("../../../../sandbox/11-longrun-loop/workflows/00-longrun-loop.yaml", import.meta.url),
);

describe("canonical sandbox 11 longrun-loop", () => {
  it("preserves the strict validator contract required by the repair loop", async () => {
    const workflow = await Workflow.fromYaml(WORKFLOW_PATH);

    expect(workflow.name).toBe("longrun-loop");
    expect(workflow.steps).toHaveLength(3);

    expect(workflow.steps[0]).toMatchObject({
      name: "build-or-repair",
      agent: "writer",
      config: {
        repair_loop: {
          enabled: true,
          validation_step: "validate",
          max_no_progress_iterations: 1,
          repeated_critical_issue_ceiling: 1,
        },
      },
    });

    expect(workflow.steps[1]).toMatchObject({
      name: "validate",
      agent: "validator",
      depends_on: ["build-or-repair"],
      config: {
        validation: {
          enabled: true,
          emit_structured_result: true,
        },
      },
      on_fail: {
        goto: "build-or-repair",
        max_iterations: 1,
      },
    });

    const validateTask = String(workflow.steps[1]?.input?.task ?? "");
    expect(validateTask).toContain("assistant response must be ONLY a strict ValidationResult JSON object");
    expect(validateTask).toContain("Do not include markdown fences.");
    expect(validateTask).toContain("Do not include prose before or after the JSON.");
    expect(validateTask).toContain("Also write a human-readable report");
  });
});
