/* eslint-disable import/order */
/**
 * validate command tests
 */

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock("@obora/runtime", () => ({
  parseAndValidate: vi.fn(),
}));

vi.mock("@obora/sdk", () => ({
  OboraError: class OboraError extends Error {
    code: string;

    constructor(message: string, code = "SDK_INVALID_WORKFLOW") {
      super(message);
      this.code = code;
    }
  },
  Workflow: {
    create: vi.fn(),
    getStopSemantics: vi.fn(),
  },
}));

import { existsSync, readFileSync, readdirSync } from "node:fs";

import { OboraError, Workflow } from "@obora/sdk";
import { parseAndValidate } from "@obora/runtime";

import { ExitCode } from "../../utils/exit-codes.js";
import { createValidateCommand, validateCommand } from "../validate.js";

describe("validate command", () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? "undefined"}`);
    }) as never);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("creates validate command with modern contract options", () => {
    const cmd = validateCommand();

    expect(cmd.name()).toBe("validate");
    expect(cmd.description()).toBe("Validate workflow YAML files");
    expect(cmd.options.find((opt) => opt.long === "--all")).toBeDefined();
    expect(cmd.options.find((opt) => opt.long === "--file")).toBeDefined();
    expect(cmd.options.find((opt) => opt.long === "--strict")).toBeDefined();
    expect(cmd.options.find((opt) => opt.long === "--format")?.defaultValue).toBe("default");
    expect(cmd.options.find((opt) => opt.long === "--json")).toBeDefined();
    expect(cmd.options.find((opt) => opt.long === "--verbose")).toBeDefined();
  });

  it("validates a specific file successfully in text mode", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("name: test\nsteps: []");
    vi.mocked(parseAndValidate).mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
    });

    const cmd = validateCommand();
    await cmd.parseAsync(["--file", "workflow.yaml"], { from: "user" });

    expect(parseAndValidate).toHaveBeenCalledWith("name: test\nsteps: []");
    expect(process.exitCode).toBe(ExitCode.SUCCESS);
    expect(consoleLogSpy.mock.calls.flat().join(" ")).toContain("Results:");
  });

  it("accepts a positional workflow path as a validate target", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("name: positional\nsteps: []");
    vi.mocked(parseAndValidate).mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
    });

    const cmd = validateCommand();
    await cmd.parseAsync(["workflow.yaml"], { from: "user" });

    expect(parseAndValidate).toHaveBeenCalledWith("name: positional\nsteps: []");
    expect(process.exitCode).toBe(ExitCode.SUCCESS);
  });

  it("rejects combining --all with a positional validate target", async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const cmd = validateCommand();
    await cmd.parseAsync(["workflow.yaml", "--all"], { from: "user" });

    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(process.exit).not.toHaveBeenCalled();
    expect(parseAndValidate).not.toHaveBeenCalled();
  });

  it("rejects combining --file with a positional validate target", async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const cmd = validateCommand();
    await cmd.parseAsync(["workflow.yaml", "--file", "other.yaml"], { from: "user" });

    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(process.exit).not.toHaveBeenCalled();
    expect(parseAndValidate).not.toHaveBeenCalled();
  });

  it("validates one-file workflows through SDK expansion instead of the canonical workflow parser", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("name: quickstart-judge\nmode: judge\n");
    vi.mocked(parseAndValidate).mockReturnValue({
      isValid: false,
      errors: [{ code: "E2002", message: "Missing required field 'steps'", path: "" }],
      warnings: [],
    });
    vi.mocked(Workflow.getStopSemantics).mockReturnValue({ mode: "judge" } as never);
    vi.mocked(Workflow.create).mockReturnValue({ name: "quickstart-judge", steps: [] } as never);

    const cmd = validateCommand();
    await cmd.parseAsync(["workflow.yaml"], { from: "user" });

    expect(Workflow.getStopSemantics).toHaveBeenCalled();
    expect(Workflow.create).toHaveBeenCalled();
    expect(parseAndValidate).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.SUCCESS);
  });

  it("adds expand guidance to one-file validation errors", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("name: invalid-judge\nmode: judge\nnonesense: true\n");
    vi.mocked(Workflow.getStopSemantics).mockReturnValue({ mode: "judge" } as never);
    vi.mocked(Workflow.create).mockImplementation(() => {
      throw new OboraError(
        'One-file workflow does not allow key "nonesense". Allowed keys: name, version, mode, provider, model, agent, prompt, input, output, options',
        "SDK_8005"
      );
    });

    const cmd = validateCommand();
    await cmd.parseAsync(["workflow.yaml", "--json"], { from: "user" });

    const payload = JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0] ?? "{}"));
    const firstResult = Object.values(payload.results as Record<string, unknown>)[0] as {
      errors: Array<{ suggestion?: string }>;
    };
    expect(firstResult.errors[0]?.suggestion).toContain(
      "Fix the reported one-file workflow errors"
    );
    expect(firstResult.errors[0]?.suggestion).toContain("obora expand --json -- 'workflow.yaml'");
    expect(parseAndValidate).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
  });

  it("shell-quotes one-file expand guidance for paths with spaces and shell metacharacters", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("name: invalid-judge\nmode: judge\nnonesense: true\n");
    vi.mocked(Workflow.getStopSemantics).mockReturnValue({ mode: "judge" } as never);
    vi.mocked(Workflow.create).mockImplementation(() => {
      throw new OboraError(
        'One-file workflow does not allow key "nonesense". Allowed keys: name, version, mode, provider, model, agent, prompt, input, output, options',
        "SDK_8005"
      );
    });

    const cmd = validateCommand();
    await cmd.parseAsync(["workflows/my weird $(name).yaml", "--json"], { from: "user" });

    const payload = JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0] ?? "{}"));
    const firstResult = Object.values(payload.results as Record<string, unknown>)[0] as {
      errors: Array<{ suggestion?: string }>;
    };
    expect(firstResult.errors[0]?.suggestion).toContain(
      "obora expand --json -- 'workflows/my weird $(name).yaml'"
    );
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
  });

  it("shell-quotes one-file expand guidance for paths containing single quotes", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("name: invalid-judge\nmode: judge\nnonesense: true\n");
    vi.mocked(Workflow.getStopSemantics).mockReturnValue({ mode: "judge" } as never);
    vi.mocked(Workflow.create).mockImplementation(() => {
      throw new OboraError(
        'One-file workflow does not allow key "nonesense". Allowed keys: name, version, mode, provider, model, agent, prompt, input, output, options',
        "SDK_8005"
      );
    });

    const cmd = validateCommand();
    await cmd.parseAsync(["workflows/it's judge.yaml", "--json"], { from: "user" });

    const payload = JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0] ?? "{}"));
    const firstResult = Object.values(payload.results as Record<string, unknown>)[0] as {
      errors: Array<{ suggestion?: string }>;
    };
    expect(firstResult.errors[0]?.suggestion).toContain(
      "obora expand --json -- 'workflows/it'\"'\"'s judge.yaml'"
    );
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
  });

  it("outputs structured JSON with local --json", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("name: test\nsteps: []");
    vi.mocked(parseAndValidate).mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
    });

    const cmd = validateCommand();
    await cmd.parseAsync(["--file", "workflow.yaml", "--json"], { from: "user" });

    const payload = JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0] ?? "{}"));
    expect(payload.summary).toEqual(
      expect.objectContaining({
        total: 1,
        passed: 1,
        failed: 0,
        warnings: 0,
      })
    );
    const resultKey = Object.keys(payload.results)[0];
    expect(resultKey).toContain("workflow.yaml");
    expect(payload.results[resultKey]).toEqual(
      expect.objectContaining({
        valid: true,
      })
    );
  });

  it("inherits root --json", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("name: test\nsteps: []");
    vi.mocked(parseAndValidate).mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
    });

    const root = new Command("obora").option("--json");
    root.addCommand(createValidateCommand());

    await root.parseAsync(["--json", "validate", "--file", "workflow.yaml"], { from: "user" });

    const payload = JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0] ?? "{}"));
    expect(payload.summary).toEqual(
      expect.objectContaining({
        total: 1,
        passed: 1,
      })
    );
  });

  it("uses validation exit code for non-existent files without process.exit", async () => {
    vi.mocked(existsSync).mockReturnValue(false);

    const cmd = validateCommand();
    await cmd.parseAsync(["--file", "nonexistent.yaml"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora run <workflow.yaml> --dry-run"
    );
  });

  it("prints JSON payload before exiting with validation error", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("name: test\nsteps: []");
    vi.mocked(parseAndValidate).mockReturnValue({
      isValid: false,
      errors: [
        {
          code: "ERR001",
          message: "Invalid field",
          path: "/workflow",
        },
      ],
      warnings: [],
    });

    const cmd = validateCommand();
    await cmd.parseAsync(["--file", "workflow.yaml", "--json"], { from: "user" });

    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    const payload = JSON.parse(String(consoleLogSpy.mock.calls.at(-1)?.[0] ?? "{}"));
    const firstResult = Object.values(payload.results as Record<string, unknown>)[0] as {
      valid: boolean;
      errors: Array<{ message: string }>;
    };
    expect(firstResult.valid).toBe(false);
    expect(firstResult.errors[0]?.message).toBe("Invalid field");
  });

  it("treats warnings as validation errors in strict mode", async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue("name: test\nsteps: []");
    vi.mocked(parseAndValidate).mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [
        {
          code: "WARN001",
          message: "Test warning",
          path: "/workflow",
        },
      ],
    });

    const cmd = validateCommand();
    await cmd.parseAsync(["--file", "workflow.yaml", "--strict"], { from: "user" });

    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
  });

  it("shows info when no workflow files are found under --all", async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    vi.mocked(readdirSync).mockReturnValue([] as never);

    const cmd = validateCommand();
    await cmd.parseAsync(["--all"], { from: "user" });

    expect(process.exitCode).toBe(ExitCode.SUCCESS);
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining("No workflow files found"));
  });

  it("rejects path traversal attempts with validation exit code", async () => {
    vi.mocked(existsSync).mockReturnValue(true);

    const cmd = validateCommand();
    await cmd.parseAsync(["--file", "../../../etc/passwd"], { from: "user" });

    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(process.exit).not.toHaveBeenCalled();
  });

  it("validates all workflow files recursively", async () => {
    vi.mocked(existsSync).mockImplementation((value) => {
      const target = String(value);
      return target.includes(".obora/workflows") || target.includes(".obora/features");
    });
    vi.mocked(readdirSync).mockReturnValue([
      { name: "simple.yaml", isDirectory: () => false },
      { name: "standard.yml", isDirectory: () => false },
    ] as never);
    vi.mocked(readFileSync).mockReturnValue("name: test\nsteps: []");
    vi.mocked(parseAndValidate).mockReturnValue({
      isValid: true,
      errors: [],
      warnings: [],
    });

    const cmd = validateCommand();
    await cmd.parseAsync(["--all"], { from: "user" });

    expect(parseAndValidate).toHaveBeenCalledTimes(4);
    expect(process.exitCode).toBe(ExitCode.SUCCESS);
  });

  it("uses execution-failed exit code for directory scan failures", async () => {
    vi.mocked(existsSync).mockImplementation((value) => String(value).includes("workflows"));
    vi.mocked(readdirSync).mockImplementation(() => {
      throw new Error("disk offline");
    });

    const cmd = validateCommand();
    await cmd.parseAsync(["--all"], { from: "user" });

    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
