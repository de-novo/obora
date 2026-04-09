import { describe, expect, it } from "vitest";

import { buildResolutionSummary } from "../resolution-summary.js";

describe("resolution-summary", () => {
  it("prefers env model source over config when env LLM is selected", () => {
    process.env.OPENAI_API_KEY = "env-openai-key";
    process.env.OPENAI_MODEL = "gpt-4o-mini";

    const summary = buildResolutionSummary(
      {},
      {
        provider: "openai",
        apiKey: "env-openai-key",
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
});
