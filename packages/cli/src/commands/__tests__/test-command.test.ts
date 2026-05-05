import { stat } from "node:fs/promises";

import { fixtureToTestCase, loadFixture, loadFixtures, runWorkflowTest } from "@obora/sdk";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  stat: vi.fn(),
}));

vi.mock("@obora/sdk", () => ({
  loadFixture: vi.fn(),
  loadFixtures: vi.fn(),
  fixtureToTestCase: vi.fn((fixture: unknown) => fixture),
  runWorkflowTest: vi.fn(),
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
import { createTestCommand } from "../test.js";

describe("test command contracts", () => {
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

  it("supports local --json for single-fixture test runs", async () => {
    vi.mocked(stat).mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    } as Awaited<ReturnType<typeof stat>>);
    vi.mocked(loadFixture).mockResolvedValue({ name: "happy-path" } as never);
    vi.mocked(runWorkflowTest).mockResolvedValue({
      name: "happy-path",
      passed: true,
      duration: 12,
      failures: [],
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createTestCommand();

    await cmd.parseAsync(["./tests/happy-path.yaml", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual({
      target: "./tests/happy-path.yaml",
      filter: null,
      total: 1,
      passed: 1,
      failed: 0,
      results: [
        {
          name: "happy-path",
          passed: true,
          duration: 12,
          failures: [],
        },
      ],
    });
    expect(fixtureToTestCase).toHaveBeenCalledWith({ name: "happy-path" });
  });

  it("inherits root --json for directory test runs", async () => {
    vi.mocked(stat).mockResolvedValue({
      isDirectory: () => true,
      isFile: () => false,
    } as Awaited<ReturnType<typeof stat>>);
    vi.mocked(loadFixtures).mockResolvedValue([{ name: "recovery-path" }] as never);
    vi.mocked(runWorkflowTest).mockResolvedValue({
      name: "recovery-path",
      passed: true,
      duration: 8,
      failures: [],
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = new Command("obora").option("--json");
    root.addCommand(createTestCommand());

    await root.parseAsync(["--json", "test", "./tests"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual({
      target: "./tests",
      filter: null,
      total: 1,
      passed: 1,
      failed: 0,
      results: [
        {
          name: "recovery-path",
          passed: true,
          duration: 8,
          failures: [],
        },
      ],
    });
  });

  it("uses validation exit code for missing explicit test targets without generic hints", async () => {
    vi.mocked(stat).mockResolvedValue(null as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createTestCommand();

    await cmd.parseAsync(["./missing-tests"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora run <workflow.yaml> --dry-run"
    );
  });

  it("uses validation exit code when default ./tests is missing", async () => {
    vi.mocked(stat).mockResolvedValue(null as never);

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createTestCommand();

    await cmd.parseAsync([], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
  });

  it("uses validation exit code for unsupported test targets", async () => {
    vi.mocked(stat).mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    } as Awaited<ReturnType<typeof stat>>);

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createTestCommand();

    await cmd.parseAsync(["./tests/case.json"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
    expect(loadFixture).not.toHaveBeenCalled();
  });

  it("prints no-match warning when filters exclude all fixtures", async () => {
    vi.mocked(stat).mockResolvedValue({
      isDirectory: () => true,
      isFile: () => false,
    } as Awaited<ReturnType<typeof stat>>);
    vi.mocked(loadFixtures).mockResolvedValue([{ name: "happy-path" }] as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createTestCommand();

    await cmd.parseAsync(["./tests", "--filter", "missing"], { from: "user" });

    expect(error.mock.calls.map((args) => args.join(" ")).join("\n")).toContain(
      "No test fixtures matched the provided target/filter."
    );
    expect(runWorkflowTest).not.toHaveBeenCalled();
  });

  it("returns empty JSON when filters exclude all fixtures", async () => {
    vi.mocked(stat).mockResolvedValue({
      isDirectory: () => true,
      isFile: () => false,
    } as Awaited<ReturnType<typeof stat>>);
    vi.mocked(loadFixtures).mockResolvedValue([{ name: "happy-path" }] as never);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createTestCommand();

    await cmd.parseAsync(["./tests", "--filter", "missing", "--json"], { from: "user" });

    expect(JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}")).toEqual({
      target: "./tests",
      filter: "missing",
      total: 0,
      passed: 0,
      failed: 0,
      results: [],
    });
  });

  it("prints verbose text output for passing fixtures", async () => {
    vi.mocked(stat).mockResolvedValue({
      isDirectory: () => true,
      isFile: () => false,
    } as Awaited<ReturnType<typeof stat>>);
    vi.mocked(loadFixtures).mockResolvedValue([{ name: "happy-path" }] as never);
    vi.mocked(runWorkflowTest).mockResolvedValue({
      name: "happy-path",
      passed: true,
      duration: 12,
      failures: [],
    } as never);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = new Command("obora").option("--verbose");
    root.addCommand(createTestCommand());

    await root.parseAsync(["--verbose", "test", "./tests"], { from: "user" });

    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Running test fixture: happy-path");
    expect(output).toContain("Finished: happy-path (12ms)");
    expect(output).toContain("happy-path (12ms)");
    expect(output).toContain("Test summary: 1/1 passed, 0 failed");
  });

  it("uses execution-failed exit code for failed test runs", async () => {
    vi.mocked(stat).mockResolvedValue({
      isDirectory: () => false,
      isFile: () => true,
    } as Awaited<ReturnType<typeof stat>>);
    vi.mocked(loadFixture).mockResolvedValue({ name: "broken-path" } as never);
    vi.mocked(runWorkflowTest).mockResolvedValue({
      name: "broken-path",
      passed: false,
      duration: 5,
      failures: [{ message: "assertion failed" }],
    } as never);

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createTestCommand();

    await cmd.parseAsync(["./tests/broken-path.yaml"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalled();
  });
});
