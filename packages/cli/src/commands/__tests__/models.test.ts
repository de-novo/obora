/* eslint-disable import/order */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@obora/adapters", () => ({
  listPiAIProviders: vi.fn(() => ["openai", "anthropic"]),
  listPiAIModels: vi.fn((provider: string) => {
    if (provider === "openai") {
      return ["gpt-4o-mini", "gpt-4o", "gpt-5"];
    }
    if (provider === "anthropic") {
      return ["claude-3-7-sonnet-20250219"];
    }
    throw new Error(`Unsupported provider: ${provider}`);
  }),
}));

vi.mock("../../utils/formatter.js", () => ({
  formatter: {
    success: vi.fn(),
    json: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    step: vi.fn(),
  },
}));

vi.mock("../../utils/error-handler.js", () => ({
  handleCommandAction: vi.fn(async (fn: () => Promise<void>) => {
    await fn();
  }),
}));

vi.mock("../../utils/global-opts.js", () => ({
  getGlobalOpts: vi.fn(() => ({})),
}));

import { listPiAIModels, listPiAIProviders } from "@obora/adapters";

import { formatter } from "../../utils/formatter.js";
import { createModelsCommand, runModels } from "../models.js";

describe("models command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates models command with correct name", () => {
    const cmd = createModelsCommand();
    expect(cmd.name()).toBe("models");
  });

  it("prints provider list in json mode when no provider is specified", async () => {
    await runModels(undefined, undefined, { json: true });

    expect(formatter.json).toHaveBeenCalledWith({
      source: "pi-ai",
      providers: [
        { provider: "openai", count: 3 },
        { provider: "anthropic", count: 1 },
      ],
    });
  });

  it("prints model list for a specific provider in text mode", async () => {
    await runModels("openai", undefined, {});

    expect(formatter.info).toHaveBeenCalledWith("Obora models");
    expect(formatter.step).toHaveBeenCalledWith("Source: pi-ai");
    expect(formatter.step).toHaveBeenCalledWith("Provider: openai");
    expect(formatter.step).toHaveBeenCalledWith("Model count: 3");
    expect(formatter.step).toHaveBeenCalledWith("gpt-4o-mini");
    expect(formatter.step).toHaveBeenCalledWith("gpt-4o");
    expect(formatter.step).toHaveBeenCalledWith("gpt-5");
  });

  it("prints model list for a specific provider in json mode", async () => {
    await runModels("anthropic", undefined, { json: true });

    expect(formatter.json).toHaveBeenCalledWith({
      source: "pi-ai",
      provider: "anthropic",
      count: 1,
      models: ["claude-3-7-sonnet-20250219"],
    });
  });

  it("throws a helpful error for unsupported providers", async () => {
    await expect(runModels("unknown-provider", undefined, {})).rejects.toThrow(
      "Unsupported provider 'unknown-provider'. Supported providers: openai, anthropic"
    );
  });

  it("queries pi-ai provider catalog helpers", async () => {
    await runModels("openai", undefined, {});

    expect(listPiAIProviders).toHaveBeenCalled();
    expect(listPiAIModels).toHaveBeenCalledWith("openai");
  });

  it("filters provider models by query in json mode", async () => {
    await runModels("openai", "gpt-5", { json: true });

    expect(formatter.json).toHaveBeenCalledWith({
      source: "pi-ai",
      provider: "openai",
      query: "gpt-5",
      count: 1,
      models: ["gpt-5"],
    });
  });

  it("filters provider models by query in text mode", async () => {
    await runModels("openai", "MINI", {});

    expect(formatter.step).toHaveBeenCalledWith("Provider: openai");
    expect(formatter.step).toHaveBeenCalledWith("Filter: MINI");
    expect(formatter.step).toHaveBeenCalledWith("Model count: 1");
    expect(formatter.step).toHaveBeenCalledWith("gpt-4o-mini");
    expect(formatter.step).not.toHaveBeenCalledWith("gpt-4o");
    expect(formatter.step).not.toHaveBeenCalledWith("gpt-5");
  });
});
