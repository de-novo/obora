/* eslint-disable import/order */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@obora/sdk", () => ({
  loadConfig: vi.fn(),
  detectLLMConfigFromEnv: vi.fn(),
  resolveLLMConfig: vi.fn(),
  buildResolutionSummary: vi.fn(),
  formatResolutionSummary: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
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

import { existsSync } from "node:fs";

import {
  buildResolutionSummary,
  detectLLMConfigFromEnv,
  formatResolutionSummary,
  loadConfig,
  resolveLLMConfig,
} from "@obora/sdk";

import { formatter } from "../../utils/formatter.js";
import { createDoctorCommand, runDoctor } from "../doctor.js";

describe("doctor command", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(loadConfig).mockResolvedValue(undefined);
    vi.mocked(detectLLMConfigFromEnv).mockReturnValue(undefined);
    vi.mocked(resolveLLMConfig).mockReturnValue(undefined);
    vi.mocked(buildResolutionSummary).mockReturnValue({
      provider: null,
      model: null,
      authSource: "none",
      configSource: "none",
      modelSource: "none",
      chosenByPrecedence: "none",
      nextPlaceToEdit: ".obora/config.yaml (or set env key for first-time setup)",
      fallbackStub: true,
      warnings: ["No LLM resolved; execution will run in stub mode"],
    });
    vi.mocked(formatResolutionSummary).mockReturnValue(
      [
        "Execution Resolution",
        "- provider: none",
        "- model: none",
        "- fallback/stub: enabled",
      ].join("\n"),
    );
    vi.mocked(existsSync).mockReturnValue(false);
  });

  describe("command creation", () => {
    it("should create doctor command with correct name", () => {
      const cmd = createDoctorCommand();
      expect(cmd.name()).toBe("doctor");
    });

    it("should have doctor description", () => {
      const cmd = createDoctorCommand();
      expect(cmd.description().toLowerCase()).toContain("diagnose");
    });
  });

  describe("doctor execution", () => {
    it("should load config and resolve llm state", async () => {
      await runDoctor({});

      expect(loadConfig).toHaveBeenCalled();
      expect(detectLLMConfigFromEnv).toHaveBeenCalled();
      expect(resolveLLMConfig).toHaveBeenCalled();
      expect(buildResolutionSummary).toHaveBeenCalled();
    });

    it("should print json when --json is enabled", async () => {
      await runDoctor({ json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          checks: expect.objectContaining({
            projectConfig: false,
            globalConfig: false,
          }),
          status: expect.objectContaining({
            status: "needs_config",
          }),
          recommendations: expect.arrayContaining([
            expect.stringContaining("obora init --quickstart"),
            expect.stringContaining("obora doctor"),
          ]),
          resolution: expect.objectContaining({
            fallbackStub: true,
          }),
        }),
      );
    });

    it("should print actionable lines in default mode", async () => {
      await runDoctor({});

      expect(formatter.info).toHaveBeenCalledWith("Obora doctor");
      expect(formatter.step).toHaveBeenCalledWith("Status: Needs auth: no provider credential detected");
      expect(formatter.step).toHaveBeenCalledWith("Node.js: available");
      expect(formatter.step).toHaveBeenCalledWith("Project config (.obora/config.yaml): missing");
      expect(formatter.step).toHaveBeenCalledWith("Global config (~/.obora/config.yaml): missing");
      expect(formatter.step).toHaveBeenCalledWith("Auth source: none");
      expect(formatter.step).toHaveBeenCalledWith("Config source: none");
      expect(formatter.step).toHaveBeenCalledWith("Fallback/stub: enabled");
      expect(formatter.warn).toHaveBeenCalledWith("No LLM resolved; execution will run in stub mode");
      expect(formatter.info).toHaveBeenCalledWith("Recommended next actions:");
      expect(formatter.step).toHaveBeenCalledWith(
        expect.stringContaining("Run: obora init --quickstart")
      );
      expect(formatter.step).toHaveBeenCalledWith(
        "Set one provider API key, then rerun: obora doctor"
      );
      expect(formatter.step).toHaveBeenCalledWith(
        "Examples: export OPENAI_API_KEY=***  |  export ANTHROPIC_API_KEY=***  |  export ZAI_API_KEY=***"
      );
      expect(formatter.info).toHaveBeenCalledWith("Next step: .obora/config.yaml (or set env key for first-time setup)");
    });

    it("should prioritize configured default provider in auth hints", async () => {
      vi.mocked(loadConfig).mockResolvedValue({
        defaults: {
          provider: "anthropic",
        },
      });

      await runDoctor({});

      expect(formatter.step).toHaveBeenCalledWith("Configured default provider: anthropic");
      expect(formatter.step).toHaveBeenCalledWith("Recommended auth: export ANTHROPIC_API_KEY=***");
    });

    it("should report ready status when provider and model are resolved", async () => {
      vi.mocked(buildResolutionSummary).mockReturnValue({
        provider: "openai",
        model: "gpt-4o-mini",
        authSource: "env(OPENAI_API_KEY)",
        configSource: ".obora/config.yaml",
        modelSource: "config.defaults.model",
        chosenByPrecedence: "config > env",
        nextPlaceToEdit: ".obora/config.yaml",
        fallbackStub: false,
        warnings: [],
      });
      vi.mocked(existsSync).mockReturnValue(true);

      await runDoctor({});

      expect(formatter.step).toHaveBeenCalledWith("Status: Ready: openai/gpt-4o-mini");
      expect(formatter.step).toHaveBeenCalledWith("Fallback/stub: disabled");
      expect(formatter.step).toHaveBeenCalledWith("Run your workflow: obora run judge.yaml");
    });
  });
});
