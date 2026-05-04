import { describe, expect, it } from "vitest";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { loadFixture } from "../testing/index.js";
import type { WorkflowStep } from "../workflow.js";

describe("validation-repair fixture", () => {
  it("loads validation-repair-loop fixture", async () => {
    const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "fixtures/validation-repair-loop.yaml");
    const fixture = await loadFixture(fixturePath);

    expect(typeof fixture.workflow).not.toBe("string");
    if (typeof fixture.workflow === "string") {
      throw new Error("Expected inline workflow fixture");
    }

    expect(fixture.workflow.name).toBe("validation-repair-loop");
    expect(fixture.workflow.steps).toHaveLength(2);
    const [buildStep, validateStep] = fixture.workflow.steps as [WorkflowStep, WorkflowStep];
    expect(buildStep.config?.repair_loop).toMatchObject({
      enabled: true,
      validation_step: "validate",
      max_no_progress_iterations: 2,
      repeated_critical_issue_ceiling: 2,
    });
    expect(validateStep.on_fail?.goto).toBe("build_or_repair");
  });
});
