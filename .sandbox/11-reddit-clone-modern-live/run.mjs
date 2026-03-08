import { mkdir, writeFile } from "node:fs/promises";
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

const AGENTS = new Map([
  [
    "researcher",
    () => ({
      role: "Frontend Stack Researcher",
      description: "Uses live reference tools to verify current frontend package and template information before implementation.",
    }),
  ],
  [
    "architect",
    () => ({
      role: "Frontend Architect",
      description: "Designs maintainable React application structure based on verified live stack information.",
    }),
  ],
  [
    "builder",
    () => ({
      role: "Senior Frontend Engineer",
      description: "Implements React TypeScript Vite apps in a realistic multi-file structure and checks compatibility carefully.",
    }),
  ],
  [
    "reviewer",
    () => ({
      role: "Technical Reviewer",
      description: "Audits generated projects for realism, maintainability, and alignment with live references.",
    }),
  ],
]);

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
  const config = await loadConfig(configPath);
  const providerConfig = config ? resolveProviderConfig(config) : undefined;
  if (!providerConfig) {
    throw new Error("Failed to resolve provider config for live-reference sandbox");
  }

  const adapter = await createAdapter(providerConfig.provider, {
    apiKey: providerConfig.apiKey,
    model: providerConfig.model,
    baseUrl: providerConfig.baseUrl,
  });

  const executor = new StepExecutor(adapter, AGENTS, {
    model: providerConfig.model,
    maxTokens: providerConfig.maxTokens,
    tools: instrumentedTools,
    disableBuiltinTools: false,
  });

  const orderedSteps = topologicalSort(workflow.steps);
  const outputs = {};
  const stepRecords = {};

  for (const step of orderedSteps) {
    const result = await executor.executeStep(step, { previousOutputs: outputs });
    outputs[step.name] = result.output;
    stepRecords[step.name] = { output: result.output, raw: result.raw };
  }

  if ((toolCallCounts.get("fetch_url") ?? 0) < 2) {
    throw new Error("Expected fetch_url to be used at least twice for live references");
  }

  if ((toolCallCounts.get("npm_package_info") ?? 0) < 3) {
    throw new Error("Expected npm_package_info to be used at least three times for live package validation");
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(
    join(outputDir, "run-metadata.json"),
    JSON.stringify({ toolCallCounts: Object.fromEntries(toolCallCounts.entries()), outputs }, null, 2) + "\n",
    "utf8",
  );

  console.log("Tool usage:", JSON.stringify(Object.fromEntries(toolCallCounts.entries())));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
