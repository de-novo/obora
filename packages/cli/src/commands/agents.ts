import {
  buildExecutionAgentInventory,
  buildExecutionAgentSnapshot,
  Workflow,
  type ExecutionAgentInventoryEntry,
  type WorkflowDef,
} from "@obora/sdk";
import { Command } from "commander";

import { handleCommandAction } from "../utils/error-handler.js";
import { CLIError } from "../utils/cli-error.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts, type GlobalOptions } from "../utils/global-opts.js";

interface AgentsCommandOptions {
  json?: boolean;
  agents?: string;
  workflow?: string;
}

interface AgentExecutionContext {
  agentsPath?: string;
  workflow?: WorkflowDef;
}

interface AgentListSummary {
  name: string;
  status: "resolved" | "unresolved";
  provider?: string;
  model?: string;
  sources: {
    config: boolean;
    agentsPath: boolean;
    workflow: boolean;
    runtime: boolean;
  };
  warnings: string[];
}

function shouldOutputJson(localJson: boolean | undefined, globalOpts: GlobalOptions): boolean {
  return Boolean(localJson || globalOpts.json);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadAgentExecutionContext(
  options: AgentsCommandOptions
): Promise<AgentExecutionContext> {
  try {
    return {
      agentsPath: options.agents,
      workflow: options.workflow ? await Workflow.fromYaml(options.workflow) : undefined,
    };
  } catch (error) {
    throw new CLIError(
      `Failed to load agent context: ${getErrorMessage(error)}`,
      ExitCode.EXECUTION_FAILED
    );
  }
}

async function loadAgentInventory(
  cwd: string,
  context: AgentExecutionContext
): Promise<ExecutionAgentInventoryEntry[]> {
  try {
    return await buildExecutionAgentInventory({
      cwd,
      agentsPath: context.agentsPath,
      workflow: context.workflow,
      runtimeAgents: new Map(),
    });
  } catch (error) {
    throw new CLIError(
      `Failed to load agent inventory: ${getErrorMessage(error)}`,
      ExitCode.EXECUTION_FAILED
    );
  }
}

function ensureVisibleAgent(name: string, inventory: ExecutionAgentInventoryEntry[]): void {
  if (!inventory.some((entry) => entry.name === name)) {
    throw new CLIError(`Agent not found in visible sources: ${name}`, ExitCode.VALIDATION_ERROR);
  }
}

async function loadExecutionSnapshot(
  cwd: string,
  agentName: string,
  context: AgentExecutionContext
) {
  try {
    return await buildExecutionAgentSnapshot({
      cwd,
      agentName,
      agentsPath: context.agentsPath,
      workflow: context.workflow,
      runtimeAgents: new Map(),
    });
  } catch (error) {
    throw new CLIError(
      `Failed to build agent snapshot: ${getErrorMessage(error)}`,
      ExitCode.EXECUTION_FAILED
    );
  }
}

function buildAgentListSummary(
  entry: ExecutionAgentInventoryEntry,
  snapshot: Awaited<ReturnType<typeof loadExecutionSnapshot>>
): AgentListSummary {
  return {
    name: entry.name,
    status: snapshot.base.status,
    ...(snapshot.base.status === "resolved" &&
    snapshot.base.resolved.provider &&
    snapshot.base.resolved.model
      ? {
          provider: snapshot.base.resolved.provider,
          model: snapshot.base.resolved.model,
        }
      : {}),
    sources: entry.sources,
    warnings: snapshot.base.warnings,
  };
}

function formatAppliedValues(applied: Record<string, unknown>): string {
  const entries = Object.entries(applied);
  if (entries.length === 0) {
    return "none";
  }

  return entries.map(([key, value]) => `${key}=${String(value)}`).join(", ");
}

function formatSourceBadges(summary: AgentListSummary): string {
  const badges: string[] = [];
  if (summary.sources.config) badges.push("config");
  if (summary.sources.agentsPath) badges.push("agentsPath");
  if (summary.sources.workflow) badges.push("workflow");
  if (summary.sources.runtime) badges.push("runtime");
  return badges.length > 0 ? `[${badges.join(" ")}]` : "[]";
}

function printAgentListText(summaries: AgentListSummary[]): void {
  console.log("Agent inventory");
  for (const summary of summaries) {
    const modelInfo =
      summary.provider && summary.model ? `${summary.provider}/${summary.model}` : "";
    const warningSuffix = summary.warnings.length > 0 ? ` warnings=${summary.warnings.length}` : "";
    console.log(
      `- ${summary.name}  ${summary.status}${modelInfo ? ` ${modelInfo}` : ""} ${formatSourceBadges(summary)}${warningSuffix}`
    );
  }
}

function printAgentShowText(snapshot: Awaited<ReturnType<typeof loadExecutionSnapshot>>): void {
  const resolvedProvider = snapshot.base.resolved.provider;
  const resolvedModel = snapshot.base.resolved.model;

  console.log(`Agent: ${snapshot.base.agentName}`);
  console.log(`Status: ${snapshot.base.status}`);
  console.log(
    `Effective model: ${resolvedProvider && resolvedModel ? `${resolvedProvider} / ${resolvedModel}` : "n/a"}`
  );
  console.log("");
  console.log("Config provenance");
  if (snapshot.base.layers.length === 0) {
    console.log("- none");
  } else {
    for (const layer of snapshot.base.layers) {
      console.log(
        `- ${layer.label}: ${formatAppliedValues(layer.applied as Record<string, unknown>)}`
      );
    }
  }
  console.log("");
  console.log("Execution sources");
  console.log(
    `- agentsPath: ${snapshot.effectiveExecutionView.hasAgentsPathEntry ? "present" : "absent"}`
  );
  console.log(
    `- workflow-agents: ${snapshot.effectiveExecutionView.hasWorkflowAgentEntry ? "present" : "absent"}`
  );
  console.log(
    `- runtime-registration: ${snapshot.effectiveExecutionView.hasRuntimeRegistration ? "present" : "absent"}`
  );
  console.log("");
  console.log("Warnings");
  if (snapshot.base.warnings.length === 0) {
    console.log("- none");
  } else {
    for (const warning of snapshot.base.warnings) {
      console.log(`- ${warning}`);
    }
  }
  if (snapshot.base.failure) {
    console.log("");
    console.log("Failure");
    console.log(`- ${snapshot.base.failure.code}: ${snapshot.base.failure.message}`);
  }
}

async function runAgentsList(
  options: AgentsCommandOptions,
  globalOpts: GlobalOptions
): Promise<void> {
  const cwd = process.cwd();
  const json = shouldOutputJson(options.json, globalOpts);
  const context = await loadAgentExecutionContext(options);
  const inventory = await loadAgentInventory(cwd, context);
  const snapshots = await Promise.all(
    inventory.map(async (entry) =>
      buildAgentListSummary(entry, await loadExecutionSnapshot(cwd, entry.name, context))
    )
  );

  if (json) {
    formatter.json({
      command: "agents list",
      mode: "summary",
      agents: snapshots,
    });
    return;
  }

  printAgentListText(snapshots);
}

async function runAgentsShow(
  agentName: string,
  options: AgentsCommandOptions,
  globalOpts: GlobalOptions
): Promise<void> {
  const cwd = process.cwd();
  const json = shouldOutputJson(options.json, globalOpts);
  const context = await loadAgentExecutionContext(options);
  const inventory = await loadAgentInventory(cwd, context);
  ensureVisibleAgent(agentName, inventory);
  const snapshot = await loadExecutionSnapshot(cwd, agentName, context);

  if (json) {
    formatter.json({
      command: "agents show",
      agentName,
      status: snapshot.base.status,
      ...snapshot,
    });
    return;
  }

  printAgentShowText(snapshot);
}

export function createAgentsCommand(): Command {
  const agents = new Command("agents").description(
    "Inspect visible agent resolution without mutating config"
  );

  agents
    .command("list")
    .description("List visible agents with compact resolution summaries")
    .option("--json", "Output as JSON")
    .option("--agents <path>", "Inspect agentsPath YAML visibility")
    .option("--workflow <path>", "Inspect workflow-local agent visibility from a workflow YAML")
    .action(async function (this: Command, options: AgentsCommandOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runAgentsList(options, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  agents
    .command("show <name>")
    .description("Show config provenance and execution visibility for an agent")
    .option("--json", "Output as JSON")
    .option("--agents <path>", "Inspect agentsPath YAML visibility")
    .option("--workflow <path>", "Inspect workflow-local agent visibility from a workflow YAML")
    .action(async function (this: Command, name: string, options: AgentsCommandOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runAgentsShow(name, options, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  return agents;
}
