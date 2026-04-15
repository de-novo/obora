import { existsSync } from "node:fs";

import {
  buildResolutionSummary,
  detectLLMConfigFromEnv,
  loadConfig,
  resolveLLMConfig,
} from "@obora/sdk";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

vi.mock("@obora/adapters", () => ({
  listPiAIModels: vi.fn(() => []),
}));

vi.mock("@obora/sdk", () => ({
  loadConfig: vi.fn(),
  detectLLMConfigFromEnv: vi.fn(),
  resolveLLMConfig: vi.fn(),
  buildResolutionSummary: vi.fn(),
  OboraError: class OboraError extends Error {
    code: string;

    constructor(message: string, code = "TEST_ERROR") {
      super(message);
      this.code = code;
    }
  },
  OboraErrorCode: {
    POLICY_GATE_TIMEOUT: "POLICY_GATE_TIMEOUT",
    CELL_ABORTED: "CELL_ABORTED",
  },
}));

import { ExitCode } from "../../utils/exit-codes.js";
import { createDoctorCommand } from "../doctor.js";

describe("doctor command contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? "undefined"}`);
    }) as never);
    process.exitCode = undefined;

    vi.mocked(existsSync).mockReturnValue(false);
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
      nextPlaceToEdit: ".obora/config.yaml",
      fallbackStub: true,
      warnings: ["No LLM resolved; execution will run in stub mode"],
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("supports local --json for doctor", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createDoctorCommand();

    await cmd.parseAsync(["--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        checks: expect.objectContaining({
          projectConfig: false,
          globalConfig: false,
        }),
        overview: expect.objectContaining({
          status: "needs_config",
          fallbackStub: true,
        }),
      })
    );
  });

  it("inherits root --json for doctor", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = new Command("obora").option("--json");
    root.addCommand(createDoctorCommand());

    await root.parseAsync(["--json", "doctor"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        diagnostics: expect.objectContaining({
          resolution: expect.objectContaining({
            fallbackStub: true,
          }),
        }),
      })
    );
  });

  it("uses execution-failed exit code for doctor config load failures without generic hints", async () => {
    vi.mocked(loadConfig).mockRejectedValue(new Error("config disk offline"));

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createDoctorCommand();

    await cmd.parseAsync([], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "ℹ Run: obora doctor"
    );
  });
});
