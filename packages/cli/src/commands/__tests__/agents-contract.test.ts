import { resolve } from "node:path";

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const agentsState: {
  inventory: Array<{ name: string; source: "config" | "default-fallback" }>;
  executionInventory: Array<{
    name: string;
    sources: { config: boolean; agentsPath: boolean; workflow: boolean; runtime: boolean };
  }>;
  snapshots: Record<string, unknown>;
  workflows: Record<string, unknown>;
} = {
  inventory: [],
  executionInventory: [],
  snapshots: {},
  workflows: {},
};

vi.mock("@obora/adapters", () => ({
  AgentConfigResolver: {
    create: vi.fn(async () => ({
      listAgentInventory: () => agentsState.inventory,
    })),
  },
  previewAgentOverride: vi.fn(),
  applyAgentOverride: vi.fn(),
}));

vi.mock("@obora/sdk", () => ({
  buildExecutionAgentInventory: vi.fn(async () => agentsState.executionInventory),
  buildExecutionAgentSnapshot: vi.fn(async ({ agentName }: { agentName: string }) => {
    const snapshot = agentsState.snapshots[agentName];
    if (!snapshot) {
      throw new Error(`Unexpected snapshot request: ${agentName}`);
    }
    return snapshot;
  }),
  Workflow: {
    fromYaml: vi.fn(async (path: string) => {
      const workflow = agentsState.workflows[path];
      if (!workflow) {
        throw new Error(`Unexpected workflow request: ${path}`);
      }
      return workflow;
    }),
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

import { applyAgentOverride, previewAgentOverride } from "@obora/adapters";
import { buildExecutionAgentInventory, buildExecutionAgentSnapshot, Workflow } from "@obora/sdk";

import { createAgentsCommand } from "../agents.js";
import { ExitCode } from "../../utils/exit-codes.js";

function makeSnapshot(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    base: {
      agentName: "reviewer",
      status: "resolved",
      resolved: {
        provider: "openai",
        model: "gpt-5",
        timeout: 90,
      },
      layers: [
        {
          kind: "project-agent",
          label: "Project agent (reviewer)",
          applied: { timeout: 90 },
        },
      ],
      warnings: [],
    },
    executionSources: [],
    effectiveExecutionView: {
      agentName: "reviewer",
      hasAgentsPathEntry: false,
      hasWorkflowAgentEntry: false,
      hasRuntimeRegistration: false,
    },
    ...overrides,
  };
}

describe("agents command contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? "undefined"}`);
    }) as never);
    process.exitCode = undefined;
    agentsState.inventory = [];
    agentsState.executionInventory = [];
    agentsState.snapshots = {};
    agentsState.workflows = {};
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("supports local --json for agents list summaries", async () => {
    agentsState.inventory = [
      { name: "critic", source: "config" },
      { name: "reviewer", source: "config" },
    ];
    agentsState.executionInventory = [
      {
        name: "critic",
        sources: { config: true, agentsPath: false, workflow: false, runtime: false },
      },
      {
        name: "reviewer",
        sources: { config: true, agentsPath: false, workflow: false, runtime: false },
      },
    ];
    agentsState.snapshots = {
      reviewer: makeSnapshot(),
      critic: makeSnapshot({
        base: {
          agentName: "critic",
          status: "unresolved",
          resolved: {},
          layers: [],
          warnings: ["provider/model is required"],
          failure: {
            code: "provider-model-required",
            message: "Unable to resolve agent config for 'critic': provider/model is required",
          },
        },
        effectiveExecutionView: {
          agentName: "critic",
          hasAgentsPathEntry: false,
          hasWorkflowAgentEntry: false,
          hasRuntimeRegistration: false,
        },
      }),
    };

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createAgentsCommand();

    await cmd.parseAsync(["list", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual({
      command: "agents list",
      mode: "summary",
      agents: [
        {
          name: "critic",
          status: "unresolved",
          sources: {
            config: true,
            agentsPath: false,
            workflow: false,
            runtime: false,
          },
          warnings: ["provider/model is required"],
        },
        {
          name: "reviewer",
          status: "resolved",
          provider: "openai",
          model: "gpt-5",
          sources: {
            config: true,
            agentsPath: false,
            workflow: false,
            runtime: false,
          },
          warnings: [],
        },
      ],
    });
  });

  it("inherits root --json for agents show output", async () => {
    agentsState.inventory = [{ name: "reviewer", source: "config" }];
    agentsState.executionInventory = [
      {
        name: "reviewer",
        sources: { config: true, agentsPath: false, workflow: false, runtime: false },
      },
    ];
    agentsState.snapshots = {
      reviewer: makeSnapshot(),
    };

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = new Command("obora").option("--json");
    root.addCommand(createAgentsCommand());

    await root.parseAsync(["--json", "agents", "show", "reviewer"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual({
      command: "agents show",
      agentName: "reviewer",
      status: "resolved",
      context: {
        cwd: process.cwd(),
      },
      ...makeSnapshot(),
    });
  });

  it("preserves compact human-readable text output", async () => {
    agentsState.inventory = [
      { name: "reviewer", source: "config" },
      { name: "critic", source: "config" },
    ];
    agentsState.executionInventory = [
      {
        name: "reviewer",
        sources: { config: true, agentsPath: false, workflow: false, runtime: false },
      },
      {
        name: "critic",
        sources: { config: true, agentsPath: false, workflow: false, runtime: false },
      },
    ];
    agentsState.snapshots = {
      reviewer: makeSnapshot(),
      critic: makeSnapshot({
        base: {
          agentName: "critic",
          status: "unresolved",
          resolved: {},
          layers: [],
          warnings: ["provider/model is required"],
          failure: {
            code: "provider-model-required",
            message: "Unable to resolve agent config for 'critic': provider/model is required",
          },
        },
        effectiveExecutionView: {
          agentName: "critic",
          hasAgentsPathEntry: false,
          hasWorkflowAgentEntry: false,
          hasRuntimeRegistration: false,
        },
      }),
    };

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createAgentsCommand();

    await cmd.parseAsync(["list"], { from: "user" });

    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Agent inventory");
    expect(output).toContain("reviewer");
    expect(output).toContain("openai/gpt-5");
    expect(output).toContain("critic");
    expect(output).toContain("warnings=1");
  });

  it("supports default fallback inventory entries", async () => {
    agentsState.inventory = [{ name: "default", source: "default-fallback" }];
    agentsState.executionInventory = [
      {
        name: "default",
        sources: { config: true, agentsPath: false, workflow: false, runtime: false },
      },
    ];
    agentsState.snapshots = {
      default: makeSnapshot({
        base: {
          agentName: "default",
          status: "resolved",
          resolved: {
            provider: "openai",
            model: "gpt-5",
            timeout: 120,
          },
          layers: [
            {
              kind: "builtin-defaults",
              label: "Built-in defaults",
              applied: {
                provider: "openai",
                model: "gpt-5",
                timeout: 120,
              },
            },
          ],
          warnings: [],
        },
        effectiveExecutionView: {
          agentName: "default",
          hasAgentsPathEntry: false,
          hasWorkflowAgentEntry: false,
          hasRuntimeRegistration: false,
        },
      }),
    };

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createAgentsCommand();

    await cmd.parseAsync(["show", "default", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual({
      command: "agents show",
      agentName: "default",
      status: "resolved",
      context: {
        cwd: process.cwd(),
      },
      ...(agentsState.snapshots.default as object),
    });
  });

  it("shows context path summary in human-readable agents show output", async () => {
    agentsState.inventory = [{ name: "reviewer", source: "config" }];
    agentsState.executionInventory = [
      {
        name: "reviewer",
        sources: { config: true, agentsPath: true, workflow: true, runtime: false },
      },
    ];
    agentsState.workflows["workflow.yaml"] = {
      name: "workflow-context",
      agents: {
        reviewer: { role: "Workflow Reviewer" },
      },
      steps: [],
    };
    agentsState.snapshots = {
      reviewer: makeSnapshot({
        effectiveExecutionView: {
          agentName: "reviewer",
          hasAgentsPathEntry: true,
          hasWorkflowAgentEntry: true,
          hasRuntimeRegistration: false,
        },
      }),
    };

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createAgentsCommand();

    await cmd.parseAsync(
      ["show", "reviewer", "--agents", "agents.yaml", "--workflow", "workflow.yaml"],
      { from: "user" }
    );

    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Context");
    expect(output).toContain(`- cwd: ${process.cwd()}`);
    expect(output).toContain(`- agentsPath: ${resolve(process.cwd(), "agents.yaml")}`);
    expect(output).toContain(`- workflow: ${resolve(process.cwd(), "workflow.yaml")}`);
    expect(output).toContain("Execution sources");
  });

  it("includes execution-only agents when context files are provided", async () => {
    agentsState.executionInventory = [
      {
        name: "reviewer",
        sources: { config: true, agentsPath: true, workflow: true, runtime: false },
      },
      {
        name: "yaml-only",
        sources: { config: false, agentsPath: true, workflow: false, runtime: false },
      },
      {
        name: "workflow-only",
        sources: { config: false, agentsPath: false, workflow: true, runtime: false },
      },
    ];
    agentsState.workflows["workflow.yaml"] = {
      name: "workflow-context",
      agents: {
        reviewer: { role: "Workflow Reviewer" },
        "workflow-only": { role: "Workflow Only" },
      },
      steps: [],
    };
    agentsState.snapshots = {
      reviewer: makeSnapshot({
        effectiveExecutionView: {
          agentName: "reviewer",
          hasAgentsPathEntry: true,
          hasWorkflowAgentEntry: true,
          hasRuntimeRegistration: false,
        },
      }),
      "yaml-only": makeSnapshot({
        base: {
          agentName: "yaml-only",
          status: "resolved",
          resolved: {
            provider: "openai",
            model: "gpt-5",
            timeout: 120,
          },
          layers: [],
          warnings: [],
        },
        effectiveExecutionView: {
          agentName: "yaml-only",
          hasAgentsPathEntry: true,
          hasWorkflowAgentEntry: false,
          hasRuntimeRegistration: false,
        },
      }),
      "workflow-only": makeSnapshot({
        base: {
          agentName: "workflow-only",
          status: "resolved",
          resolved: {
            provider: "openai",
            model: "gpt-5",
            timeout: 120,
          },
          layers: [],
          warnings: [],
        },
        effectiveExecutionView: {
          agentName: "workflow-only",
          hasAgentsPathEntry: false,
          hasWorkflowAgentEntry: true,
          hasRuntimeRegistration: false,
        },
      }),
    };

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createAgentsCommand();

    await cmd.parseAsync(
      ["list", "--json", "--agents", "agents.yaml", "--workflow", "workflow.yaml"],
      { from: "user" }
    );

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(Workflow.fromYaml).toHaveBeenCalledWith("workflow.yaml");
    expect(buildExecutionAgentInventory).toHaveBeenCalledWith({
      cwd: process.cwd(),
      agentsPath: "agents.yaml",
      workflow: agentsState.workflows["workflow.yaml"],
      runtimeAgents: new Map(),
    });
    expect(payload).toEqual({
      command: "agents list",
      mode: "summary",
      agents: [
        {
          name: "reviewer",
          status: "resolved",
          provider: "openai",
          model: "gpt-5",
          sources: { config: true, agentsPath: true, workflow: true, runtime: false },
          warnings: [],
        },
        {
          name: "yaml-only",
          status: "resolved",
          provider: "openai",
          model: "gpt-5",
          sources: { config: false, agentsPath: true, workflow: false, runtime: false },
          warnings: [],
        },
        {
          name: "workflow-only",
          status: "resolved",
          provider: "openai",
          model: "gpt-5",
          sources: { config: false, agentsPath: false, workflow: true, runtime: false },
          warnings: [],
        },
      ],
    });
  });

  it("supports dry-run json preview for agents set", async () => {
    vi.mocked(previewAgentOverride).mockResolvedValueOnce({
      action: "set",
      scope: "project",
      agentName: "reviewer",
      targetPath: `${process.cwd()}/.obora/config.yaml`,
      before: { provider: "openai", model: "gpt-4.1" },
      after: { provider: "openai", model: "gpt-5.4", timeout: 90 },
      warnings: [],
      nextConfigDocument: {
        agents: {
          reviewer: {
            provider: "openai",
            model: "gpt-5.4",
            timeout: 90,
          },
        },
      },
      nextYaml: [
        "agents:",
        "  reviewer:",
        "    provider: openai",
        "    model: gpt-5.4",
        "    timeout: 90",
      ].join("\n"),
    });

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createAgentsCommand();

    await cmd.parseAsync(
      ["set", "reviewer", "--provider", "openai", "--model", "gpt-5.4", "--dry-run", "--json"],
      { from: "user" }
    );

    expect(applyAgentOverride).not.toHaveBeenCalled();
    expect(previewAgentOverride).toHaveBeenCalledWith({
      action: "set",
      scope: "project",
      cwd: process.cwd(),
      agentName: "reviewer",
      provider: "openai",
      model: "gpt-5.4",
    });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual({
      command: "agents set",
      mode: "preview",
      scope: "project",
      agentName: "reviewer",
      targetPath: `${process.cwd()}/.obora/config.yaml`,
      requested: { provider: "openai", model: "gpt-5.4" },
      resolvedOverride: { provider: "openai", model: "gpt-5.4" },
      changedKeys: ["model", "timeout"],
      before: { provider: "openai", model: "gpt-4.1" },
      after: { provider: "openai", model: "gpt-5.4", timeout: 90 },
      warnings: [],
      nextCommand: "obora agents show reviewer",
    });
  });

  it("supports dry-run json preview for model-only agents set", async () => {
    vi.mocked(previewAgentOverride).mockResolvedValueOnce({
      action: "set",
      scope: "project",
      agentName: "reviewer",
      targetPath: `${process.cwd()}/.obora/config.yaml`,
      before: { provider: "openai", model: "gpt-4.1", timeout: 90 },
      after: { provider: "openai", model: "gpt-5.4", timeout: 90 },
      warnings: [],
      nextConfigDocument: {
        agents: {
          reviewer: {
            provider: "openai",
            model: "gpt-5.4",
            timeout: 90,
          },
        },
      },
      nextYaml: [
        "agents:",
        "  reviewer:",
        "    provider: openai",
        "    model: gpt-5.4",
        "    timeout: 90",
      ].join("\n"),
    });

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createAgentsCommand();

    await cmd.parseAsync(["set", "reviewer", "--model", "gpt-5.4", "--dry-run", "--json"], {
      from: "user",
    });

    expect(applyAgentOverride).not.toHaveBeenCalled();
    expect(previewAgentOverride).toHaveBeenCalledWith({
      action: "set",
      scope: "project",
      cwd: process.cwd(),
      agentName: "reviewer",
      model: "gpt-5.4",
    });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual({
      command: "agents set",
      mode: "preview",
      scope: "project",
      agentName: "reviewer",
      targetPath: `${process.cwd()}/.obora/config.yaml`,
      requested: { model: "gpt-5.4" },
      resolvedOverride: { provider: "openai", model: "gpt-5.4" },
      changedKeys: ["model"],
      before: { provider: "openai", model: "gpt-4.1", timeout: 90 },
      after: { provider: "openai", model: "gpt-5.4", timeout: 90 },
      warnings: [],
      nextCommand: "obora agents show reviewer",
    });
  });

  it("inherits root --json for applied agents reset output", async () => {
    vi.mocked(applyAgentOverride).mockResolvedValueOnce({
      action: "reset",
      scope: "global",
      agentName: "reviewer",
      targetPath: "/Users/test/.obora/config.yaml",
      before: { provider: "openai", model: "gpt-5.4" },
      after: null,
      warnings: [],
      nextConfigDocument: { agents: {} },
      nextYaml: "agents: {}\n",
    });

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = new Command("obora").option("--json");
    root.addCommand(createAgentsCommand());

    await root.parseAsync(["--json", "agents", "reset", "reviewer", "--scope", "global"], {
      from: "user",
    });

    expect(previewAgentOverride).not.toHaveBeenCalled();
    expect(applyAgentOverride).toHaveBeenCalledWith({
      action: "reset",
      scope: "global",
      cwd: process.cwd(),
      agentName: "reviewer",
    });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual({
      command: "agents reset",
      mode: "applied",
      scope: "global",
      agentName: "reviewer",
      targetPath: "/Users/test/.obora/config.yaml",
      changedKeys: ["model", "provider"],
      before: { provider: "openai", model: "gpt-5.4" },
      after: null,
      warnings: [],
      nextCommand: "obora agents list",
    });
  });

  it("prints compact human-readable text for agents set preview", async () => {
    vi.mocked(previewAgentOverride).mockResolvedValueOnce({
      action: "set",
      scope: "project",
      agentName: "reviewer",
      targetPath: `${process.cwd()}/.obora/config.yaml`,
      before: { provider: "openai", model: "gpt-4.1" },
      after: { provider: "openai", model: "gpt-5.4", timeout: 90 },
      warnings: [],
      nextConfigDocument: {},
      nextYaml: "",
    });

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createAgentsCommand();

    await cmd.parseAsync(
      ["set", "reviewer", "--provider", "openai", "--model", "gpt-5.4", "--dry-run"],
      { from: "user" }
    );

    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Agent override preview");
    expect(output).toContain("- action: set");
    expect(output).toContain("- scope: project");
    expect(output).toContain("- target: ");
    expect(output).toContain("- requested: provider=openai, model=gpt-5.4");
    expect(output).toContain("- resolved override: provider=openai, model=gpt-5.4");
    expect(output).toContain("- changed: model, timeout");
    expect(output).toContain("- next: obora agents show reviewer");
  });

  it("uses validation exit code for mutation validation failures", async () => {
    vi.mocked(applyAgentOverride).mockRejectedValueOnce(
      new Error("Agent override preview requires at least one of provider or model")
    );

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createAgentsCommand();

    await cmd.parseAsync(["set", "reviewer"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
  });

  it("uses execution-failed exit code when applying agent override fails", async () => {
    vi.mocked(applyAgentOverride).mockRejectedValueOnce(
      new Error("Failed to write agent override: disk locked")
    );

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createAgentsCommand();

    await cmd.parseAsync(["reset", "reviewer"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalled();
  });

  it("uses validation exit code for agents missing from visible inventory", async () => {
    agentsState.inventory = [{ name: "reviewer", source: "config" }];

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createAgentsCommand();

    await cmd.parseAsync(["show", "missing-agent"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
    expect(buildExecutionAgentSnapshot).not.toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora run <workflow.yaml> --dry-run"
    );
  });

  it("uses execution-failed exit code when workflow context cannot be loaded", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createAgentsCommand();

    await cmd.parseAsync(["list", "--workflow", "missing-workflow.yaml"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalled();
    expect(buildExecutionAgentInventory).not.toHaveBeenCalled();
  });

  it("uses execution-failed exit code when snapshot building fails", async () => {
    agentsState.inventory = [{ name: "reviewer", source: "config" }];
    agentsState.executionInventory = [
      {
        name: "reviewer",
        sources: { config: true, agentsPath: false, workflow: false, runtime: false },
      },
    ];
    vi.mocked(buildExecutionAgentSnapshot).mockRejectedValueOnce(new Error("config disk offline"));

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createAgentsCommand();

    await cmd.parseAsync(["show", "reviewer"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalled();
  });
});
