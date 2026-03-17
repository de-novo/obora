import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import { Workflow } from "../workflow.js";

const WORKFLOW_PATH = fileURLToPath(
  new URL(
    "../../../../sandbox/17-multi-run-comparison-loop/workflows/00-multi-run-comparison-loop.yaml",
    import.meta.url
  )
);

describe("canonical sandbox 17 multi-run-comparison-loop", () => {
  it("preserves the runtime-native multi-run comparison remediation workflow contract", async () => {
    const workflow = await Workflow.fromYaml(WORKFLOW_PATH);

    expect(workflow.name).toBe("multi-run-comparison-loop");
    expect(workflow.steps).toHaveLength(6);

    expect(workflow.steps[0]).toMatchObject({ name: "solve-run-1", agent: "solver" });
    expect(workflow.steps[1]).toMatchObject({
      name: "solve-run-2",
      agent: "solver",
      depends_on: ["solve-run-1"],
    });
    expect(workflow.steps[2]).toMatchObject({
      name: "solve-run-3",
      agent: "solver",
      depends_on: ["solve-run-2"],
    });
    expect(workflow.steps[3]).toMatchObject({
      name: "compare_or_repair",
      agent: "comparator",
      depends_on: ["solve-run-1", "solve-run-2", "solve-run-3"],
    });
    expect(workflow.steps[4]).toMatchObject({
      name: "validate_comparison",
      agent: "validator",
      depends_on: ["compare_or_repair"],
      on_fail: { goto: "compare_or_repair", max_iterations: 1 },
    });
    expect(workflow.steps[5]).toMatchObject({
      name: "archive-comparison",
      agent: "archivist",
      depends_on: ["validate_comparison"],
    });

    const run2Task = String(workflow.steps[1]?.input?.task ?? "");
    const compareTask = String(workflow.steps[3]?.input?.task ?? "");
    const validationTask = String(workflow.steps[4]?.input?.task ?? "");
    const archiveTask = String(workflow.steps[5]?.input?.task ?? "");

    expect(run2Task).toContain("Intentionally provide an incorrect answer of 14");
    expect(compareTask).toContain("Overall Result should say PARTIAL");
    expect(compareTask).toContain("Identify the failing run IDs from the latest validation result");
    expect(compareTask).toContain(
      "write the repaired artifact to /Users/denovo/workspace/github/obora-kit/sandbox/17-multi-run-comparison-loop/output/iterations/results/04-run-2-repaired-result.json"
    );
    expect(validationTask).toContain("Failed Checks must identify the failing run IDs");
    expect(validationTask).toContain('"failedChecks": [{ "name": "string", "message": "string" }]');
    expect(archiveTask).toContain("Summary of Loop");
    expect(archiveTask).toContain("Final Comparison Result");
    expect(archiveTask).toContain("runtime-native compare_or_repair <-> validate_comparison loop");
  });
});
