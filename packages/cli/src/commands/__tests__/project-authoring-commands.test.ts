import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { getDefaultAuthFilePath, maskProviderAuth } from "@obora/adapters";
import {
  addStep,
  createAgent,
  createWorkflow,
  getAgent,
  listWorkflows,
  loadConfig,
  readAgents,
  readWorkflow,
  removeAgent,
  removeStep,
  updateAgent,
  updateStep,
  validateWorkflow,
} from "@obora/sdk";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

vi.mock("@obora/adapters", () => ({
  getDefaultAuthFilePath: vi.fn(() => "/tmp/obora-auth.json"),
  maskProviderAuth: vi.fn((auth: { type: string; apiKey?: string }) => ({
    type: auth.type,
    apiKey: auth.apiKey ? "sk-...1234" : undefined,
  })),
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
  addStep: vi.fn(),
  createAgent: vi.fn(),
  createWorkflow: vi.fn(),
  getAgent: vi.fn(),
  listWorkflows: vi.fn(),
  loadConfig: vi.fn(),
  readAgents: vi.fn(),
  readWorkflow: vi.fn(),
  removeAgent: vi.fn(),
  removeStep: vi.fn(),
  updateAgent: vi.fn(),
  updateStep: vi.fn(),
  validateWorkflow: vi.fn(),
}));

import { ExitCode } from "../../utils/exit-codes.js";
import { createAgentCommand } from "../agent.js";
import { createConfigCommand } from "../config.js";
import { createWorkflowCommand } from "../workflow.js";

const withRoot = (command: Command): Command => {
  const root = new Command("obora").option("--json").option("--verbose");
  root.addCommand(command);
  return root;
};

describe("project authoring commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(addStep).mockResolvedValue(undefined);
    vi.mocked(createAgent).mockResolvedValue(undefined);
    vi.mocked(createWorkflow).mockResolvedValue(undefined);
    vi.mocked(removeAgent).mockResolvedValue(undefined);
    vi.mocked(removeStep).mockResolvedValue(undefined);
    vi.mocked(updateAgent).mockResolvedValue(undefined);
    vi.mocked(updateStep).mockResolvedValue(undefined);
    vi.mocked(maskProviderAuth).mockReturnValue({ type: "apiKey", apiKey: "sk-...1234" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("lists, shows, creates, edits, and removes agents", async () => {
    vi.mocked(readAgents)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          name: "writer",
          role: "executor",
          provider: "openai",
          model: "gpt-5",
        },
      ])
      .mockResolvedValueOnce([{ name: "minimal" }])
      .mockResolvedValueOnce([{ name: "half-configured", provider: "openai" }]);
    vi.mocked(getAgent)
      .mockResolvedValueOnce({
        name: "writer",
        role: "executor",
        description: "Drafts workflow outputs",
        provider: "openai",
        model: "gpt-5",
        temperature: 0.2,
        prompt: "Line one\nLine two",
      })
      .mockResolvedValueOnce({ name: "writer" })
      .mockResolvedValueOnce({ name: "minimal" })
      .mockResolvedValueOnce(null);
    vi.mocked(readFile)
      .mockResolvedValueOnce("Prompt from file")
      .mockResolvedValueOnce("Edited prompt")
      .mockRejectedValueOnce(new Error("missing prompt"));

    const command = createAgentCommand();

    await command.parseAsync(["list"], { from: "user" });
    await command.parseAsync(["list", "--json", "--project-dir", "/tmp/project"], { from: "user" });
    await command.parseAsync(["list"], { from: "user" });
    await command.parseAsync(["list"], { from: "user" });
    await command.parseAsync(["show", "writer"], { from: "user" });
    await command.parseAsync(["show", "writer", "--json"], { from: "user" });
    await command.parseAsync(["show", "minimal"], { from: "user" });
    await withRoot(createAgentCommand()).parseAsync(
      ["--json", "agent", "create", "writer", "--role", "executor", "--description", "Drafts", "--provider", "openai", "--model", "gpt-5", "--temperature", "0.2", "--prompt", "@/tmp/prompt.md", "--per-file", "--project-dir", "/tmp/project"],
      { from: "user" },
    );
    await command.parseAsync(["create", "minimal"], { from: "user" });
    await command.parseAsync(
      ["edit", "writer", "--role", "reviewer", "--description", "Reviews", "--provider", "anthropic", "--model", "claude", "--temperature", "0.1", "--prompt", "Inline prompt"],
      { from: "user" },
    );
    await command.parseAsync(["edit", "writer", "--prompt", "@/tmp/edit-prompt.md"], { from: "user" });
    await command.parseAsync(["edit", "writer"], { from: "user" });
    await command.parseAsync(["edit", "writer", "--prompt", "@/tmp/missing-prompt.md"], { from: "user" });
    await command.parseAsync(["remove", "writer"], { from: "user" });
    await command.parseAsync(["show", "missing"], { from: "user" });

    expect(readAgents).toHaveBeenCalledWith("/tmp/project");
    expect(createAgent).toHaveBeenCalledWith(
      "/tmp/project",
      expect.objectContaining({
        name: "writer",
        role: "executor",
        description: "Drafts",
        provider: "openai",
        model: "gpt-5",
        temperature: 0.2,
        prompt: "Prompt from file",
      }),
      { perFile: true },
    );
    expect(updateAgent).toHaveBeenCalledWith(
      process.cwd(),
      "writer",
      expect.objectContaining({
        role: "reviewer",
        description: "Reviews",
        provider: "anthropic",
        model: "claude",
        temperature: 0.1,
        prompt: "Inline prompt",
      }),
    );
    expect(updateAgent).toHaveBeenCalledWith(process.cwd(), "writer", { prompt: "Edited prompt" });
    expect(updateAgent).toHaveBeenCalledWith(process.cwd(), "writer", {});
    expect(removeAgent).toHaveBeenCalledWith(process.cwd(), "writer");
    expect(process.exitCode).toBe(ExitCode.CLI_ERROR);
  });

  it("runs workflow authoring commands and builds complex step options", async () => {
    const workflowPath = resolve("workflow.yaml");
    vi.mocked(listWorkflows)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { name: "triage", path: workflowPath, description: "Route requests", stepCount: 2 },
      ])
      .mockResolvedValueOnce([{ name: "minimal", path: workflowPath, stepCount: 0 }]);
    vi.mocked(readWorkflow)
      .mockResolvedValueOnce({
        name: "triage",
        description: "Route requests",
        version: "1.0",
        steps: [
          {
            name: "collect",
            agent: "writer",
            description: "Collect facts",
            pattern: "peer-review",
            depends_on: ["ingest"],
            on_fail: { goto: "repair", maxIterations: 2 },
          },
          {
            name: "validate",
            on_fail: { goto: [{ when: "critical", target: "repair" }], maxIterations: 2 },
          },
        ],
      })
      .mockResolvedValueOnce({ name: "triage", steps: [] })
      .mockResolvedValueOnce({ name: "minimal" })
      .mockResolvedValueOnce(null);
    vi.mocked(validateWorkflow)
      .mockResolvedValueOnce({ valid: true, errors: [], warnings: [] })
      .mockResolvedValueOnce({ valid: false, errors: ["missing step"], warnings: [] })
      .mockResolvedValueOnce({ valid: true, errors: [], warnings: [] });

    const command = createWorkflowCommand();

    await command.parseAsync(["list"], { from: "user" });
    await command.parseAsync(["list", "workflows", "--json"], { from: "user" });
    await command.parseAsync(["list", "workflows"], { from: "user" });
    await command.parseAsync(["show", "workflow.yaml"], { from: "user" });
    await command.parseAsync(["show", "workflow.yaml", "--json"], { from: "user" });
    await command.parseAsync(["show", "minimal.yaml"], { from: "user" });
    await command.parseAsync(["show", "missing.yaml"], { from: "user" });
    await command.parseAsync(["create", "workflow.yaml", "--name", "triage", "--description", "Route requests"], { from: "user" });
    await command.parseAsync(["create", "fallback.yaml"], { from: "user" });
    await command.parseAsync(["validate", "workflow.yaml"], { from: "user" });
    await command.parseAsync(["validate", "workflow.yaml"], { from: "user" });
    await command.parseAsync(["validate", "workflow.yaml", "--json"], { from: "user" });
    await command.parseAsync(
      [
        "add-step",
        "workflow.yaml",
        "repair",
        "--agent",
        "writer",
        "--tool",
        "build",
        "--description",
        "Repair output",
        "--depends-on",
        "collect, validate",
        "--pattern",
        "consensus",
        "--participants",
        "writer, reviewer",
        "--input",
        "Patch the failing output",
        "--output-path",
        "artifacts/patch.md",
        "--output-schema",
        "schemas/patch.json",
        "--gate",
        "approval",
        "--gate-type",
        "human",
        "--parallel",
        "writer:prompts/write.md",
        "--parallel",
        "reviewer",
        "--merge",
        "consensus",
        "--config",
        "validation.enabled=true",
        "--config",
        "limits.max=3",
        "--config",
        "temperature=0.25",
        "--hook-pre-step",
        "pnpm build",
        "--hook-post-step",
        "pnpm test",
        "--hook-pre-validation",
        "pnpm lint",
        "--hook-post-cycle",
        "pnpm typecheck",
        "--on-fail-route",
        "critical:repair",
        "--on-fail-route",
        "fallback",
        "--on-fail-max-iterations",
        "4",
        "--on-fail-escalate",
        "human",
        "--on-fail-cooldown-ms",
        "100",
        "--on-fail-reset-state",
        "--on-fail-max-cost",
        "1.5",
        "--on-fail-max-cost-escalation",
        "dlq",
      ],
      { from: "user" },
    );
    await command.parseAsync(["add-step", "workflow.yaml", "retry", "--on-fail-goto", "repair"], { from: "user" });
    await command.parseAsync(["add-step", "workflow.yaml", "minimal"], { from: "user" });
    await command.parseAsync(
      [
        "add-step",
        "workflow.yaml",
        "schema-only",
        "--output-schema",
        "schemas/out.json",
        "--gate-type",
        "approval",
        "--config",
        "flag=false",
        "--config",
        "label=text",
      ],
      { from: "user" },
    );
    await command.parseAsync(
      [
        "add-step",
        "workflow.yaml",
        "path-only",
        "--output-path",
        "artifacts/out.txt",
        "--config",
        "metadata.owner=ops",
        "--config",
        "metadata.retry.max=2",
      ],
      { from: "user" },
    );
    await command.parseAsync(["remove-step", "workflow.yaml", "retry"], { from: "user" });
    await command.parseAsync(["edit-step", "workflow.yaml", "repair", "--agent", "reviewer", "--description", "Review repair", "--depends-on", "collect,repair"], { from: "user" });
    await command.parseAsync(["edit-step", "workflow.yaml", "repair"], { from: "user" });
    const successfulAddStepCalls = vi.mocked(addStep).mock.calls.length;
    await command.parseAsync(["add-step", "workflow.yaml", "bad-config", "--config", "not-a-pair"], { from: "user" });
    await command.parseAsync(
      ["add-step", "workflow.yaml", "bad-route", "--on-fail-route", "too:many:parts"],
      { from: "user" },
    );
    await command.parseAsync(
      ["add-step", "workflow.yaml", "bad-empty-route", "--on-fail-route", ":repair"],
      { from: "user" },
    );
    await command.parseAsync(
      ["add-step", "workflow.yaml", "bad-conflict", "--config", "limits=3", "--config", "limits.max=4"],
      { from: "user" },
    );
    await command.parseAsync(
      ["add-step", "workflow.yaml", "bad-reverse-conflict", "--config", "limits.max=4", "--config", "limits=3"],
      { from: "user" },
    );

    expect(createWorkflow).toHaveBeenCalledWith(workflowPath, {
      name: "triage",
      description: "Route requests",
    });
    expect(addStep).toHaveBeenCalledWith(
      workflowPath,
      expect.objectContaining({
        name: "repair",
        agent: "writer",
        tool: "build",
        dependsOn: ["collect", "validate"],
        participants: ["writer", "reviewer"],
        input: { task: "Patch the failing output" },
        output: { path: "artifacts/patch.md", schema: "schemas/patch.json" },
        config: { validation: { enabled: true }, limits: { max: 3 }, temperature: 0.25 },
        hooks: {
          pre_step: { shell: "pnpm build" },
          post_step: { shell: "pnpm test" },
          pre_validation: { shell: "pnpm lint" },
          post_cycle: { shell: "pnpm typecheck" },
        },
        gate: { type: "human", name: "approval" },
        parallel: [{ agent: "writer", prompt_file: "prompts/write.md" }, { agent: "reviewer" }],
        merge: "consensus",
        onFail: {
          goto: [{ when: "critical", target: "repair" }, { target: "fallback" }],
          maxIterations: 4,
          escalateOnExhaust: "human",
          cooldownMs: 100,
          resetState: true,
          maxCost: 1.5,
          maxCostEscalation: "dlq",
        },
      }),
    );
    expect(addStep).toHaveBeenCalledWith(
      workflowPath,
      expect.objectContaining({ name: "retry", onFail: { goto: "repair", maxIterations: 3 } }),
    );
    expect(addStep).toHaveBeenCalledWith(
      workflowPath,
      expect.objectContaining({ name: "minimal", config: undefined, onFail: undefined }),
    );
    expect(addStep).toHaveBeenCalledWith(
      workflowPath,
      expect.objectContaining({
        name: "schema-only",
        output: { schema: "schemas/out.json" },
        gate: { type: "approval" },
        config: { flag: false, label: "text" },
        onFail: undefined,
      }),
    );
    expect(addStep).toHaveBeenCalledWith(
      workflowPath,
      expect.objectContaining({
        name: "path-only",
        output: { path: "artifacts/out.txt" },
        config: { metadata: { owner: "ops", retry: { max: 2 } } },
        onFail: undefined,
      }),
    );
    expect(addStep).toHaveBeenCalledTimes(successfulAddStepCalls);
    expect(removeStep).toHaveBeenCalledWith(workflowPath, "retry");
    expect(updateStep).toHaveBeenCalledWith(
      workflowPath,
      "repair",
      { agent: "reviewer", description: "Review repair", depends_on: ["collect", "repair"] },
    );
    expect(updateStep).toHaveBeenCalledWith(workflowPath, "repair", {});
  });

  it("shows merged config, sources, auth, and path lookups", async () => {
    const globalPath = join(homedir(), ".obora", "config.yaml");
    const projectPath = resolve(".obora/config.yaml");
    const mergedConfig = {
      defaults: { provider: "openai" },
      agents: { writer: { model: "gpt-5" } },
      [Symbol.for("obora.config.meta")]: { sources: [globalPath, projectPath] },
    };
    vi.mocked(getDefaultAuthFilePath).mockReturnValue("/tmp/obora-auth.json");
    vi.mocked(readFile)
      .mockResolvedValueOnce(JSON.stringify({ providers: { openai: { type: "apiKey", apiKey: "sk-test1234" } } }))
      .mockResolvedValueOnce("defaults:\n  provider: anthropic\n")
      .mockResolvedValueOnce("defaults:\n  provider: openai\n")
      .mockRejectedValueOnce(new Error("missing auth"));
    vi.mocked(loadConfig)
      .mockResolvedValueOnce(mergedConfig)
      .mockResolvedValueOnce(mergedConfig)
      .mockResolvedValueOnce(mergedConfig)
      .mockResolvedValueOnce(mergedConfig)
      .mockResolvedValueOnce(mergedConfig)
      .mockResolvedValueOnce(undefined);

    const command = createConfigCommand();

    await command.parseAsync(["show", "--json", "--sources"], { from: "user" });
    await command.parseAsync(["get", "agents.writer.model"], { from: "user" });
    await command.parseAsync(["get", "defaults", "--json"], { from: "user" });
    await command.parseAsync(["get", "defaults.provider.name"], { from: "user" });
    await command.parseAsync(["get", "missing.path"], { from: "user" });
    await command.parseAsync(["show", "--sources"], { from: "user" });

    expect(maskProviderAuth).toHaveBeenCalledWith({ type: "apiKey", apiKey: "sk-test1234" });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('"sources"'));
    expect(console.log).toHaveBeenCalledWith("gpt-5");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("No value found at path: missing.path"));
  });
});
