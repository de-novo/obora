import { describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { Workflow } from "../workflow.js";

describe("one-file validation-repair workflow", () => {
  it("expands one-file validation-repair YAML through Workflow.fromYaml", async () => {
    const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "fixtures/one-file-validation-repair.yaml");
    const workflow = await Workflow.fromYaml(fixturePath);

    expect(workflow.name).toBe("one-file-validation-repair");
    expect(workflow.variables).toMatchObject({
      output_root: "./tmp-output",
      archive_enabled: true,
    });
    expect(workflow.steps).toHaveLength(2);
    expect(workflow.steps[0]).toMatchObject({
      name: "build_or_repair",
      agent: "builder",
      config: {
        repair_loop: {
          enabled: true,
          validation_step: "validate",
          max_no_progress_iterations: 2,
          repeated_critical_issue_ceiling: 2,
        },
      },
      input: { task: "Repair the artifact.\n\nPrefer minimal edits first." },
    });
    expect(workflow.steps[1]).toMatchObject({
      name: "validate",
      agent: "validator",
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
      input: { task: "Validate and emit structured result.\n\nReturn only strict structured JSON." },
    });
  });
});
