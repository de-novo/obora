import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  StepExecutor,
  Workflow,
  loadConfig,
  resolveProviderConfig,
  topologicalSort,
} from "../../../packages/sdk/dist/index.js";
import { createAdapter } from "../../../packages/adapters/dist/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = dirname(__dirname);
const workflowPath = join(__dirname, "workflow.yaml");
const configPath = join(__dirname, "config.yaml");
const generatedDir = join(packageRoot, "generated");

const AGENTS = new Map([
  [
    "planner",
    () => ({
      role: "Product Planner",
      description: "Defines scope, sequencing, and pragmatic product direction for the next build step.",
    }),
  ],
  [
    "architect",
    () => ({
      role: "Frontend Architect",
      description: "Designs React structure, local state flow, and file-level implementation plans.",
    }),
  ],
  [
    "developer",
    () => ({
      role: "Frontend Developer",
      description: "Breaks plans into executable coding tasks with realistic implementation boundaries.",
    }),
  ],
  [
    "reviewer",
    () => ({
      role: "Technical Reviewer",
      description: "Reviews scope, maintainability, UX risks, and simplification opportunities.",
    }),
  ],
]);

async function buildProjectContext() {
  const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  const appSource = await readFile(join(packageRoot, "src", "App.tsx"), "utf8");
  const stylesSource = await readFile(join(packageRoot, "src", "styles.css"), "utf8");

  const fileFacts = [
    "Current package: @obora/reddit-clone",
    `Package description: ${packageJson.description}`,
    "Current source files:",
    "- src/App.tsx",
    "- src/main.tsx",
    "- src/styles.css",
    "- index.html",
    "- vite.config.ts",
    "Current UI features already implemented:",
    "- left community rail",
    "- central multi-post feed",
    "- sort mode state (Hot/New/Rising)",
    "- selected post state driving right-side comment thread",
    "- mock data for posts, communities, comments, and live rooms",
    "- responsive layout",
    "Current missing product features:",
    "- route-level post detail page",
    "- create-post flow",
    "- vote interaction state",
    "- add-comment flow",
    "- per-community page transitions",
  ].join("\n");

  const appSnippet = appSource.slice(0, 6000);
  const styleSnippet = stylesSource.slice(0, 5000);

  return [
    "Project context for this workflow:",
    fileFacts,
    "",
    "App.tsx excerpt:",
    appSnippet,
    "",
    "styles.css excerpt:",
    styleSnippet,
  ].join("\n");
}

function withContext(step, contextBlock) {
  const input = step.input && typeof step.input === "object" ? step.input : {};
  const task = typeof input.task === "string" ? input.task : step.description ?? `Execute ${step.name}`;
  return {
    ...step,
    input: {
      ...input,
      task: `${contextBlock}\n\n---\n\n${task}`,
    },
  };
}

function toArtifactName(stepName) {
  return `REDDIT-CLONE-${stepName.toUpperCase().replace(/[^A-Z0-9]+/g, "-")}.md`;
}

async function main() {
  process.chdir(packageRoot);

  const workflow = await Workflow.fromYaml(workflowPath);
  const config = await loadConfig(configPath);
  const providerConfig = config ? resolveProviderConfig(config) : undefined;
  if (!providerConfig) {
    throw new Error("Failed to resolve Obora config for reddit-clone workflow");
  }

  const adapter = await createAdapter(providerConfig.provider, {
    apiKey: providerConfig.apiKey,
    model: providerConfig.model,
    baseUrl: providerConfig.baseUrl,
  });

  const executor = new StepExecutor(adapter, AGENTS, {
    model: providerConfig.model,
    maxTokens: providerConfig.maxTokens,
  });

  const orderedSteps = topologicalSort(workflow.steps);
  const contextBlock = await buildProjectContext();
  const outputs = {};

  await mkdir(generatedDir, { recursive: true });

  for (const rawStep of orderedSteps) {
    const step = withContext(rawStep, contextBlock);
    const result = await executor.executeStep(step, { previousOutputs: outputs });
    outputs[rawStep.name] = result.output;

    const artifactPath = join(generatedDir, toArtifactName(rawStep.name));
    await writeFile(artifactPath, `${result.output.trim()}\n`, "utf8");
    console.log(`Generated ${artifactPath}`);
  }

  const summaryPath = join(generatedDir, "REDDIT-CLONE-PLAN-PACK.json");
  await writeFile(summaryPath, JSON.stringify(outputs, null, 2) + "\n", "utf8");
  console.log(`Generated ${summaryPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
