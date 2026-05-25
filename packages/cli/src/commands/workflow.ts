import {
  addStep,
  createWorkflow,
  discoverWorkflowLocators,
  listWorkflows,
  readWorkflow,
  removeStep,
  resolveWorkflowTarget,
  updateStep,
  validateWorkflow,
} from "@obora/sdk";
import type {
  WorkflowDiscoveryResult,
  WorkflowLocator,
  WorkflowResolveIntent,
  WorkflowResolveRequest,
  WorkflowResolveScope,
} from "@obora/sdk";
import { Command } from "commander";
import { resolve } from "node:path";

import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts, type GlobalOptions } from "../utils/global-opts.js";
import { openWorkflowUrl } from "../workflow-web/browser.js";
import { startWorkflowWebBridge } from "../workflow-web/server.js";
import type { WorkflowWebMode } from "../workflow-web/types.js";

interface WorkflowOptions {
  json?: boolean;
  workflowsDir?: string;
  scope?: string;
  project?: string;
  globalWorkflowsDir?: string;
  noOpen?: boolean;
  host?: string;
  port?: string;
}

type OnFailRoute = { when?: string; target: string };
type OnFailConfig = {
  goto: string | OnFailRoute[];
  maxIterations: number;
  escalateOnExhaust?: "human" | "dlq" | "fail";
  cooldownMs?: number;
  resetState?: boolean;
  maxCost?: number | null;
  maxCostEscalation?: "human" | "dlq" | "fail" | null;
};

type AddStepInput = Parameters<typeof addStep>[1];
type StepGate = string | { type: string; name?: string } | undefined;
type ParallelBranch = { agent: string; prompt_file?: string };
type StepOutput = { path?: string; schema?: string } | undefined;
type StepHooks = {
  pre_step?: { shell: string };
  post_step?: { shell: string };
  pre_validation?: { shell: string };
  post_cycle?: { shell: string };
};
type StepMergeStrategy = "concat" | "best_score" | "consensus" | "first_success";

interface WorkflowCreateOptions extends WorkflowOptions {
  name?: string;
  description?: string;
}

interface StepAddOptions extends WorkflowOptions {
  agent?: string;
  tool?: string;
  description?: string;
  dependsOn?: string;
  pattern?: string;
  participants?: string;
  input?: string;
  outputPath?: string;
  outputSchema?: string;
  gate?: string;
  gateType?: string;
  parallel?: string[];
  merge?: string;
  config?: string[];
  hookPreStep?: string;
  hookPostStep?: string;
  hookPreValidation?: string;
  hookPostCycle?: string;
  onFailGoto?: string;
  onFailMaxIterations?: string;
  onFailEscalate?: string;
  onFailCooldownMs?: string;
  onFailResetState?: boolean;
  onFailMaxCost?: string;
  onFailMaxCostEscalation?: string;
  onFailRoute?: string[];
}

function shouldOutputJson(localJson: boolean | undefined, globalOpts: GlobalOptions): boolean {
  return Boolean(localJson || globalOpts.json);
}

function parseWorkflowResolveScope(scope: string | undefined): WorkflowResolveScope | undefined {
  if (!scope) return undefined;
  if (scope === "project" || scope === "global" || scope === "all") return scope;
  throw new CLIError(
    `Invalid workflow scope: ${scope}. Expected project, global, or all.`,
    ExitCode.VALIDATION_ERROR
  );
}

function parsePort(port: string | undefined): number | undefined {
  if (!port) return undefined;
  const parsed = Number(port);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  throw new CLIError(`Invalid workflow web port: ${port}`, ExitCode.VALIDATION_ERROR);
}

function buildWorkflowResolveRequest(
  target: string | undefined,
  options: WorkflowOptions,
  intent: WorkflowResolveIntent
): WorkflowResolveRequest {
  return {
    ...(target ? { target } : {}),
    intent,
    cwd: process.cwd(),
    scope: parseWorkflowResolveScope(options.scope),
    ...(options.project ? { projectRoot: resolve(options.project) } : {}),
    ...(options.globalWorkflowsDir
      ? { globalWorkflowDir: resolve(options.globalWorkflowsDir) }
      : {}),
  };
}

function buildWorkflowDiscoveryRequest(options: WorkflowOptions): WorkflowResolveRequest {
  return {
    cwd: process.cwd(),
    scope: parseWorkflowResolveScope(options.scope) ?? "all",
    ...(options.project ? { projectRoot: resolve(options.project) } : {}),
    ...(options.globalWorkflowsDir
      ? { globalWorkflowDir: resolve(options.globalWorkflowsDir) }
      : {}),
  };
}

function locatorsForListScope(discovery: WorkflowDiscoveryResult, scope: WorkflowResolveScope) {
  return scope === "project"
    ? { project: discovery.project, global: [] as ReadonlyArray<WorkflowLocator> }
    : scope === "global"
      ? { project: [] as ReadonlyArray<WorkflowLocator>, global: discovery.global }
      : { project: discovery.project, global: discovery.global };
}

function formatLocatorLine(locator: WorkflowLocator): string {
  const shadowLabel = locator.shadowedBy
    ? " shadowed by project"
    : locator.shadows
      ? " shadows global"
      : "";
  const description = locator.description ? ` - ${locator.description}` : "";
  return `- ${locator.name} (${locator.stepCount} steps) ${locator.displayPath}${shadowLabel}${description}`;
}

function printLocatorGroup(title: string, locators: ReadonlyArray<WorkflowLocator>): void {
  if (locators.length === 0) return;
  console.log(title);
  locators.map(formatLocatorLine).forEach((line) => console.log(line));
}

function workflowListPayload(discovery: WorkflowDiscoveryResult, scope: WorkflowResolveScope) {
  const grouped = locatorsForListScope(discovery, scope);
  return {
    scope,
    roots: discovery.roots,
    project: grouped.project,
    global: grouped.global,
    diagnostics: discovery.diagnostics,
  };
}

async function printScopedWorkflowList(
  discovery: WorkflowDiscoveryResult,
  scope: WorkflowResolveScope
): Promise<void> {
  const grouped = locatorsForListScope(discovery, scope);
  if (grouped.project.length === 0 && grouped.global.length === 0) {
    formatter.info("No workflows found in project or global workflow roots");
    return;
  }
  printLocatorGroup("Project workflows", grouped.project);
  printLocatorGroup("Global workflows", grouped.global);
}

function webModeForIntent(intent: WorkflowResolveIntent): WorkflowWebMode {
  return intent === "build" ? "build" : "view";
}

async function runWorkflowWebEntry(
  target: string | undefined,
  intent: Extract<WorkflowResolveIntent, "view" | "build">,
  options: WorkflowOptions,
  globalOpts: GlobalOptions
): Promise<void> {
  const resolveRequest = buildWorkflowResolveRequest(target, options, intent);
  const result = await resolveWorkflowTarget(resolveRequest);
  if (result.status !== "resolved" || !result.locator) {
    throw new CLIError(
      result.diagnostics.join("\n") || `Workflow ${target ?? ""} could not be resolved.`,
      ExitCode.VALIDATION_ERROR
    );
  }

  const bridge = await startWorkflowWebBridge({
    locator: result.locator,
    mode: webModeForIntent(intent),
    resolveRequest,
    host: options.host,
    port: parsePort(options.port),
    open: !options.noOpen,
  });

  if (shouldOutputJson(options.json, globalOpts)) {
    formatter.json({
      status: result.status,
      mode: webModeForIntent(intent),
      locator: result.locator,
      candidates: result.candidates,
      diagnostics: result.diagnostics,
      url: bridge.url,
      apiBaseUrl: bridge.apiBaseUrl,
    });
    await bridge.close();
    return;
  }

  result.diagnostics.forEach((diagnostic) => formatter.warn(diagnostic));
  formatter.success(`Workflow ${intent} web bridge started.`);
  formatter.info(bridge.url);
  if (!options.noOpen) {
    await openWorkflowUrl(bridge.url);
  }
  formatter.info("Press Ctrl+C to stop the workflow web bridge.");
  await bridge.waitUntilClosed();
}

function parseValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return parseFloat(value);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseConfigEntry(entry: string): { keys: string[]; value: unknown } {
  const match = entry.match(/^(\w+(?:\.\w+)*)=(.+)$/);
  const keyPath = match?.[1];
  const rawValue = match?.[2];
  if (!keyPath || rawValue === undefined) {
    throw new CLIError(
      `Invalid --config entry: ${entry}. Expected key=value with dot-separated keys.`,
      ExitCode.VALIDATION_ERROR
    );
  }
  return { keys: keyPath.split("."), value: parseValue(rawValue) };
}

function assignNestedConfig(
  current: Record<string, unknown>,
  keys: string[],
  value: unknown,
  entry: string
): Record<string, unknown> {
  const [key, ...rest] = keys;
  if (!key) {
    throw new CLIError(`Invalid --config entry: ${entry}`, ExitCode.VALIDATION_ERROR);
  }
  const existing = current[key];
  if (rest.length === 0) {
    if (isRecord(existing)) {
      throw new CLIError(
        `Invalid --config entry: ${entry}. '${key}' is already set to an object value.`,
        ExitCode.VALIDATION_ERROR
      );
    }
    return { ...current, [key]: value };
  }

  if (existing !== undefined && !isRecord(existing)) {
    throw new CLIError(
      `Invalid --config entry: ${entry}. '${key}' is already set to a non-object value.`,
      ExitCode.VALIDATION_ERROR
    );
  }

  return {
    ...current,
    [key]: assignNestedConfig(isRecord(existing) ? existing : {}, rest, value, entry),
  };
}

function buildConfig(options: StepAddOptions): Record<string, unknown> | undefined {
  if (!options.config) return undefined;

  const config = options.config.reduce<Record<string, unknown>>((acc, entry) => {
    const parsed = parseConfigEntry(entry);
    return assignNestedConfig(acc, parsed.keys, parsed.value, entry);
  }, {});

  return Object.keys(config).length > 0 ? config : undefined;
}

function optionalObject<T extends Record<string, unknown>>(value: T): T | undefined {
  return Object.keys(value).length > 0 ? value : undefined;
}

function commaList(value: string | undefined): string[] | undefined {
  return value?.split(",").map((item) => item.trim());
}

function buildHooks(options: StepAddOptions): StepHooks | undefined {
  return optionalObject({
    ...(options.hookPreStep ? { pre_step: { shell: options.hookPreStep } } : {}),
    ...(options.hookPostStep ? { post_step: { shell: options.hookPostStep } } : {}),
    ...(options.hookPreValidation ? { pre_validation: { shell: options.hookPreValidation } } : {}),
    ...(options.hookPostCycle ? { post_cycle: { shell: options.hookPostCycle } } : {}),
  });
}

function buildGate(options: StepAddOptions): StepGate {
  return options.gateType
    ? { type: options.gateType, ...(options.gate ? { name: options.gate } : {}) }
    : options.gate;
}

function parseParallelBranch(branch: string): ParallelBranch {
  const [agent, promptFile] = branch.split(":");
  return {
    agent: agent ?? "",
    ...(promptFile ? { prompt_file: promptFile } : {}),
  };
}

function buildParallel(options: StepAddOptions): ParallelBranch[] | undefined {
  return options.parallel?.map((branch) => parseParallelBranch(branch));
}

function buildOutput(options: StepAddOptions): StepOutput {
  return options.outputPath || options.outputSchema
    ? {
        ...(options.outputPath ? { path: options.outputPath } : {}),
        ...(options.outputSchema ? { schema: options.outputSchema } : {}),
      }
    : undefined;
}

function parseOnFailRoute(route: string): OnFailRoute {
  const parts = route.split(":");
  if (parts.length === 1 && parts[0]) {
    return { target: parts[0] };
  }
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { when: parts[0], target: parts[1] };
  }
  throw new CLIError(
    `Invalid --on-fail-route: ${route}. Expected target or when:target.`,
    ExitCode.VALIDATION_ERROR
  );
}

function buildOnFailDetails(options: StepAddOptions): Omit<OnFailConfig, "goto"> {
  return {
    maxIterations: parseInt(options.onFailMaxIterations ?? "3", 10),
    escalateOnExhaust: options.onFailEscalate as "human" | "dlq" | "fail" | undefined,
    cooldownMs: options.onFailCooldownMs ? parseInt(options.onFailCooldownMs, 10) : undefined,
    resetState: options.onFailResetState,
    maxCost: options.onFailMaxCost ? parseFloat(options.onFailMaxCost) : undefined,
    maxCostEscalation: options.onFailMaxCostEscalation as
      | "human"
      | "dlq"
      | "fail"
      | null
      | undefined,
  };
}

function buildOnFail(options: StepAddOptions): OnFailConfig | undefined {
  const routes = options.onFailRoute ?? [];
  if (routes.length > 0) {
    return { goto: routes.map((route) => parseOnFailRoute(route)), ...buildOnFailDetails(options) };
  }

  if (!options.onFailGoto) {
    return undefined;
  }

  return { goto: options.onFailGoto, ...buildOnFailDetails(options) };
}

function buildStepInput(stepName: string, options: StepAddOptions): AddStepInput {
  return {
    name: stepName,
    agent: options.agent,
    tool: options.tool,
    description: options.description,
    dependsOn: commaList(options.dependsOn),
    pattern: options.pattern,
    participants: commaList(options.participants),
    input: options.input ? { task: options.input } : undefined,
    output: buildOutput(options),
    config: buildConfig(options),
    hooks: buildHooks(options),
    gate: buildGate(options),
    parallel: buildParallel(options),
    merge: options.merge as StepMergeStrategy | undefined,
    onFail: buildOnFail(options),
  };
}

function buildStepUpdates(options: {
  json?: boolean;
  agent?: string;
  description?: string;
  dependsOn?: string;
}): Record<string, unknown> {
  return {
    ...(options.agent ? { agent: options.agent } : {}),
    ...(options.description ? { description: options.description } : {}),
    ...(options.dependsOn ? { depends_on: commaList(options.dependsOn) } : {}),
  };
}

export function createWorkflowCommand(): Command {
  const workflow = new Command("workflow").description("Manage Obora workflows");

  workflow
    .command("list [workflows-dir]")
    .description("List available workflows")
    .option("--scope <scope>", "Workflow scope to list (all, project, global)")
    .option("--project <path>", "Project root for scoped workflow discovery")
    .option("--global-workflows-dir <path>", "Global workflow directory override")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, dir: string | undefined, options: WorkflowOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          if (!dir || options.scope || options.project || options.globalWorkflowsDir) {
            const scope = parseWorkflowResolveScope(options.scope) ?? "all";
            const discovery = await discoverWorkflowLocators({
              ...buildWorkflowDiscoveryRequest(options),
              scope,
            });

            if (shouldOutputJson(options.json, globalOpts)) {
              formatter.json(workflowListPayload(discovery, scope));
              return;
            }

            await printScopedWorkflowList(discovery, scope);
            return;
          }

          const workflowsDir = resolve(dir ?? "workflows");
          const entries = await listWorkflows(workflowsDir);

          if (shouldOutputJson(options.json, globalOpts)) {
            formatter.json(entries);
            return;
          }

          if (entries.length === 0) {
            formatter.info(`No workflows found in ${workflowsDir}`);
            return;
          }

          console.log(`Workflows in ${workflowsDir}`);
          entries.forEach((entry) => {
            const desc = entry.description ? ` - ${entry.description}` : "";
            console.log(`- ${entry.name} (${entry.stepCount} steps)${desc}`);
          });
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  workflow
    .command("view [target]")
    .description("Open a workflow graph in the local web viewer")
    .option("--scope <scope>", "Workflow scope to resolve (project or global)")
    .option("--project <path>", "Project root for scoped workflow discovery")
    .option("--global-workflows-dir <path>", "Global workflow directory override")
    .option("--host <host>", "Workflow web bridge host")
    .option("--port <port>", "Workflow web bridge port")
    .option("--no-open", "Print the URL without opening a browser")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, target: string | undefined, options: WorkflowOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          await runWorkflowWebEntry(target, "view", options, globalOpts);
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  workflow
    .command("build [target]")
    .description("Open a workflow in the local web builder")
    .option("--scope <scope>", "Workflow scope to resolve (project or global)")
    .option("--project <path>", "Project root for scoped workflow discovery")
    .option("--global-workflows-dir <path>", "Global workflow directory override")
    .option("--host <host>", "Workflow web bridge host")
    .option("--port <port>", "Workflow web bridge port")
    .option("--no-open", "Print the URL without opening a browser")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, target: string | undefined, options: WorkflowOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          await runWorkflowWebEntry(target, "build", options, globalOpts);
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  workflow
    .command("show <file>")
    .description("Show workflow content")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, file: string, options: WorkflowOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const path = resolve(file);
          const wf = await readWorkflow(path);

          if (!wf) {
            throw new CLIError(`Workflow not found: ${path}`, ExitCode.CLI_ERROR);
          }

          if (shouldOutputJson(options.json, globalOpts)) {
            formatter.json(wf);
            return;
          }

          console.log(`Workflow: ${wf.name}`);
          if (wf.description) {
            console.log(`Description: ${wf.description}`);
          }
          console.log(`Version: ${wf.version ?? "1.0"}`);
          console.log(`Steps: ${wf.steps?.length ?? 0}`);

          if (wf.steps && wf.steps.length > 0) {
            console.log("\nSteps:");
            wf.steps.forEach((step) => {
              const deps = step.depends_on ? ` ← ${step.depends_on.join(", ")}` : "";
              const agent = step.agent ? ` [${step.agent}]` : "";
              const pattern = step.pattern ? ` (${step.pattern})` : "";
              const onFail = step.on_fail
                ? ` [retry→${typeof step.on_fail.goto === "string" ? step.on_fail.goto : "routes"}]`
                : "";
              console.log(`  - ${step.name}${agent}${pattern}${deps}${onFail}`);
              if (step.description) {
                console.log(`    ${step.description}`);
              }
            });
          }
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  workflow
    .command("create <file>")
    .description("Create a new workflow file")
    .option("--name <name>", "Workflow name")
    .option("--description <desc>", "Workflow description")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, file: string, options: WorkflowCreateOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const path = resolve(file);
          await createWorkflow(path, {
            name: options.name ?? file,
            description: options.description,
          });

          formatter.success(`Created workflow: ${path}`);
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  workflow
    .command("validate <file>")
    .description("Validate a workflow file")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, file: string, options: WorkflowOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const path = resolve(file);
          const result = await validateWorkflow(path);

          if (shouldOutputJson(options.json, globalOpts)) {
            formatter.json(result);
            return;
          }

          if (result.valid) {
            formatter.success(`Workflow is valid: ${path}`);
          } else {
            formatter.error(`Workflow validation failed: ${path}`);
            result.errors.forEach((error) => formatter.step(error));
          }
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  workflow
    .command("add-step <file> <step-name>")
    .description("Add a step to a workflow")
    .option("--agent <agent>", "Agent name")
    .option("--tool <tool>", "Tool name")
    .option("--description <desc>", "Step description")
    .option("--depends-on <steps>", "Comma-separated dependency step names")
    .option("--pattern <pattern>", "Execution pattern (consensus, peer-review, judge, discussion)")
    .option("--participants <agents>", "Comma-separated participant agent names")
    .option("--input <text>", "Step input task text")
    .option("--output-path <path>", "Output artifact path")
    .option("--output-schema <path>", "Output JSON schema path")
    .option("--gate <gate>", "Simple gate name")
    .option("--gate-type <type>", "Gate type (for typed gates)")
    .option("--parallel <agent:prompt>", "Parallel branch (repeatable)", collect, [])
    .option(
      "--merge <strategy>",
      "Merge strategy for parallel branches (concat, best_score, consensus, first_success)"
    )
    .option(
      "--config <key=value>",
      "Config option (repeatable, e.g. --config validation.enabled=true)",
      collect,
      []
    )
    .option("--hook-pre-step <cmd>", "Pre-step shell hook")
    .option("--hook-post-step <cmd>", "Post-step shell hook")
    .option("--hook-pre-validation <cmd>", "Pre-validation shell hook")
    .option("--hook-post-cycle <cmd>", "Post-cycle shell hook")
    .option("--on-fail-goto <step>", "On failure, go to this step")
    .option("--on-fail-max-iterations <n>", "Max retry iterations")
    .option("--on-fail-escalate <type>", "Escalation on exhaust (human, dlq, fail)")
    .option("--on-fail-cooldown-ms <ms>", "Cooldown between retries")
    .option("--on-fail-reset-state", "Reset state on retry")
    .option("--on-fail-max-cost <cost>", "Max cost for retries")
    .option("--on-fail-max-cost-escalation <type>", "Escalation on cost exceed (human, dlq, fail)")
    .option("--on-fail-route <when:target>", "Conditional route (repeatable)", collect, [])
    .option("--json", "Output as JSON")
    .action(async function (
      this: Command,
      file: string,
      stepName: string,
      options: StepAddOptions
    ) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const path = resolve(file);
          await addStep(path, buildStepInput(stepName, options));

          formatter.success(`Added step '${stepName}' to ${path}`);
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  workflow
    .command("remove-step <file> <step-name>")
    .description("Remove a step from a workflow")
    .option("--json", "Output as JSON")
    .action(async function (
      this: Command,
      file: string,
      stepName: string,
      options: WorkflowOptions
    ) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const path = resolve(file);
          await removeStep(path, stepName);
          formatter.success(`Removed step '${stepName}' from ${path}`);
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  workflow
    .command("edit-step <file> <step-name>")
    .description("Edit a step in a workflow")
    .option("--agent <agent>", "Agent name")
    .option("--description <desc>", "Step description")
    .option("--depends-on <steps>", "Comma-separated dependency step names")
    .option("--json", "Output as JSON")
    .action(async function (
      this: Command,
      file: string,
      stepName: string,
      options: { json?: boolean; agent?: string; description?: string; dependsOn?: string }
    ) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const path = resolve(file);
          await updateStep(path, stepName, buildStepUpdates(options));
          formatter.success(`Updated step '${stepName}' in ${path}`);
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  return workflow;
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}
