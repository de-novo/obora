import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  StepExecutor,
  Workflow,
  loadConfig,
  resolveProviderConfig,
} from "../../packages/sdk/dist/index.js";
import { createAdapter } from "../../packages/adapters/dist/index.js";

import { customTools } from "./custom-tools.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sandboxRoot = resolve(__dirname, "..");
const configPath = join(sandboxRoot, ".obora", "config.yaml");
const workflowPath = join(__dirname, "workflow.yaml");
const outputDir = join(__dirname, "output");
const statePath = join(outputDir, "state.json");

const AGENTS = new Map([
  ["researcher", () => ({ role: "Frontend Stack Researcher", description: "Verifies live frontend references before implementation." })],
  ["architect", () => ({ role: "Frontend Architect", description: "Designs a realistic modern SPA structure based on verified references." })],
  ["builder", () => ({ role: "Senior Frontend Engineer", description: "Generates and repairs a modern React TypeScript Vite app using file tools and validation feedback." })],
  ["reviewer", () => ({ role: "Technical Reviewer", description: "Summarizes repairs, outcomes, and remaining gaps after validation loops." })],
]);

async function ensureOutputDir() {
  await mkdir(outputDir, { recursive: true });
}

async function loadState() {
  try {
    const raw = await readFile(statePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return { outputs: {}, toolCallCounts: {}, history: [] };
  }
}

async function saveState(state) {
  await ensureOutputDir();
  await writeFile(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

async function createExecutor(toolCallCounts) {
  const config = await loadConfig(configPath);
  const providerConfig = config ? resolveProviderConfig(config) : undefined;
  if (!providerConfig) {
    throw new Error("Failed to resolve provider config for repair-loop sandbox");
  }

  const adapter = await createAdapter(providerConfig.provider, {
    apiKey: providerConfig.apiKey,
    model: providerConfig.model,
    baseUrl: providerConfig.baseUrl,
  });

  const instrumentedTools = customTools.map((tool) => ({
    ...tool,
    execute: async (args) => {
      const name = tool.definition.function.name;
      toolCallCounts[name] = (toolCallCounts[name] ?? 0) + 1;
      return tool.execute(args);
    },
  }));

  return new StepExecutor(adapter, AGENTS, {
    model: providerConfig.model,
    maxTokens: providerConfig.maxTokens,
    tools: instrumentedTools,
    disableBuiltinTools: false,
  });
}

async function getWorkflowStepMap() {
  const workflow = await Workflow.fromYaml(workflowPath);
  return new Map(workflow.steps.map((step) => [step.name, step]));
}

function withTaskAppend(step, extraText) {
  const input = step.input && typeof step.input === "object" ? step.input : {};
  const baseTask = typeof input.task === "string" ? input.task : step.description ?? `Execute ${step.name}`;
  return {
    ...step,
    input: {
      ...input,
      task: extraText ? `${baseTask}\n\n---\n\n${extraText}` : baseTask,
    },
  };
}

async function executeStep(stepName, extraText = "") {
  process.chdir(__dirname);

  const state = await loadState();
  const stepMap = await getWorkflowStepMap();
  const step = stepMap.get(stepName);
  if (!step) throw new Error(`Unknown workflow step: ${stepName}`);

  const executor = await createExecutor(state.toolCallCounts);
  const preparedStep = withTaskAppend(step, extraText);
  const result = await executor.executeStep(preparedStep, { previousOutputs: state.outputs });

  state.outputs[stepName] = result.output;
  state.history.push({ stepName, completedAt: new Date().toISOString() });
  await saveState(state);

  return result.output;
}

async function runGenerate() {
  await executeStep("live_stack_research");
  await executeStep("architecture");
  await executeStep("implementation");

  const state = await loadState();
  if ((state.toolCallCounts.fetch_url ?? 0) < 2) {
    throw new Error("Expected fetch_url to be used during live research");
  }
  if ((state.toolCallCounts.npm_package_info ?? 0) < 3) {
    throw new Error("Expected npm_package_info to be used during live research");
  }
}

async function runRepair(validationLogPath, repairAttempt) {
  const extra = [
    `Current repair attempt: ${repairAttempt}`,
    `Validation log path to inspect first with file_read: ${validationLogPath}`,
    "Use the validation log as the primary source of truth for what is broken.",
    "Fix only the necessary files, then self-check the modified files with file_read.",
  ].join("\n");
  await executeStep("repair_from_validation", extra);
}

async function runFinalReport(status, validationAttempts, repairAttempts) {
  const artifactsDir = join(__dirname, "artifacts");
  const extra = [
    `Final validation status: ${status}`,
    `Validation attempts: ${validationAttempts}`,
    `Repair attempts: ${repairAttempts}`,
    `Artifacts directory: ${artifactsDir}`,
    "Before writing FINAL-REPORT.md, read the current artifacts and validation logs to summarize the full loop accurately.",
  ].join("\n");
  await executeStep("final_report", extra);
}

const mode = process.argv[2];

(async () => {
  await ensureOutputDir();

  if (mode === "generate") {
    await runGenerate();
    return;
  }

  if (mode === "repair") {
    const validationLogPath = process.argv[3];
    const repairAttempt = process.argv[4] ?? "1";
    if (!validationLogPath) throw new Error("repair mode requires validation log path");
    await runRepair(validationLogPath, repairAttempt);
    return;
  }

  if (mode === "final-report") {
    const status = process.argv[3] ?? "unknown";
    const validationAttempts = process.argv[4] ?? "0";
    const repairAttempts = process.argv[5] ?? "0";
    await runFinalReport(status, validationAttempts, repairAttempts);
    return;
  }

  throw new Error(`Unknown mode: ${mode}`);
})().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
