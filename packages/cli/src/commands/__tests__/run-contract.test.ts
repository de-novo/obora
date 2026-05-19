import { readFile } from "node:fs/promises";

import {
  buildBindingPreview,
  buildOutputPreview,
  buildResolutionSummary,
  detectLLMConfigFromEnv,
  loadConfig,
  resolveWorkflowTarget,
  resolveLLMConfig,
  Workflow,
} from "@obora/sdk";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse as parseYaml } from "yaml";

vi.mock("node:fs/promises", () => ({
  appendFile: vi.fn(),
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

const mockRuntimeInstance = {
  define: vi.fn(),
  on: vi.fn(),
  run: vi.fn(),
};

vi.mock("@obora/sdk", () => ({
  loadConfig: vi.fn(),
  detectLLMConfigFromEnv: vi.fn(),
  resolveLLMConfig: vi.fn(),
  buildResolutionSummary: vi.fn(),
  formatResolutionSummary: vi.fn(() => "Execution Resolution\n- provider: none"),
  buildBindingPreview: vi.fn(() => []),
  formatBindingPreview: vi.fn(() => ""),
  buildOutputPreview: vi.fn(() => []),
  formatOutputPreview: vi.fn(() => ""),
  resolveWorkflowTarget: vi.fn(),
  OboraRuntime: vi.fn(function MockOboraRuntime() {
    return mockRuntimeInstance;
  }),
  Workflow: {
    fromYaml: vi.fn(),
    getStopSemantics: vi.fn(),
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

vi.mock("yaml", () => ({
  parse: vi.fn(),
}));

import { ExitCode } from "../../utils/exit-codes.js";
import { createJudgeCommand } from "../judge.js";
import { createRunCommand } from "../run.js";

describe("run/judge command contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? "undefined"}`);
    }) as never);
    process.exitCode = undefined;

    vi.mocked(loadConfig).mockResolvedValue(undefined);
    vi.mocked(detectLLMConfigFromEnv).mockReturnValue(undefined);
    vi.mocked(resolveLLMConfig).mockReturnValue(undefined);
    vi.mocked(resolveWorkflowTarget).mockResolvedValue({
      status: "not-found",
      candidates: [],
      diagnostics: ["not found"],
    });
    vi.mocked(buildResolutionSummary).mockReturnValue({
      provider: null,
      model: null,
      authSource: "none",
      configSource: "none",
      modelSource: "none",
      chosenByPrecedence: "none",
      nextPlaceToEdit: ".obora/config.yaml",
      fallbackStub: false,
      warnings: [],
    } as never);
    vi.mocked(buildBindingPreview).mockReturnValue([]);
    vi.mocked(buildOutputPreview).mockReturnValue([]);
    mockRuntimeInstance.define.mockReturnValue(undefined);
    mockRuntimeInstance.on.mockReturnValue(mockRuntimeInstance);
    mockRuntimeInstance.run.mockResolvedValue({
      executionId: "exec-test-123",
      wait: vi.fn().mockResolvedValue({ workflowName: "demo-workflow", status: "completed" }),
    });

    vi.mocked(readFile).mockResolvedValue("name: quickstart-judge\nsteps: []\n" as never);
    vi.mocked(parseYaml).mockReturnValue({ name: "quickstart-judge", steps: [] } as never);
    vi.mocked(Workflow.fromYaml).mockResolvedValue({
      name: "quickstart-judge",
      steps: [],
    } as never);
    vi.mocked(Workflow.getStopSemantics).mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("supports local --json for run dry-runs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createRunCommand();

    await cmd.parseAsync(["demo-workflow", "--dry-run", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        workflow: "demo-workflow",
        validated: true,
        overview: expect.objectContaining({
          nextStep: "obora run demo-workflow",
        }),
      })
    );
  });

  it("inherits root --json for judge dry-runs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = new Command("obora").option("--json");
    root.addCommand(createJudgeCommand());

    await root.parseAsync(["--json", "judge", "--dry-run"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        workflow: "quickstart-judge",
        validated: true,
        overview: expect.objectContaining({
          nextStep: "obora judge",
        }),
        guidance: expect.objectContaining({
          actions: expect.arrayContaining([expect.objectContaining({ command: "obora judge" })]),
        }),
      })
    );
  });

  it("uses validation exit code for invalid execution timeout without generic hints", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createRunCommand();

    await cmd.parseAsync(["demo-workflow", "--timeout", "abc"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora run <workflow.yaml> --dry-run"
    );
  });
});
