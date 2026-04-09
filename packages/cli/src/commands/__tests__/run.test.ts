/* eslint-disable import/order */
/**
 * run command tests
 *
 * Rewritten to match current implementation:
 * - Uses @obora/sdk (OboraRuntime, Workflow, loadConfig, detectLLMConfigFromEnv, resolveLLMConfig)
 * - Takes (workflow: string, options) where workflow is a name or YAML path
 * - No longer uses @obora/runtime (parseWorkflow, buildGraph, etc.) or feature-centric API
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── hoisted mocks (resolved before import hoisting) ─────────────────────────
const { mockHandle, mockRuntimeInstance, MockOboraRuntime } = vi.hoisted(() => {
  const mockHandle = {
    executionId: "exec-test-123",
    wait: vi.fn(),
  };
  const mockRuntimeInstance = {
    on: vi.fn(),
    run: vi.fn(),
    define: vi.fn(),
  };
  // Must be a regular function (not an arrow fn) so it can be used as a class constructor
  const MockOboraRuntime = vi.fn(function MockOboraRuntimeImpl(
    this: unknown,
    _opts: unknown
  ): typeof mockRuntimeInstance {
    return mockRuntimeInstance;
  });
  return { mockHandle, mockRuntimeInstance, MockOboraRuntime };
});

// Mock @obora/sdk
vi.mock("@obora/sdk", () => ({
  loadConfig: vi.fn(),
  detectLLMConfigFromEnv: vi.fn(),
  resolveLLMConfig: vi.fn(),
  buildResolutionSummary: vi.fn(() => ({
    provider: "none",
    model: "none",
    authSource: "none",
    configSource: "none",
    modelSource: "none",
    chosenByPrecedence: "none",
    nextPlaceToEdit: ".obora/config.yaml",
    fallbackStub: true,
    warnings: [],
  })),
  formatResolutionSummary: vi.fn(() => "Execution Resolution\n- provider: none"),
  buildBindingPreview: vi.fn(() => []),
  formatBindingPreview: vi.fn(() => ""),
  buildOutputPreview: vi.fn(() => []),
  formatOutputPreview: vi.fn(() => ""),
  OboraRuntime: MockOboraRuntime,
  Workflow: {
    fromYaml: vi.fn(),
    getStopSemantics: vi.fn(),
  },
}));

// Mock node:fs/promises (mkdir, writeFile used for --output-dir; readFile for YAML inspection)
vi.mock("node:fs/promises", () => ({
  appendFile: vi.fn(),
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  readFile: vi.fn(),
}));

// Mock formatter
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

// Mock error-handler to pass through the action fn directly
vi.mock("../../utils/error-handler.js", () => ({
  handleCommandAction: vi.fn(async (fn: () => Promise<void>) => {
    await fn();
  }),
}));

// Mock global-opts
vi.mock("../../utils/global-opts.js", () => ({
  getGlobalOpts: vi.fn(() => ({})),
}));

import { appendFile, mkdir, writeFile, readFile } from "node:fs/promises";
import { loadConfig, detectLLMConfigFromEnv, resolveLLMConfig, Workflow, formatResolutionSummary, formatBindingPreview, formatOutputPreview } from "@obora/sdk";

import { formatter } from "../../utils/formatter.js";
import { createRunCommand, runRun } from "../run.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_RESULT = { workflowName: "my-workflow", status: "completed" };

describe("run command", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // SDK defaults
    vi.mocked(loadConfig).mockResolvedValue({} as Awaited<ReturnType<typeof loadConfig>>);
    vi.mocked(detectLLMConfigFromEnv).mockReturnValue(undefined);
    vi.mocked(resolveLLMConfig).mockReturnValue(undefined);

    // Runtime defaults
    mockHandle.wait.mockResolvedValue(DEFAULT_RESULT);
    mockRuntimeInstance.run.mockResolvedValue(mockHandle);
    mockRuntimeInstance.on.mockReturnValue(mockRuntimeInstance);
    mockRuntimeInstance.define.mockReturnValue(undefined);

    // FS defaults
    vi.mocked(appendFile).mockResolvedValue(undefined);
    vi.mocked(mkdir).mockResolvedValue(undefined);
    vi.mocked(writeFile).mockResolvedValue(undefined);
    vi.mocked(readFile).mockResolvedValue(
      "name: loaded-workflow\nmode: validation-repair\n" as never
    );
  });

  // ─── command creation ────────────────────────────────────────────────────

  describe("command creation", () => {
    it("should create run command with correct name", () => {
      const cmd = createRunCommand();
      expect(cmd.name()).toBe("run");
    });

    it("should have description mentioning workflow", () => {
      const cmd = createRunCommand();
      expect(cmd.description().toLowerCase()).toContain("workflow");
    });

    it("should require a <workflow> argument", () => {
      const cmd = createRunCommand();
      expect(cmd.registeredArguments.length).toBeGreaterThanOrEqual(1);
      expect(cmd.registeredArguments[0].name()).toBe("workflow");
    });

    it("should have --input / -i option", () => {
      const cmd = createRunCommand();
      expect(cmd.options.find((o) => o.long === "--input")).toBeDefined();
    });

    it("should have --var / -v option", () => {
      const cmd = createRunCommand();
      expect(cmd.options.find((o) => o.long === "--var")).toBeDefined();
    });

    it("should have --policy option", () => {
      const cmd = createRunCommand();
      expect(cmd.options.find((o) => o.long === "--policy")).toBeDefined();
    });

    it("should have --agents option", () => {
      const cmd = createRunCommand();
      expect(cmd.options.find((o) => o.long === "--agents")).toBeDefined();
    });

    it("should have --config option", () => {
      const cmd = createRunCommand();
      expect(cmd.options.find((o) => o.long === "--config")).toBeDefined();
    });

    it("should have --model option", () => {
      const cmd = createRunCommand();
      expect(cmd.options.find((o) => o.long === "--model")).toBeDefined();
    });

    it("should have --provider option", () => {
      const cmd = createRunCommand();
      expect(cmd.options.find((o) => o.long === "--provider")).toBeDefined();
    });

    it("should have --output-dir option", () => {
      const cmd = createRunCommand();
      expect(cmd.options.find((o) => o.long === "--output-dir")).toBeDefined();
    });

    it("should have --dry-run option", () => {
      const cmd = createRunCommand();
      expect(cmd.options.find((o) => o.long === "--dry-run")).toBeDefined();
    });

    it("should have --timeout option", () => {
      const cmd = createRunCommand();
      expect(cmd.options.find((o) => o.long === "--timeout")).toBeDefined();
    });

    it("should have --debug option", () => {
      const cmd = createRunCommand();
      expect(cmd.options.find((o) => o.long === "--debug")).toBeDefined();
    });

    it("should have --debug-file option", () => {
      const cmd = createRunCommand();
      expect(cmd.options.find((o) => o.long === "--debug-file")).toBeDefined();
    });
  });

  // ─── workflow execution ──────────────────────────────────────────────────

  describe("workflow execution", () => {
    it("should instantiate OboraRuntime", async () => {
      await runRun("my-workflow", {});

      expect(MockOboraRuntime).toHaveBeenCalledTimes(1);
    });

    it("should call runtime.run with the workflow name", async () => {
      await runRun("my-workflow", {});

      expect(mockRuntimeInstance.run).toHaveBeenCalledWith(
        "my-workflow",
        expect.objectContaining({ input: undefined })
      );
    });

    it("should await handle.wait() for the execution result", async () => {
      await runRun("my-workflow", {});

      expect(mockHandle.wait).toHaveBeenCalled();
    });

    it("should call loadConfig to read project configuration", async () => {
      await runRun("my-workflow", {});

      expect(loadConfig).toHaveBeenCalled();
    });

    it("should detect LLM config from environment", async () => {
      await runRun("my-workflow", {});

      expect(detectLLMConfigFromEnv).toHaveBeenCalled();
    });

    it("should show a success message upon completion", async () => {
      await runRun("my-workflow", {});

      expect(formatter.success).toHaveBeenCalledWith(expect.stringContaining("my-workflow"));
    });

    it("should pass model/provider overrides to runtime when LLM config is resolved", async () => {
      vi.mocked(resolveLLMConfig).mockReturnValue({
        provider: "openai",
        model: "gpt-4",
      } as ReturnType<typeof resolveLLMConfig>);

      await runRun("my-workflow", { model: "gpt-4o", provider: "openai" });

      expect(MockOboraRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          llm: expect.objectContaining({
            model: "gpt-4o",
            provider: "openai",
          }),
        })
      );
    });

    it("should pass llm:undefined when no LLM config is resolved", async () => {
      vi.mocked(resolveLLMConfig).mockReturnValue(undefined);

      await runRun("my-workflow", {});

      expect(MockOboraRuntime).toHaveBeenCalledWith(expect.objectContaining({ llm: undefined }));
    });

    it("should not pass resolved env/config llm into runtime without explicit overrides", async () => {
      vi.mocked(resolveLLMConfig).mockReturnValue({
        provider: "openai",
        model: "gpt-4o-mini",
        apiKey: "env-key",
      } as ReturnType<typeof resolveLLMConfig>);

      await runRun("my-workflow", {});

      expect(MockOboraRuntime).toHaveBeenCalledWith(expect.objectContaining({ llm: undefined }));
    });

    it("should enable debug trace file when --debug is set", async () => {
      await runRun("my-workflow", { debug: true });

      expect(mkdir).toHaveBeenCalledWith(
        expect.stringContaining(".obora-debug"),
        expect.objectContaining({ recursive: true })
      );
      expect(writeFile).toHaveBeenCalledWith(expect.stringContaining(".obora-debug"), "", "utf-8");
      expect(appendFile).toHaveBeenCalled();
    });

    it("should register extra debug event listeners in debug mode", async () => {
      await runRun("my-workflow", { debug: true });

      expect(mockRuntimeInstance.on).toHaveBeenCalledWith("execution_start", expect.any(Function));
      expect(mockRuntimeInstance.on).toHaveBeenCalledWith(
        "workflow.back_edge_triggered",
        expect.any(Function)
      );
      expect(mockRuntimeInstance.on).toHaveBeenCalledWith("error", expect.any(Function));
    });
  });

  // ─── YAML workflow file loading ───────────────────────────────────────────

  describe("YAML workflow file loading", () => {
    it("should load workflow from a .yaml path and define it on runtime", async () => {
      const mockWorkflow = { name: "loaded-workflow" };
      vi.mocked(Workflow.fromYaml).mockResolvedValue(
        mockWorkflow as Awaited<ReturnType<typeof Workflow.fromYaml>>
      );

      await runRun("my-workflow.yaml", {});

      expect(Workflow.fromYaml).toHaveBeenCalledWith("my-workflow.yaml");
      expect(mockRuntimeInstance.define).toHaveBeenCalledWith("loaded-workflow", mockWorkflow);
    });

    it("should load workflow from a .yml path", async () => {
      const mockWorkflow = { name: "yml-workflow" };
      vi.mocked(Workflow.fromYaml).mockResolvedValue(
        mockWorkflow as Awaited<ReturnType<typeof Workflow.fromYaml>>
      );

      await runRun("my-workflow.yml", {});

      expect(Workflow.fromYaml).toHaveBeenCalledWith("my-workflow.yml");
    });

    it("should NOT call Workflow.fromYaml for bare workflow names", async () => {
      await runRun("my-workflow", {});

      expect(Workflow.fromYaml).not.toHaveBeenCalled();
    });
  });

  // ─── --dry-run option ─────────────────────────────────────────────────────

  describe("--dry-run option", () => {
    it("should skip runtime.run in dry-run mode", async () => {
      await runRun("my-workflow", { dryRun: true });

      expect(mockRuntimeInstance.run).not.toHaveBeenCalled();
    });

    it("should show a validation success message in dry-run mode", async () => {
      await runRun("my-workflow", { dryRun: true });

      expect(formatter.success).toHaveBeenCalledWith(expect.stringContaining("validated"));
    });

    it("should emit JSON with validated:true in dry-run + json mode", async () => {
      await runRun("my-workflow", { dryRun: true, json: true });

      expect(formatter.json).toHaveBeenCalledWith(expect.objectContaining({ validated: true }));
    });

    it("should print resolution preview in dry-run text mode", async () => {
      await runRun("my-workflow", { dryRun: true });

      expect(formatter.info).toHaveBeenCalledWith("Execution Resolution\n- provider: none");
      expect(formatter.info).toHaveBeenCalledWith("Dry run preview complete. No execution was started.");
    });
    it("should suggest the next run command after dry-run success", async () => {
      await runRun("judge.yaml", { dryRun: true });

      expect(formatter.info).toHaveBeenCalledWith("Next step: obora run judge.yaml");
    });

    it("should print binding/output previews when available", async () => {
      vi.mocked(formatBindingPreview).mockReturnValue("Binding Preview\n- judge.input: json <- artifacts/submission.json [resolved]");
      vi.mocked(formatOutputPreview).mockReturnValue("Output Preview\n- judge: path <- artifacts/result.json [pending]");
      const mockWorkflow = {
        name: "loaded-workflow",
        steps: [{ name: "judge", input: {}, output: {} }],
      };
      vi.mocked(Workflow.fromYaml).mockResolvedValue(
        mockWorkflow as Awaited<ReturnType<typeof Workflow.fromYaml>>
      );

      await runRun("my-workflow.yaml", { dryRun: true });

      expect(formatter.info).toHaveBeenCalledWith(
        "Binding Preview\n- judge.input: json <- artifacts/submission.json [resolved]"
      );
      expect(formatter.info).toHaveBeenCalledWith(
        "Output Preview\n- judge: path <- artifacts/result.json [pending]"
      );
    });

    it("should include expanded workflow in dry-run JSON when dump flag is set", async () => {
      const mockWorkflow = {
        name: "loaded-workflow",
        steps: [{ name: "build_or_repair" }, { name: "validate" }],
        variables: { output_root: "./tmp-output", archive_enabled: true },
      };
      vi.mocked(Workflow.fromYaml).mockResolvedValue(
        mockWorkflow as Awaited<ReturnType<typeof Workflow.fromYaml>>
      );

      await runRun("my-workflow.yaml", { dryRun: true, json: true, dumpExpandedWorkflow: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          workflow: "loaded-workflow",
          validated: true,
          expandedWorkflow: mockWorkflow,
        })
      );
    });

    it("should include stop semantics in dry-run JSON when flag is set", async () => {
      const mockWorkflow = {
        name: "loaded-workflow",
        steps: [{ name: "build_or_repair" }, { name: "validate" }],
        variables: { output_root: "./tmp-output", archive_enabled: true },
      };
      const mockStopSemantics = {
        mode: "validation-repair",
        outcomes: ["continue", "success"],
        output: { root: "./tmp-output" },
        archive: { enabled: true },
      };
      vi.mocked(Workflow.fromYaml).mockResolvedValue(
        mockWorkflow as Awaited<ReturnType<typeof Workflow.fromYaml>>
      );
      vi.mocked(Workflow.getStopSemantics).mockReturnValue(
        mockStopSemantics as ReturnType<typeof Workflow.getStopSemantics>
      );

      await runRun("my-workflow.yaml", { dryRun: true, json: true, showStopSemantics: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          workflow: "loaded-workflow",
          validated: true,
          stopSemantics: mockStopSemantics,
        })
      );
    });
  });

  // ─── --input option ───────────────────────────────────────────────────────

  describe("--input option", () => {
    it("should parse valid JSON and pass it as input to the workflow", async () => {
      await runRun("my-workflow", { input: '{"key":"value"}' });

      expect(mockRuntimeInstance.run).toHaveBeenCalledWith(
        "my-workflow",
        expect.objectContaining({ input: { key: "value" } })
      );
    });

    it("should throw CLIError for invalid JSON input", async () => {
      await expect(runRun("my-workflow", { input: "not-valid-json" })).rejects.toThrow();
    });
  });

  // ─── --var option ─────────────────────────────────────────────────────────

  describe("--var option", () => {
    it("should parse key=value pairs and pass them as variables", async () => {
      await runRun("my-workflow", { var: ["foo=bar", "baz=qux"] });

      expect(mockRuntimeInstance.run).toHaveBeenCalledWith(
        "my-workflow",
        expect.objectContaining({
          variables: expect.objectContaining({ foo: "bar", baz: "qux" }),
        })
      );
    });

    it("should handle values containing '='", async () => {
      await runRun("my-workflow", { var: ["url=http://example.com/a=b"] });

      expect(mockRuntimeInstance.run).toHaveBeenCalledWith(
        "my-workflow",
        expect.objectContaining({
          variables: expect.objectContaining({ url: "http://example.com/a=b" }),
        })
      );
    });
  });

  // ─── --output-dir option ──────────────────────────────────────────────────

  describe("--output-dir option", () => {
    it("should create the output directory", async () => {
      await runRun("my-workflow", { outputDir: "/tmp/obora-out" });

      expect(mkdir).toHaveBeenCalledWith("/tmp/obora-out", { recursive: true });
    });

    it("should write a result JSON file in the output directory", async () => {
      await runRun("my-workflow", { outputDir: "/tmp/obora-out" });

      expect(writeFile).toHaveBeenCalledWith(
        expect.stringContaining("/tmp/obora-out"),
        expect.stringContaining("my-workflow"),
        "utf-8"
      );
    });

    it("should use one-file output_root as default output directory when outputDir is absent", async () => {
      const mockWorkflow = {
        name: "loaded-workflow",
        steps: [{ name: "build_or_repair" }, { name: "validate" }],
        variables: { output_root: "./tmp-output", archive_enabled: true },
      };
      vi.mocked(Workflow.fromYaml).mockResolvedValue(
        mockWorkflow as Awaited<ReturnType<typeof Workflow.fromYaml>>
      );

      await runRun("my-workflow.yaml", {});

      expect(mkdir).toHaveBeenCalledWith("./tmp-output", { recursive: true });
      expect(vi.mocked(writeFile).mock.calls[0]).toEqual([
        expect.stringContaining("tmp-output/loaded-workflow"),
        expect.stringContaining('"workflowName": "my-workflow"'),
        "utf-8",
      ]);
      expect(vi.mocked(writeFile).mock.calls[1]).toEqual([
        expect.stringContaining("tmp-output/loaded-workflow"),
        expect.stringContaining('"archiveEnabled": true'),
        "utf-8",
      ]);
      expect(vi.mocked(writeFile).mock.calls[2]?.[0]).toEqual(
        expect.stringContaining(".archive/README.md")
      );
      expect(vi.mocked(writeFile).mock.calls[3]?.[0]).toEqual(
        expect.stringContaining(".archive/SUMMARY.md")
      );
      expect(vi.mocked(writeFile).mock.calls[4]?.[0]).toEqual(
        expect.stringContaining(".archive/NEXT_STEPS.md")
      );
    });

    it("should include the execution ID in the output file name", async () => {
      await runRun("my-workflow", { outputDir: "/tmp/obora-out" });

      const [filePath] = vi.mocked(writeFile).mock.calls[0];
      expect(String(filePath)).toContain("exec-test-123");
    });
  });

  // ─── --json option ────────────────────────────────────────────────────────

  describe("--json option", () => {
    it("should emit JSON output and suppress success message", async () => {
      await runRun("my-workflow", { json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({ workflowName: "my-workflow", status: "completed" })
      );
      expect(formatter.success).not.toHaveBeenCalled();
    });

    it("should include elapsed time in JSON output", async () => {
      await runRun("my-workflow", { json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({ elapsedMs: expect.any(Number) })
      );
    });

    it("should include derived output/archive metadata in JSON output for one-file workflows", async () => {
      const mockWorkflow = {
        name: "loaded-workflow",
        steps: [{ name: "build_or_repair" }, { name: "validate" }],
        variables: { output_root: "./tmp-output", archive_enabled: true },
      };
      vi.mocked(Workflow.fromYaml).mockResolvedValue(
        mockWorkflow as Awaited<ReturnType<typeof Workflow.fromYaml>>
      );

      await runRun("my-workflow.yaml", { json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          outputRoot: "./tmp-output",
          archiveEnabled: true,
        })
      );
    });

    it("should write archive intent sidecar when archive is enabled", async () => {
      const mockWorkflow = {
        name: "loaded-workflow",
        steps: [{ name: "build_or_repair" }, { name: "validate" }],
        variables: { output_root: "./tmp-output", archive_enabled: true },
      };
      vi.mocked(Workflow.fromYaml).mockResolvedValue(
        mockWorkflow as Awaited<ReturnType<typeof Workflow.fromYaml>>
      );

      await runRun("my-workflow.yaml", {});

      const secondCall = vi.mocked(writeFile).mock.calls[1];
      expect(secondCall?.[0]).toEqual(expect.stringContaining("archive-intent.json"));
      expect(secondCall?.[1]).toEqual(expect.stringContaining('"archiveEnabled": true'));
    });

    it("should create archive scaffold files when archive is enabled", async () => {
      const mockWorkflow = {
        name: "loaded-workflow",
        steps: [{ name: "build_or_repair" }, { name: "validate" }],
        variables: { output_root: "./tmp-output", archive_enabled: true },
      };
      vi.mocked(Workflow.fromYaml).mockResolvedValue(
        mockWorkflow as Awaited<ReturnType<typeof Workflow.fromYaml>>
      );
      vi.mocked(Workflow.getStopSemantics).mockReturnValue({ mode: "validation-repair" } as any);

      await runRun("my-workflow.yaml", {});

      expect(mkdir).toHaveBeenCalledWith(expect.stringContaining(".archive"), { recursive: true });
      expect(vi.mocked(writeFile).mock.calls[2]?.[1]).toEqual(
        expect.stringContaining("mode: validation-repair")
      );
      expect(vi.mocked(writeFile).mock.calls[3]?.[1]).toEqual(
        expect.stringContaining("validation failures, repair attempts")
      );
      expect(vi.mocked(writeFile).mock.calls[4]?.[1]).toEqual(
        expect.stringContaining("another repair loop")
      );
      expect(vi.mocked(writeFile).mock.calls[5]?.[0]).toEqual(
        expect.stringContaining("REPAIR_LOG.md")
      );
      expect(vi.mocked(writeFile).mock.calls[5]?.[1]).toEqual(
        expect.stringContaining("# Repair Log")
      );
    });

    it("should create mode-specific proof archive scaffold file", async () => {
      const mockWorkflow = {
        name: "loaded-proof",
        steps: [
          { name: "problem_frame" },
          { name: "known_results_audit" },
          { name: "proof_attempt" },
          { name: "review" },
        ],
        variables: { output_root: "./tmp-output", archive_enabled: true },
      };
      vi.mocked(Workflow.fromYaml).mockResolvedValue(
        mockWorkflow as Awaited<ReturnType<typeof Workflow.fromYaml>>
      );
      vi.mocked(Workflow.getStopSemantics).mockReturnValue({ mode: "proof-loop" } as any);

      await runRun("proof.yaml", {});

      expect(vi.mocked(writeFile).mock.calls[5]?.[0]).toEqual(
        expect.stringContaining("PROOF_GAPS.md")
      );
      expect(vi.mocked(writeFile).mock.calls[5]?.[1]).toEqual(
        expect.stringContaining("# Proof Gaps")
      );
    });

    it("should create mode-specific research archive scaffold file", async () => {
      const mockWorkflow = {
        name: "loaded-research",
        steps: [{ name: "problem_frame" }, { name: "research" }, { name: "review" }],
        variables: { output_root: "./tmp-output", archive_enabled: true },
      };
      vi.mocked(Workflow.fromYaml).mockResolvedValue(
        mockWorkflow as Awaited<ReturnType<typeof Workflow.fromYaml>>
      );
      vi.mocked(Workflow.getStopSemantics).mockReturnValue({ mode: "research-loop" } as any);

      await runRun("research.yaml", {});

      expect(vi.mocked(writeFile).mock.calls[5]?.[0]).toEqual(
        expect.stringContaining("FINDINGS.md")
      );
      expect(vi.mocked(writeFile).mock.calls[5]?.[1]).toEqual(
        expect.stringContaining("# Findings")
      );
    });
  });

  // ─── --quiet option ───────────────────────────────────────────────────────

  describe("--quiet option", () => {
    it("should suppress the success message in quiet mode", async () => {
      await runRun("my-workflow", { quiet: true });

      expect(formatter.success).not.toHaveBeenCalled();
    });
  });

  // ─── --verbose option ─────────────────────────────────────────────────────

  describe("repair-loop progress UX", () => {
    it("should print validation and repair progress events in non-json mode", async () => {
      mockHandle.wait.mockImplementationOnce(async () => {
        const handlers = new Map(
          mockRuntimeInstance.on.mock.calls.map((call) => [call[0], call[1]])
        );

        handlers.get("workflow.validation_failed")?.({
          data: {
            stepName: "validate",
            summary: "Missing READY marker",
            failedChecks: [{ name: "marker" }],
          },
        });
        handlers.get("workflow.repair_started")?.({
          data: {
            stepName: "build_or_repair",
            attempt: 2,
          },
        });
        handlers.get("workflow.validation_passed")?.({
          data: {
            stepName: "validate",
            summary: "Validation passed",
          },
        });

        return DEFAULT_RESULT;
      });

      await runRun("my-workflow", {});

      expect(formatter.warn).toHaveBeenCalledWith(
        expect.stringContaining("validation failed [validate]: Missing READY marker")
      );
      expect(formatter.info).toHaveBeenCalledWith(
        expect.stringContaining("repair attempt 2 → build_or_repair")
      );
      expect(formatter.success).toHaveBeenCalledWith(
        expect.stringContaining("validation passed [validate]: Validation passed")
      );
      expect(formatter.info).toHaveBeenCalledWith(
        expect.stringContaining(
          "repair loop summary: validation failed=1, validation passed=1, repairs started=1, repairs completed=0"
        )
      );
    });

    it("should include repairLoop summary in JSON output", async () => {
      mockHandle.wait.mockImplementationOnce(async () => {
        const handlers = new Map(
          mockRuntimeInstance.on.mock.calls.map((call) => [call[0], call[1]])
        );

        handlers.get("workflow.validation_failed")?.({
          data: {
            stepName: "validate",
            summary: "Missing READY marker",
            failedChecks: [{ name: "marker" }],
          },
        });
        handlers.get("workflow.repair_started")?.({
          data: {
            stepName: "build_or_repair",
            attempt: 2,
          },
        });
        handlers.get("workflow.repair_completed")?.({
          data: {
            stepName: "build_or_repair",
            attempt: 2,
          },
        });
        handlers.get("workflow.validation_passed")?.({
          data: {
            stepName: "validate",
            summary: "Validation passed",
          },
        });

        return DEFAULT_RESULT;
      });

      await runRun("my-workflow", { json: true });

      expect(formatter.json).toHaveBeenCalledWith(
        expect.objectContaining({
          repairLoop: expect.objectContaining({
            validationFailed: 1,
            validationPassed: 1,
            repairStarted: 1,
            repairCompleted: 1,
            lastValidationSummary: "Validation passed",
          }),
        })
      );
    });
  });

  describe("--verbose option", () => {
    it("should log start info in verbose mode", async () => {
      await runRun("my-workflow", { verbose: true });

      expect(formatter.info).toHaveBeenCalled();
    });
  });

  // ─── commander integration ────────────────────────────────────────────────

  describe("commander integration", () => {
    it("should execute the workflow when parsed with a name argument", async () => {
      const cmd = createRunCommand();
      cmd.exitOverride();

      await cmd.parseAsync(["my-workflow"], { from: "user" });

      expect(mockRuntimeInstance.run).toHaveBeenCalled();
    });

    it("should skip execution when --dry-run is passed", async () => {
      const cmd = createRunCommand();
      cmd.exitOverride();

      await cmd.parseAsync(["my-workflow", "--dry-run"], { from: "user" });

      expect(mockRuntimeInstance.run).not.toHaveBeenCalled();
    });

    it("should forward --model to OboraRuntime when LLM config is present", async () => {
      vi.mocked(resolveLLMConfig).mockReturnValue({
        provider: "anthropic",
        model: "claude-3-5-sonnet",
      } as ReturnType<typeof resolveLLMConfig>);

      const cmd = createRunCommand();
      cmd.exitOverride();

      await cmd.parseAsync(["my-workflow", "--model", "claude-opus-4-1"], { from: "user" });

      expect(MockOboraRuntime).toHaveBeenCalledWith(
        expect.objectContaining({
          llm: expect.objectContaining({ model: "claude-opus-4-1" }),
        })
      );
    });
  });
});
