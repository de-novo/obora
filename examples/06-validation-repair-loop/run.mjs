import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { OboraRuntime } from "../../packages/sdk/dist/index.js";
import { customTools } from "./custom-tools.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const workflowPath = join(__dirname, "workflow.yaml");
const agentsPath = join(__dirname, "agents.yaml");
const artifactsDir = join(__dirname, "artifacts");
const summaryPath = join(artifactsDir, "run-summary.json");

async function main() {
  process.chdir(__dirname);
  await rm(artifactsDir, { recursive: true, force: true });
  await mkdir(artifactsDir, { recursive: true });

  const apiKey = process.env.ZAI_API_KEY;
  if (!apiKey) {
    throw new Error("ZAI_API_KEY is required to run examples/06-validation-repair-loop/run.mjs");
  }

  const runtime = new OboraRuntime({
    llm: {
      provider: "zai",
      apiKey,
      model: process.env.OBORA_TEST_MODEL ?? "glm-4.7",
      temperature: 0,
      maxTokens: 1200,
    },
    agentsPath,
    stepTools: customTools,
  });

  const audit = {
    validationFailed: 0,
    validationPassed: 0,
    repairStarted: 0,
    repairCompleted: 0,
    repairNoProgress: 0,
  };

  runtime.on("workflow.validation_failed", () => { audit.validationFailed += 1; });
  runtime.on("workflow.validation_passed", () => { audit.validationPassed += 1; });
  runtime.on("workflow.repair_started", () => { audit.repairStarted += 1; });
  runtime.on("workflow.repair_completed", () => { audit.repairCompleted += 1; });
  runtime.on("workflow.repair_no_progress", () => { audit.repairNoProgress += 1; });

  await runtime.loadWorkflow(workflowPath);
  const handle = await runtime.run("validation-repair-loop-example");
  const execution = await handle.wait();

  const summary = {
    status: execution.status,
    completedSteps: execution.completedSteps,
    outputs: execution.outputs,
    audit,
  };

  await writeFile(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf8");

  console.log("=== Execution Summary ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log("\n=== Release Note ===");
  console.log(await readFile(join(artifactsDir, "release-note.md"), "utf8"));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
