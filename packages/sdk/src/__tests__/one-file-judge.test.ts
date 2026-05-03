import { describe, expect, it } from "vitest";
import { join } from "node:path";

import { Workflow } from "../workflow.js";

describe("one-file judge workflow", () => {
  it("expands one-file judge YAML through Workflow.fromYaml", async () => {
    const fixturePath = join(process.cwd(), "packages/sdk/src/__tests__/fixtures/one-file-judge.yaml");
    const workflow = await Workflow.fromYaml(fixturePath);

    expect(workflow.name).toBe("one-file-judge");
    expect(workflow.variables).toMatchObject({
      judge_input_json: "artifacts/submission.json",
      judge_input_schema: "artifacts/submission.schema.json",
      judge_output_path: "artifacts/result.json",
      judge_output_schema: "artifacts/result.schema.json",
      judge_mode: true,
    });
    expect(workflow.steps).toHaveLength(1);
    expect(workflow.steps[0]).toMatchObject({
      name: "judge",
      agent: "judge",
      input: { task: "Evaluate the input and return JSON.\n" },
      config: {
        judge: {
          enabled: true,
          provider: "zai",
          model: "zai/glm-5-turbo",
          input_json: "artifacts/submission.json",
          input_schema: "artifacts/submission.schema.json",
          output_path: "artifacts/result.json",
          output_schema: "artifacts/result.schema.json",
          repair: false,
          fallback: false,
        },
      },
    });
    expect(
      Workflow.getStopSemantics({
        mode: "judge",
        input: { json: "artifacts/submission.json", schema: "artifacts/submission.schema.json" },
        output: { path: "artifacts/result.json", schema: "artifacts/result.schema.json" },
        options: { repair: false, fallback: false },
      }),
    ).toMatchObject({
      mode: "judge",
      input: { json: "artifacts/submission.json", schema: "artifacts/submission.schema.json" },
      output: { path: "artifacts/result.json", schema: "artifacts/result.schema.json" },
      options: { repair: false, fallback: false },
    });
  });
});
