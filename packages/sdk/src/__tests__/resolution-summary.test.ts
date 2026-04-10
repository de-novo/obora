import { describe, expect, it } from "vitest";

import { buildBindingPreview, buildOutputPreview, buildResolutionSummary } from "../resolution-summary.js";

describe("resolution-summary", () => {
  it("prefers env model source over config when env LLM is selected", () => {
    process.env.OPENAI_API_KEY="***";
    process.env.OPENAI_MODEL = "gpt-4o-mini";

    const summary = buildResolutionSummary(
      {},
      {
        provider: "openai",
        apiKey: "***",
        model: "gpt-4o-mini",
      },
      {
        defaults: {
          provider: "openai",
          model: "gpt-4o-mini",
        },
        providers: {
          openai: {},
        },
      },
    );

    expect(summary.authSource).toBe("env(OPENAI_API_KEY)");
    expect(summary.modelSource).toBe("env(OPENAI_MODEL)");
    expect(summary.chosenByPrecedence).toBe("env > config");

    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  });

  it("keeps config model source when config selected without env override", () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;

    const summary = buildResolutionSummary(
      {},
      {
        provider: "openai",
        apiKey: "config-key",
        model: "gpt-4o-mini",
      },
      {
        defaults: {
          provider: "openai",
          model: "gpt-4o-mini",
        },
        providers: {
          openai: {},
        },
      },
    );

    expect(summary.modelSource).toBe("config.defaults.model");
    expect(summary.chosenByPrecedence).toBe("config > env");
  });

  it("builds previews for judge-mode one-file workflow steps", () => {
    const workflow = {
      steps: [
        {
          name: "judge",
          config: {
            judge: {
              enabled: true,
              provider: "openai",
              model: "gpt-4o-mini",
              input_json: "artifacts/submission.json",
              input_schema: "artifacts/submission.schema.json",
              output_path: "artifacts/result.json",
              output_schema: "artifacts/result.schema.json",
            },
          },
        },
      ],
    };

    expect(buildBindingPreview(workflow, "/tmp/nonexistent-preview-root")).toEqual([
      {
        stepName: "judge",
        bindingName: "input",
        path: "artifacts/submission.json",
        kind: "json",
        resolved: false,
        required: true,
      },
      {
        stepName: "judge",
        bindingName: "schema",
        path: "artifacts/submission.schema.json",
        kind: "schema",
        resolved: false,
        required: true,
      },
    ]);

    expect(buildOutputPreview(workflow, "/tmp/nonexistent-preview-root")).toEqual([
      {
        stepName: "judge",
        path: "artifacts/result.json",
        schema: "artifacts/result.schema.json",
        pathResolved: false,
        schemaResolved: false,
      },
    ]);
  });
});
