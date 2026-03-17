import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import { Workflow } from "../workflow.js";

const WORKFLOW_PATH = fileURLToPath(
  new URL(
    "../../../../sandbox/21-tool-using-benchmark-mini/workflows/00-tool-using-benchmark-mini.yaml",
    import.meta.url
  )
);

describe("canonical sandbox 21 tool-using-benchmark-mini", () => {
  it("preserves the tool-dependent benchmark mini workflow contract", async () => {
    const workflow = await Workflow.fromYaml(WORKFLOW_PATH);

    expect(workflow.name).toBe("tool-using-benchmark-mini");
    expect(workflow.steps).toHaveLength(3);

    expect(workflow.steps[0]).toMatchObject({
      name: "solve-with-tool",
      agent: "solver",
      tools: ["file_list", "file_read", "file_write"],
    });

    expect(workflow.steps[1]).toMatchObject({
      name: "judge-tool-result",
      agent: "judge",
      depends_on: ["solve-with-tool"],
    });

    expect(workflow.steps[2]).toMatchObject({
      name: "archive-tool-benchmark",
      agent: "archivist",
      depends_on: ["judge-tool-result"],
    });

    const solveTask = String(workflow.steps[0]?.input?.task ?? "");
    const judgeTask = String(workflow.steps[1]?.input?.task ?? "");
    const archiveTask = String(workflow.steps[2]?.input?.task ?? "");

    expect(solveTask).toContain("Do not read any reference or answer key.");
    expect(solveTask).toContain(
      "use file_list on sandbox/21-tool-using-benchmark-mini/input/tool-data"
    );
    expect(solveTask).toContain("use file_read on the discovered JSON files");
    expect(solveTask).toContain("must explicitly mention both `file_list` and `file_read`");

    expect(judgeTask).toContain("PASS only when the attempt matches the reference answer");
    expect(judgeTask).toContain(
      "PASS only when the attempt explicitly says it used `file_list` and `file_read`."
    );
    expect(judgeTask).toContain("concrete observed evidence");

    expect(archiveTask).toContain("Tool Evidence");
    expect(archiveTask).toContain("tool-discovered benchmark reports");
  });
});
