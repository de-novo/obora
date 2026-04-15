import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@obora/sdk", () => ({
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

import { createCLI } from "../../cli.js";
import { ExitCode } from "../../utils/exit-codes.js";
import { createModelsCommand } from "../models.js";

describe("models command contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? "undefined"}`);
    }) as never);
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("supports local --json for provider-specific model listings", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createModelsCommand();

    await cmd.parseAsync(["openai", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        source: "pi-ai",
        provider: "openai",
        count: 4,
        models: ["gpt-4o-mini", "gpt-4o", "gpt-5", "gpt-5.4"],
      })
    );
  });

  it("inherits root --json for global model listing", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cli = createCLI();

    await cli.parseAsync(["--json", "models", "anthropic"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        source: "pi-ai",
        provider: "anthropic",
        count: 2,
        models: ["claude-3-7-sonnet-20250219", "claude-opus-4-6"],
      })
    );
  });

  it("uses validation exit code for unsupported explicit providers", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createModelsCommand();

    await cmd.parseAsync(["unknown-provider", "mini"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain("obora doctor");
  });
});
