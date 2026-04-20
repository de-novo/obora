import { resolve as resolvePath } from "node:path";

import {
  applyAgentOverride,
  previewAgentOverride,
  type AgentOverridePreview,
} from "@obora/adapters";
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

interface AgentsMutationOptions {
  json?: boolean;
  scope?: string;
  dryRun?: boolean;
  provider?: string;
  model?: string;
}

interface AgentExecutionContext {
  agentsPath?: string;
  workflow?: WorkflowDef;
}

interface AgentContextSummary {
  cwd: string;
  agentsPath?: string;
  workflow?: string;
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

function buildAgentContextSummary(cwd: string, options: AgentsCommandOptions): AgentContextSummary {
  return {
    cwd,
    ...(options.agents ? { agentsPath: resolvePath(cwd, options.agents) } : {}),
    ...(options.workflow ? { workflow: resolvePath(cwd, options.workflow) } : {}),
  };
}

function formatContextPath(path?: string): string {
  return path ?? "not provided";
}

function getNextAgentCommand(action: "set" | "reset", agentName: string): string {
  return action === "set" ? `obora agents show ${agentName}` : "obora agents list";
}

function isMutationValidationMessage(message: string): boolean {
  return (
    message.startsWith("Invalid agents scope:") ||
    message === "Agent override preview requires at least one of provider or model" ||
    message ===
      "Model-only override requires an existing provider in target config; pass --provider explicitly" ||
    message ===
      "Provider-only override requires an existing model in target config; pass --model explicitly" ||
    message.startsWith("Unsupported agent provider override:") ||
    message.startsWith("Unsupported agent model override for provider")
  );
}

function toMutationCLIError(error: unknown): CLIError {
  const message = getErrorMessage(error);

  if (isMutationValidationMessage(message)) {
    return new CLIError(message, ExitCode.VALIDATION_ERROR);
  }

  return new CLIError(message, ExitCode.EXECUTION_FAILED);
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

function printAgentShowText(
  snapshot: Awaited<ReturnType<typeof loadExecutionSnapshot>>,
  context: AgentContextSummary
): void {
  const resolvedProvider = snapshot.base.resolved.provider;
  const resolvedModel = snapshot.base.resolved.model;

  console.log(`Agent: ${snapshot.base.agentName}`);
  console.log(`Status: ${snapshot.base.status}`);
  console.log(
    `Effective model: ${resolvedProvider && resolvedModel ? `${resolvedProvider} / ${resolvedModel}` : "n/a"}`
  );
  console.log("");
  console.log("Context");
  console.log(`- cwd: ${context.cwd}`);
  console.log(`- agentsPath: ${formatContextPath(context.agentsPath)}`);
  console.log(`- workflow: ${formatContextPath(context.workflow)}`);
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

function formatMutationValues(values: AgentOverridePreview["before"]): string {
  if (!values) {
    return "none";
  }

  return formatAppliedValues(values as Record<string, unknown>);
}

function toRecord(values: AgentOverridePreview["before"]): Record<string, unknown> {
  return values ? (values as Record<string, unknown>) : {};
}

function buildRequestedMutationValues(
  action: "set" | "reset",
  options: AgentsMutationOptions
): Partial<Record<"provider" | "model", string>> {
  if (action !== "set") {
    return {};
  }

  return {
    ...(options.provider ? { provider: options.provider } : {}),
    ...(options.model ? { model: options.model } : {}),
  };
}

function buildResolvedMutationValues(
  action: "set" | "reset",
  result: AgentOverridePreview
): Partial<Record<"provider" | "model", string>> {
  if (action !== "set" || !result.after) {
    return {};
  }

  return {
    ...(result.after.provider ? { provider: result.after.provider } : {}),
    ...(result.after.model ? { model: result.after.model } : {}),
  };
}

function buildChangedMutationKeys(result: AgentOverridePreview): string[] {
  const before = toRecord(result.before);
  const after = toRecord(result.after);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return keys.filter((key) => !Object.is(before[key], after[key]));
}

function printAgentMutationText(
  result: AgentOverridePreview,
  mode: "preview" | "applied",
  summary: {
    requested: Partial<Record<"provider" | "model", string>>;
    resolvedOverride: Partial<Record<"provider" | "model", string>>;
    changedKeys: string[];
  }
): void {
  console.log(mode === "preview" ? "Agent override preview" : "Agent override applied");
  console.log(`- action: ${result.action}`);
  console.log(`- scope: ${result.scope}`);
  console.log(`- target: ${result.targetPath}`);
  console.log(`- agent: ${result.agentName}`);
  if (Object.keys(summary.requested).length > 0) {
    console.log(`- requested: ${formatAppliedValues(summary.requested)}`);
  }
  if (Object.keys(summary.resolvedOverride).length > 0) {
    console.log(`- resolved override: ${formatAppliedValues(summary.resolvedOverride)}`);
  }
  console.log(`- changed: ${summary.changedKeys.join(", ") || "none"}`);
  console.log(`- before: ${formatMutationValues(result.before)}`);
  console.log(`- after: ${formatMutationValues(result.after)}`);
  if (result.warnings.length > 0) {
    console.log(`- warnings: ${result.warnings.join(" | ")}`);
  }
  console.log(`- next: ${getNextAgentCommand(result.action, result.agentName)}`);
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
  const contextSummary = buildAgentContextSummary(cwd, options);
  const context = await loadAgentExecutionContext(options);
  const inventory = await loadAgentInventory(cwd, context);
  ensureVisibleAgent(agentName, inventory);
  const snapshot = await loadExecutionSnapshot(cwd, agentName, context);

  if (json) {
    formatter.json({
      command: "agents show",
      agentName,
      status: snapshot.base.status,
      context: contextSummary,
      ...snapshot,
    });
    return;
  }

  printAgentShowText(snapshot, contextSummary);
}

async function executeAgentMutation(
  action: "set" | "reset",
  agentName: string,
  options: AgentsMutationOptions,
  globalOpts: GlobalOptions
): Promise<void> {
  const cwd = process.cwd();
  const json = shouldOutputJson(options.json, globalOpts);

  try {
    const mutationInput = {
      action,
      scope: options.scope,
      cwd,
      agentName,
      ...(action === "set"
        ? {
            provider: options.provider,
            model: options.model,
          }
        : {}),
    };
    const result = options.dryRun
      ? await previewAgentOverride(mutationInput)
      : await applyAgentOverride(mutationInput);
    const mode = options.dryRun ? "preview" : "applied";
    const requested = buildRequestedMutationValues(action, options);
    const resolvedOverride = buildResolvedMutationValues(action, result);
    const changedKeys = buildChangedMutationKeys(result);

    if (json) {
      formatter.json({
        command: `agents ${action}`,
        mode,
        scope: result.scope,
        agentName,
        targetPath: result.targetPath,
        ...(Object.keys(requested).length > 0 ? { requested } : {}),
        ...(Object.keys(resolvedOverride).length > 0 ? { resolvedOverride } : {}),
        changedKeys,
        before: result.before,
        after: result.after,
        warnings: result.warnings,
        nextCommand: getNextAgentCommand(action, agentName),
      });
      return;
    }

    printAgentMutationText(result, mode, { requested, resolvedOverride, changedKeys });
  } catch (error) {
    throw toMutationCLIError(error);
  }
}

async function runAgentsSet(
  agentName: string,
  options: AgentsMutationOptions,
  globalOpts: GlobalOptions
): Promise<void> {
  await executeAgentMutation("set", agentName, options, globalOpts);
}

async function runAgentsReset(
  agentName: string,
  options: AgentsMutationOptions,
  globalOpts: GlobalOptions
): Promise<void> {
  await executeAgentMutation("reset", agentName, options, globalOpts);
}

export function createAgentsCommand(): Command {
  const agents = new Command("agents").description(
    "Inspect visible agent resolution and safely manage config-layer overrides"
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

  agents
    .command("set <name>")
    .description("Set config-layer provider/model overrides for an agent")
    .option("--provider <provider>", "Provider name")
    .option("--model <model>", "Model ref")
    .option("--scope <scope>", "project|global", "project")
    .option("--dry-run", "Preview the mutation without writing config")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, name: string, options: AgentsMutationOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runAgentsSet(name, options, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  agents
    .command("reset <name>")
    .description("Reset config-layer overrides for an agent")
    .option("--scope <scope>", "project|global", "project")
    .option("--dry-run", "Preview the mutation without writing config")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, name: string, options: AgentsMutationOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(() => runAgentsReset(name, options, globalOpts), {
        verbose: Boolean(globalOpts.verbose),
      });
    });

  return agents;
}
