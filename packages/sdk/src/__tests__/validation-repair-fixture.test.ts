import { describe, expect, it } from "vitest";
import { join } from "node:path";

import { loadFixture } from "../testing/index.js";

describe("validation-repair fixture", () => {
  it("loads validation-repair-loop fixture", async () => {
    const fixturePath = join(process.cwd(), "src/__tests__/fixtures/validation-repair-loop.yaml");
    const workflow = await loadFixture(fixturePath);

    expect(workflow.workflow.name).toBe("validation-repair-loop");
    expect(workflow.workflow.steps).toHaveLength(2);
    expect((workflow.workflow.steps[0] as any)?.config?.repair_loop).toMatchObject({
      enabled: true,
      validation_step: "validate",
      max_no_progress_iterations: 2,
      repeated_critical_issue_ceiling: 2,
    });
    expect((workflow.workflow.steps[1] as any)?.on_fail?.goto).toBe("build_or_repair");
  });
});
