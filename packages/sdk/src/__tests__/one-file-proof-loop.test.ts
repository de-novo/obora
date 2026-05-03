import { describe, expect, it } from "vitest";
import { join } from "node:path";

import { Workflow } from "../workflow.js";

describe("one-file proof-loop workflow", () => {
  it("expands one-file proof-loop YAML through Workflow.fromYaml", async () => {
    const fixturePath = join(process.cwd(), "packages/sdk/src/__tests__/fixtures/one-file-proof-loop.yaml");
    const workflow = await Workflow.fromYaml(fixturePath);

    expect(workflow.name).toBe("one-file-proof-loop");
    expect(workflow.variables).toMatchObject({
      output_root: "./proof-output",
      archive_enabled: true,
      proof_goal: "Produce a bounded proof-search conclusion.",
    });
    expect(workflow.steps).toHaveLength(4);
    expect(workflow.steps[0]).toMatchObject({ name: "problem_frame", agent: "framer" });
    expect(workflow.steps[1]).toMatchObject({
      name: "known_results_audit",
      agent: "framer",
      depends_on: ["problem_frame"],
    });
    expect(workflow.steps[2]).toMatchObject({
      name: "proof_attempt",
      agent: "prover",
      depends_on: ["known_results_audit"],
    });
    expect(workflow.steps[3]).toMatchObject({
      name: "review",
      agent: "reviewer",
      depends_on: ["proof_attempt"],
    });
    expect(
      Workflow.getStopSemantics({
        mode: "proof-loop",
        loop: { max_iterations: 3 },
        output: { root: "./proof-output" },
        archive: { enabled: true },
      }),
    ).toMatchObject({
      mode: "proof-loop",
      thresholds: { max_iterations: 3 },
      output: { root: "./proof-output" },
      archive: { enabled: true },
    });
  });
});
