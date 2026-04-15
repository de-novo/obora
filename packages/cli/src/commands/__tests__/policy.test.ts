import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@obora/sdk", () => {
  class OboraError extends Error {
    code: string;

    constructor(message: string, code = "TEST_ERROR") {
      super(message);
      this.code = code;
    }
  }

  return {
    Policy: {
      fromYaml: vi.fn(async (filePath: string) => {
        if (filePath.endsWith("policy.yaml")) {
          return { kind: "policy" };
        }
        throw new OboraError("Not a policy", "POLICY_INVALID_SCHEMA");
      }),
    },
    Workflow: {
      fromYaml: vi.fn(async (filePath: string) => {
        if (filePath.endsWith("workflow.yaml")) {
          return { kind: "workflow" };
        }
        throw new OboraError("Invalid workflow schema", "POLICY_INVALID_WORKFLOW");
      }),
    },
    OboraError,
    OboraErrorCode: {
      POLICY_GATE_TIMEOUT: "POLICY_GATE_TIMEOUT",
      CELL_ABORTED: "CELL_ABORTED",
    },
  };
});

import { Policy, Workflow } from "@obora/sdk";

import { ExitCode } from "../../utils/exit-codes.js";
import { createPolicyCommand } from "../policy.js";

describe("policy command", () => {
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

  it("supports local --json for policy validate", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createPolicyCommand();

    await cmd.parseAsync(["validate", "/tmp/policy.yaml", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual({ path: "/tmp/policy.yaml", valid: true, kind: "policy" });
    expect(Policy.fromYaml).toHaveBeenCalledWith("/tmp/policy.yaml");
    expect(Workflow.fromYaml).not.toHaveBeenCalled();
  });

  it("inherits root --json for workflow fallback validation", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = new Command("obora").option("--json");
    root.addCommand(createPolicyCommand());

    await root.parseAsync(["--json", "policy", "validate", "/tmp/workflow.yaml"], {
      from: "user",
    });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual({ path: "/tmp/workflow.yaml", valid: true, kind: "workflow" });
    expect(Policy.fromYaml).toHaveBeenCalledWith("/tmp/workflow.yaml");
    expect(Workflow.fromYaml).toHaveBeenCalledWith("/tmp/workflow.yaml");
  });

  it("uses validation exit code for unsupported policy file extensions", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createPolicyCommand();

    await cmd.parseAsync(["validate", "/tmp/policy.txt"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora run <workflow.yaml> --dry-run"
    );
  });

  it("uses validation exit code for invalid policy/workflow YAML", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createPolicyCommand();

    await cmd.parseAsync(["validate", "/tmp/invalid.yaml"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora run <workflow.yaml> --dry-run"
    );
  });
});
