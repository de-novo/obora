import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import { Workflow } from "../workflow.js";

const WORKFLOW_PATH = fileURLToPath(
  new URL(
    "../../../../sandbox/16-multi-run-comparison-mini/workflows/00-multi-run-comparison-mini.yaml",
    import.meta.url
  )
);

describe("canonical sandbox 16 multi-run-comparison-mini", () => {
  it("preserves the multi-run comparison mini workflow contract", async () => {
    const workflow = await Workflow.fromYaml(WORKFLOW_PATH);

    expect(workflow.name).toBe("multi-run-comparison-mini");
    expect(workflow.steps).toHaveLength(5);

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
      name: "compare-runs",
      agent: "comparator",
      depends_on: ["solve-run-1", "solve-run-2", "solve-run-3"],
    });
    expect(workflow.steps[4]).toMatchObject({
      name: "archive-comparison",
      agent: "archivist",
      depends_on: ["compare-runs"],
    });

    const run1Task = String(workflow.steps[0]?.input?.task ?? "");
    const run2Task = String(workflow.steps[1]?.input?.task ?? "");
    const run3Task = String(workflow.steps[2]?.input?.task ?? "");
    const compareTask = String(workflow.steps[3]?.input?.task ?? "");

    expect(run1Task).toContain("Do not read any reference or answer key.");
    expect(run1Task).toContain("Write valid JSON only, without Markdown fences.");
    expect(run2Task).toContain("Do not read any reference or answer key.");
    expect(run2Task).toContain("Do not read any previous run result files.");
    expect(run3Task).toContain("Do not read any reference or answer key.");
    expect(run3Task).toContain("Do not read any previous run result files.");
    expect(run1Task).toContain('run_id must be "run-1".');
    expect(run2Task).toContain('run_id must be "run-2".');
    expect(run3Task).toContain('run_id must be "run-3".');
    expect(compareTask).toContain("Per-Run Snapshot");
    expect(compareTask).toContain("Best Run");
    expect(compareTask).toContain("Worst Run");
    expect(compareTask).toContain("Pass Rate");
    expect(compareTask).toContain(
      "Overall Result should say PASS if all runs passed, PARTIAL if some passed, or FAIL if none passed."
    );
  });
});
