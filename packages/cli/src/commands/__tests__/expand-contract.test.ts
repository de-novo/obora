import { readFile } from "node:fs/promises";

import { Workflow } from "@obora/sdk";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import yaml from "yaml";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("yaml", () => ({
  default: {
    parse: vi.fn(() => ({ mode: "validation-repair" })),
  },
}));

vi.mock("@obora/sdk", () => ({
  Workflow: {
    fromYaml: vi.fn(),
    getStopSemantics: vi.fn(() => ({ mode: "validation-repair" })),
  },
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
import { createExpandCommand } from "../expand.js";

describe("expand command contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? "undefined"}`);
    }) as never);
    process.exitCode = undefined;
    vi.mocked(readFile).mockResolvedValue("name: wf\nmode: validation-repair\n" as never);
    vi.mocked(Workflow.fromYaml).mockResolvedValue({
      name: "wf",
      steps: [{ name: "build_or_repair" }, { name: "validate" }],
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("supports local --json for expand", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createExpandCommand();

    await cmd.parseAsync(["demo.yaml", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        source: "demo.yaml",
        workflow: "wf",
        stopSemantics: { mode: "validation-repair" },
      })
    );
  });

  it("inherits root --json for expand", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = new Command("obora").option("--json");
    root.addCommand(createExpandCommand());

    await root.parseAsync(["--json", "expand", "demo.yaml"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        source: "demo.yaml",
        workflow: "wf",
      })
    );
  });

  it("uses validation exit code for missing expand source without generic hints", async () => {
    vi.mocked(readFile).mockRejectedValue(
      new Error("ENOENT: no such file or directory, open 'missing.yaml'")
    );

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createExpandCommand();

    await cmd.parseAsync(["missing.yaml"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora init --quickstart"
    );
  });

  it("uses execution-failed exit code for workflow expansion failures", async () => {
    vi.mocked(Workflow.fromYaml).mockRejectedValue(new Error("schema invalid"));

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createExpandCommand();

    await cmd.parseAsync(["demo.yaml"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalled();
  });

  it("uses validation exit code for invalid expand yaml", async () => {
    vi.mocked(yaml.parse).mockImplementation(() => {
      throw new Error("bad yaml");
    });

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createExpandCommand();

    await cmd.parseAsync(["demo.yaml"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
  });
});
