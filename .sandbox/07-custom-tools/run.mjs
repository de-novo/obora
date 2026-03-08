import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  StepExecutor,
  Workflow,
  loadConfig,
  resolveProviderConfig,
  topologicalSort,
} from "../../packages/sdk/dist/index.js";
import { createAdapter } from "../../packages/adapters/dist/index.js";

import { customTools } from "./custom-tools.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sandboxRoot = resolve(__dirname, "..");
const configPath = join(sandboxRoot, ".obora", "config.yaml");
const workflowPath = join(__dirname, "workflow.yaml");
const outputDir = join(__dirname, "output");

function buildAgentsMap() {
  return new Map([
    [
      "tool_user",
      () => ({
        role: "Tool User",
        description: "Uses the injected custom tools and follows tool usage instructions strictly",
      }),
    ],
    [
      "verifier",
      () => ({
        role: "Verifier",
        description: "Checks whether the previous step returned the expected value",
      }),
    ],
  ]);
}

const toolCallCounts = new Map();
const instrumentedTools = customTools.map((tool) => ({
  ...tool,
  execute: async (args) => {
    const name = tool.definition.function.name;
    toolCallCounts.set(name, (toolCallCounts.get(name) ?? 0) + 1);
    return tool.execute(args);
  },
}));

async function main() {
  process.chdir(__dirname);

  const workflow = await Workflow.fromYaml(workflowPath);
  const agents = buildAgentsMap();

  const config = await loadConfig(configPath);
  const providerConfig = config ? resolveProviderConfig(config) : undefined;
  if (!providerConfig) {
    throw new Error("Failed to resolve provider config for custom-tools sandbox");
  }

  const adapter = await createAdapter(providerConfig.provider, {
    apiKey: providerConfig.apiKey,
    model: providerConfig.model,
    baseUrl: providerConfig.baseUrl,
  });

  const executor = new StepExecutor(adapter, agents, {
    model: providerConfig.model,
    maxTokens: providerConfig.maxTokens,
    tools: instrumentedTools,
    disableBuiltinTools: true,
  });

  const orderedSteps = topologicalSort(workflow.steps);
  const outputs = {};
  const stepRecords = {};
  const completedSteps = [];
  const startedAt = new Date();

  for (const step of orderedSteps) {
    const result = await executor.executeStep(step, { previousOutputs: outputs });
    outputs[step.name] = result.output;
    stepRecords[step.name] = { output: result.output, raw: result.raw };
    completedSteps.push(step.name);
  }

  if ((toolCallCounts.get("calculate") ?? 0) < 1) {
    throw new Error("calculate tool was not invoked");
  }

  if (outputs.use_custom_tool?.trim() !== "714") {
    throw new Error(`Unexpected use_custom_tool output: ${outputs.use_custom_tool}`);
  }

  if (outputs.verify_result?.trim() !== "VERIFIED: 714") {
    throw new Error(`Unexpected verify_result output: ${outputs.verify_result}`);
  }

  await mkdir(outputDir, { recursive: true });
  const execution = {
    id: randomUUID(),
    workflowName: workflow.name,
    status: "completed",
    startedAt: startedAt.toISOString(),
    stepOrder: orderedSteps.map((step) => step.name),
    completedSteps,
    stepRecords,
    outputs,
    metadata: {
      toolCallCounts: Object.fromEntries(toolCallCounts.entries()),
    },
    endedAt: new Date().toISOString(),
  };

  const outputPath = join(outputDir, `${workflow.name}-${execution.id}.json`);
  await writeFile(outputPath, JSON.stringify(execution, null, 2) + "\n", "utf8");

  console.log(`Saved outputs to ${outputPath}`);
  console.log("calculate tool invocations:", toolCallCounts.get("calculate") ?? 0);
  console.log("Workflow completed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
