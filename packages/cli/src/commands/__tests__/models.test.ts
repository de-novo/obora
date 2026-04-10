/* eslint-disable import/order */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@obora/adapters", () => ({
  listPiAIProviders: vi.fn(() => ["openai", "anthropic"]),
  listPiAIModels: vi.fn((provider: string) => {
    if (provider === "openai") {
      return ["gpt-4o-mini", "gpt-4o", "gpt-5", "gpt-5.4"];
    }
    if (provider === "anthropic") {
      return ["claude-3-7-sonnet-20250219", "claude-opus-4-6"];
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
        { provider: "openai", count: 4 },
        { provider: "anthropic", count: 2 },
      ],
    });
  });

  it("treats an unknown first arg as global query in json mode", async () => {
    await runModels("gpt-5", undefined, { json: true });

    expect(formatter.json).toHaveBeenCalledWith({
      source: "pi-ai",
      query: "gpt-5",
      count: 2,
      matches: [
        { provider: "openai", model: "gpt-5" },
        { provider: "openai", model: "gpt-5.4" },
      ],
    });
  });

  it("treats an unknown first arg as global query in text mode", async () => {
    await runModels("claude", undefined, {});

    expect(formatter.info).toHaveBeenCalledWith("Obora models");
    expect(formatter.step).toHaveBeenCalledWith("Source: pi-ai");
    expect(formatter.step).toHaveBeenCalledWith("Global filter: claude");
    expect(formatter.step).toHaveBeenCalledWith("Match count: 2");
    expect(formatter.step).toHaveBeenCalledWith("anthropic: claude-3-7-sonnet-20250219");
    expect(formatter.step).toHaveBeenCalledWith("anthropic: claude-opus-4-6");
  });

  it("prints a helpful hint when global search returns no matches in text mode", async () => {
    await runModels("not-a-real-model", undefined, {});

    expect(formatter.step).toHaveBeenCalledWith("Global filter: not-a-real-model");
    expect(formatter.step).toHaveBeenCalledWith("Match count: 0");
    expect(formatter.warn).toHaveBeenCalledWith(
      "No models matched. Check the spelling or try `obora models <provider> [query]`."
    );
  });

  it("prints model list for a specific provider in text mode", async () => {
    await runModels("openai", undefined, {});

    expect(formatter.info).toHaveBeenCalledWith("Obora models");
    expect(formatter.step).toHaveBeenCalledWith("Source: pi-ai");
    expect(formatter.step).toHaveBeenCalledWith("Provider: openai");
    expect(formatter.step).toHaveBeenCalledWith("Model count: 4");
    expect(formatter.step).toHaveBeenCalledWith("gpt-4o-mini");
    expect(formatter.step).toHaveBeenCalledWith("gpt-4o");
    expect(formatter.step).toHaveBeenCalledWith("gpt-5");
  });

  it("prints model list for a specific provider in json mode", async () => {
    await runModels("anthropic", undefined, { json: true });

    expect(formatter.json).toHaveBeenCalledWith({
      source: "pi-ai",
      provider: "anthropic",
      count: 2,
      models: ["claude-3-7-sonnet-20250219", "claude-opus-4-6"],
    });
  });

  it("throws a helpful error for unsupported providers when a provider filter is explicit", async () => {
    await expect(runModels("unknown-provider", "mini", {})).rejects.toThrow(
      "Unsupported provider 'unknown-provider'. Supported providers: openai, anthropic"
    );
  });

  it("throws a helpful error for unsupported providers when an empty explicit query is supplied", async () => {
    await expect(runModels("unknown-provider", "", {})).rejects.toThrow(
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
      count: 2,
      models: ["gpt-5", "gpt-5.4"],
    });
  });

  it("prints a helpful hint when provider filter returns no matches in json mode", async () => {
    await runModels("openai", "not-a-real-model", { json: true });

    expect(formatter.json).toHaveBeenCalledWith({
      source: "pi-ai",
      provider: "openai",
      query: "not-a-real-model",
      count: 0,
      models: [],
      hint: "No models matched this provider filter. Check the query spelling or run `obora models 'not-a-real-model'`.",
    });
  });

  it("uses a generic provider zero-match hint when the query is also a provider name", async () => {
    await runModels("openai", "anthropic", { json: true });

    expect(formatter.json).toHaveBeenCalledWith({
      source: "pi-ai",
      provider: "openai",
      query: "anthropic",
      count: 0,
      models: [],
      hint: "No models matched this provider filter. Check the query spelling or search across all providers instead.",
    });
  });

  it("uses the same generic hint for mixed-case provider-name queries", async () => {
    await runModels("openai", "Anthropic", { json: true });

    expect(formatter.json).toHaveBeenCalledWith({
      source: "pi-ai",
      provider: "openai",
      query: "Anthropic",
      count: 0,
      models: [],
      hint: "No models matched this provider filter. Check the query spelling or search across all providers instead.",
    });
  });

  it("quotes multi-word provider filter hints so the suggested command stays valid", async () => {
    await runModels("openai", "claude opus", { json: true });

    expect(formatter.json).toHaveBeenCalledWith({
      source: "pi-ai",
      provider: "openai",
      query: "claude opus",
      count: 0,
      models: [],
      hint: "No models matched this provider filter. Check the query spelling or run `obora models 'claude opus'`.",
    });
  });

  it("shell-quotes special characters in provider zero-match fallback commands", async () => {
    await runModels("openai", "price $HOME", { json: true });

    expect(formatter.json).toHaveBeenCalledWith({
      source: "pi-ai",
      provider: "openai",
      query: "price $HOME",
      count: 0,
      models: [],
      hint: "No models matched this provider filter. Check the query spelling or run `obora models 'price $HOME'`.",
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
