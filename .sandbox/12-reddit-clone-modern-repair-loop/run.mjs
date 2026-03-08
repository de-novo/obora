import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  OboraRuntime,
  loadConfig,
  resolveProviderConfig,
} from "../../packages/sdk/dist/index.js";

import { customTools } from "./custom-tools.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sandboxRoot = resolve(__dirname, "..");
const configPath = join(sandboxRoot, ".obora", "config.yaml");
const workflowPath = join(__dirname, "workflow.yaml");
const agentsPath = join(__dirname, "agents.yaml");
const outputDir = join(__dirname, "output");
const summaryPath = join(outputDir, "run-summary.json");

async function ensureOutputDir() {
  await mkdir(outputDir, { recursive: true });
}

async function main() {
  process.chdir(__dirname);
  await ensureOutputDir();

  const loadedConfig = await loadConfig(configPath);
  const providerConfig = loadedConfig ? resolveProviderConfig(loadedConfig) : undefined;
  if (!providerConfig) {
    throw new Error("Failed to resolve provider config for repair-loop sandbox");
  }

  const toolCallCounts = {};
  const instrumentedTools = customTools.map((tool) => ({
    ...tool,
    execute: async (args) => {
      const name = tool.definition.function.name;
      toolCallCounts[name] = (toolCallCounts[name] ?? 0) + 1;
      return tool.execute(args);
    },
  }));

  const runtime = new OboraRuntime({
    llm: {
      provider: providerConfig.provider,
      apiKey: providerConfig.apiKey,
      model: providerConfig.model,
      baseUrl: providerConfig.baseUrl,
      temperature: providerConfig.temperature,
      maxTokens: providerConfig.maxTokens,
    },
    agentsPath,
    stepTools: instrumentedTools,
    verbose: true,
  });

  const audit = {
    validationFailed: 0,
    validationPassed: 0,
    repairStarted: 0,
    repairCompleted: 0,
    repairNoProgress: 0,
    events: [],
  };

  runtime.on("workflow.validation_failed", (event) => {
    audit.validationFailed += 1;
    audit.events.push({ type: event.type, data: event.data });
  });
  runtime.on("workflow.validation_passed", (event) => {
    audit.validationPassed += 1;
    audit.events.push({ type: event.type, data: event.data });
  });
  runtime.on("workflow.repair_started", (event) => {
    audit.repairStarted += 1;
    audit.events.push({ type: event.type, data: event.data });
  });
  runtime.on("workflow.repair_completed", (event) => {
    audit.repairCompleted += 1;
    audit.events.push({ type: event.type, data: event.data });
  });
  runtime.on("workflow.repair_no_progress", (event) => {
    audit.repairNoProgress += 1;
    audit.events.push({ type: event.type, data: event.data });
  });

  await runtime.loadWorkflow(workflowPath);

  let status = "failed";
  let execution;
  let errorMessage;

  try {
    const handle = await runtime.run("reddit-clone-modern-repair-loop");
    execution = await handle.wait();
    status = execution.status;
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    status = "failed";
  }

  const summary = {
    status,
    errorMessage,
    executionId: execution?.id,
    completedSteps: execution?.completedSteps ?? [],
    outputs: execution?.outputs ?? {},
    toolCallCounts,
    audit,
  };

  await writeFile(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf8");

  if ((toolCallCounts.fetch_url ?? 0) < 2) {
    throw new Error("Expected fetch_url to be used during live research");
  }
  if ((toolCallCounts.npm_package_info ?? 0) < 3) {
    throw new Error("Expected npm_package_info to be used during live research");
  }
  if ((toolCallCounts.run_validation ?? 0) < 1) {
    throw new Error("Expected run_validation to be used during validation");
  }
  if (status !== "completed") {
    throw new Error(errorMessage ?? "Repair-loop workflow failed");
  }

  const finalReport = await readFile(join(__dirname, "artifacts", "FINAL-REPORT.md"), "utf8");
  console.log(finalReport);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
