import {
  addStep,
  createWorkflow,
  listWorkflows,
  readWorkflow,
  removeStep,
  updateStep,
  validateWorkflow,
} from "@obora/sdk";
import { Command } from "commander";
import { resolve } from "node:path";

import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts, type GlobalOptions } from "../utils/global-opts.js";

interface WorkflowOptions {
  json?: boolean;
  workflowsDir?: string;
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
      ExitCode.VALIDATION_ERROR,
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
        ExitCode.VALIDATION_ERROR,
      );
    }
    return { ...current, [key]: value };
  }

  if (existing !== undefined && !isRecord(existing)) {
    throw new CLIError(
      `Invalid --config entry: ${entry}. '${key}' is already set to a non-object value.`,
      ExitCode.VALIDATION_ERROR,
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
    ...(options.hookPreValidation
      ? { pre_validation: { shell: options.hookPreValidation } }
      : {}),
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
    ExitCode.VALIDATION_ERROR,
  );
}

function buildOnFailDetails(options: StepAddOptions): Omit<OnFailConfig, "goto"> {
  return {
    maxIterations: parseInt(options.onFailMaxIterations ?? "3", 10),
    escalateOnExhaust: options.onFailEscalate as "human" | "dlq" | "fail" | undefined,
    cooldownMs: options.onFailCooldownMs ? parseInt(options.onFailCooldownMs, 10) : undefined,
    resetState: options.onFailResetState,
    maxCost: options.onFailMaxCost ? parseFloat(options.onFailMaxCost) : undefined,
    maxCostEscalation: options.onFailMaxCostEscalation as "human" | "dlq" | "fail" | null | undefined,
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
    .option("--json", "Output as JSON")
    .action(async function (this: Command, dir: string | undefined, options: WorkflowOptions) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
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
              const onFail = step.on_fail ? ` [retry→${typeof step.on_fail.goto === "string" ? step.on_fail.goto : "routes"}]` : "";
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
    .option("--merge <strategy>", "Merge strategy for parallel branches (concat, best_score, consensus, first_success)")
    .option("--config <key=value>", "Config option (repeatable, e.g. --config validation.enabled=true)", collect, [])
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
