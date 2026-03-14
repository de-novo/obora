import { describe, expect, it } from "vitest";
import { join } from "node:path";

import { Workflow } from "../workflow.js";

describe("one-file research-loop workflow", () => {
  it("expands one-file research-loop YAML through Workflow.fromYaml", async () => {
    const fixturePath = join(process.cwd(), "src/__tests__/fixtures/one-file-research-loop.yaml");
    const workflow = await Workflow.fromYaml(fixturePath);

    expect(workflow.name).toBe("one-file-research-loop");
    expect(workflow.variables).toMatchObject({
      output_root: "./research-output",
      archive_enabled: true,
      research_goal: "Produce a bounded research conclusion.",
    });
    expect(workflow.steps).toHaveLength(3);
    expect(workflow.steps[0]).toMatchObject({
      name: "problem_frame",
      agent: "researcher",
    });
    expect(workflow.steps[1]).toMatchObject({
      name: "research",
      agent: "researcher",
      depends_on: ["problem_frame"],
    });
    expect(workflow.steps[2]).toMatchObject({
      name: "review",
      agent: "reviewer",
      depends_on: ["research"],
    });
    expect(
      Workflow.getStopSemantics({
        mode: "research-loop",
        loop: { max_iterations: 3 },
        output: { root: "./research-output" },
        archive: { enabled: true },
      }),
    ).toMatchObject({
      mode: "research-loop",
      thresholds: { max_iterations: 3 },
      output: { root: "./research-output" },
      archive: { enabled: true },
    });
  });
});
