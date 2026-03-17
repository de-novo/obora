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
  it("preserves the multi-run comparison remediation workflow contract", async () => {
    const workflow = await Workflow.fromYaml(WORKFLOW_PATH);

    expect(workflow.name).toBe("multi-run-comparison-loop");
    expect(workflow.steps).toHaveLength(9);

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
      name: "compare-initial-runs",
      agent: "comparator",
      depends_on: ["solve-run-1", "solve-run-2", "solve-run-3"],
    });
    expect(workflow.steps[4]).toMatchObject({
      name: "validate-comparison",
      agent: "validator",
      depends_on: ["compare-initial-runs"],
    });
    expect(workflow.steps[5]).toMatchObject({
      name: "repair-run-2",
      agent: "solver",
      depends_on: ["validate-comparison"],
    });
    expect(workflow.steps[6]).toMatchObject({
      name: "compare-repaired-runs",
      agent: "comparator",
      depends_on: ["repair-run-2"],
    });
    expect(workflow.steps[7]).toMatchObject({
      name: "validate-final-comparison",
      agent: "validator",
      depends_on: ["compare-repaired-runs"],
    });
    expect(workflow.steps[8]).toMatchObject({
      name: "archive-comparison",
      agent: "archivist",
      depends_on: ["validate-final-comparison"],
    });

    const run2Task = String(workflow.steps[1]?.input?.task ?? "");
    const initialCompareTask = String(workflow.steps[3]?.input?.task ?? "");
    const initialValidationTask = String(workflow.steps[4]?.input?.task ?? "");
    const repairTask = String(workflow.steps[5]?.input?.task ?? "");
    const finalCompareTask = String(workflow.steps[6]?.input?.task ?? "");
    const finalValidationTask = String(workflow.steps[7]?.input?.task ?? "");
    const archiveTask = String(workflow.steps[8]?.input?.task ?? "");

    expect(run2Task).toContain("Intentionally provide an incorrect answer of 14");
    expect(initialCompareTask).toContain("Overall Result should say PARTIAL");
    expect(initialCompareTask).toContain("Per-Run Snapshot");
    expect(initialValidationTask).toContain("Verdict must clearly say FAIL.");
    expect(initialValidationTask).toContain("repair run-2 and compare again");
    expect(repairTask).toContain('run_id must be "run-2-repaired".');
    expect(repairTask).toContain("repaired answer is 15");
    expect(finalCompareTask).toContain("Overall Result must say PASS.");
    expect(finalCompareTask).toContain("all listed runs passed");
    expect(finalValidationTask).toContain("Verdict must clearly say PASS.");
    expect(archiveTask).toContain("Summary of Loop");
    expect(archiveTask).toContain("Final Comparison Result");
    expect(archiveTask).toContain(
      "initial partial state, the repair action, and the final PASS state"
    );
  });
});
