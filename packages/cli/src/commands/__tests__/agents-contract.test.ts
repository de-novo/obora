import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const agentsState: {
  inventory: Array<{ name: string; source: "config" | "default-fallback" }>;
  snapshots: Record<string, unknown>;
} = {
  inventory: [],
  snapshots: {},
};

vi.mock("@obora/adapters", () => ({
  AgentConfigResolver: {
    create: vi.fn(async () => ({
      listAgentInventory: () => agentsState.inventory,
    })),
  },
}));

vi.mock("@obora/sdk", () => ({
  buildExecutionAgentSnapshot: vi.fn(async ({ agentName }: { agentName: string }) => {
    const snapshot = agentsState.snapshots[agentName];
    if (!snapshot) {
      throw new Error(`Unexpected snapshot request: ${agentName}`);
    }
    return snapshot;
  }),
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

import { buildExecutionAgentSnapshot } from "@obora/sdk";

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
    agentsState.snapshots = {};
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
      ...makeSnapshot(),
    });
  });

  it("preserves compact human-readable text output", async () => {
    agentsState.inventory = [
      { name: "reviewer", source: "config" },
      { name: "critic", source: "config" },
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
      ...agentsState.snapshots.default,
    });
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

  it("uses execution-failed exit code when snapshot building fails", async () => {
    agentsState.inventory = [{ name: "reviewer", source: "config" }];
    vi.mocked(buildExecutionAgentSnapshot).mockRejectedValueOnce(new Error("config disk offline"));

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createAgentsCommand();

    await cmd.parseAsync(["show", "reviewer"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalled();
  });
});
