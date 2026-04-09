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
          resolution: expect.objectContaining({
            fallbackStub: true,
          }),
        }),
      );
    });

    it("should print actionable lines in default mode", async () => {
      await runDoctor({});

      expect(formatter.info).toHaveBeenCalledWith("Obora doctor");
      expect(formatter.step).toHaveBeenCalledWith("Node.js: available");
      expect(formatter.step).toHaveBeenCalledWith("Project config (.obora/config.yaml): missing");
      expect(formatter.step).toHaveBeenCalledWith("Global config (~/.obora/config.yaml): missing");
      expect(formatter.warn).toHaveBeenCalledWith("No LLM resolved; execution will run in stub mode");
      expect(formatter.info).toHaveBeenCalledWith("Next step: .obora/config.yaml (or set env key for first-time setup)");
    });
  });
});
