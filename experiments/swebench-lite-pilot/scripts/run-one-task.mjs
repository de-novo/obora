import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { printOk, readJson, writeJson, writeText } from "./lib.mjs";
import { renderTaskContext } from "./render-task-context.mjs";

const execAsync = promisify(exec);

function parseArgs(argv) {
  const args = {
    dryRun: false,
    verbose: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    if (token === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (token === "--verbose") {
      args.verbose = true;
      continue;
    }

    const key = token.slice(2).replace(/-/g, "_");

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }

    args[key] = value;
    index += 1;
  }

  return args;
}

async function loadSdk() {
  const sdkDistPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../../packages/sdk/dist/index.js"
  );

  if (!fs.existsSync(sdkDistPath)) {
    throw new Error(
      "Missing built SDK at packages/sdk/dist/index.js. Run `pnpm --filter @obora/runtime build && pnpm --filter @obora/sdk build` first."
    );
  }

  return await import(pathToFileURL(sdkDistPath).href);
}

function createRunPreparedTestCommandTool(rendered) {
  const { materializedTaskContext, artifactDir, runDir, workspacePath } = rendered;

  return {
    definition: {
      type: "function",
      function: {
        name: "run_prepared_test_command",
        description:
          "Run the task-specific prepared test command inside the prepared local workspace",
        parameters: {
          type: "object",
          properties: {
            reason: {
              type: "string",
              description:
                "Optional short note explaining why the validation step is running the command",
            },
          },
        },
      },
    },
    execute: async () => {
      const startedAt = Date.now();

      try {
        const { stdout, stderr } = await execAsync(materializedTaskContext.test_command, {
          cwd: workspacePath,
          maxBuffer: 10 * 1024 * 1024,
          timeout: 15 * 60 * 1000,
          shell: true,
        });

        const result = {
          success: true,
          command: materializedTaskContext.test_command,
          cwd: workspacePath,
          exitCode: 0,
          duration_ms: Date.now() - startedAt,
          stdout,
          stderr,
        };

        writeText(path.join(artifactDir, "test-command.stdout.log"), stdout);
        writeText(path.join(artifactDir, "test-command.stderr.log"), stderr);
        writeJson(path.join(artifactDir, "test-command.result.json"), result);

        return JSON.stringify(result);
      } catch (error) {
        const result = {
          success: false,
          command: materializedTaskContext.test_command,
          cwd: workspacePath,
          exitCode: typeof error.code === "number" ? error.code : null,
          signal: error.signal ?? null,
          duration_ms: Date.now() - startedAt,
          stdout: error.stdout ?? "",
          stderr: error.stderr ?? "",
          message: error.message,
        };

        writeText(path.join(artifactDir, "test-command.stdout.log"), result.stdout);
        writeText(path.join(artifactDir, "test-command.stderr.log"), result.stderr);
        writeJson(path.join(artifactDir, "test-command.result.json"), result);

        return JSON.stringify(result);
      }
    },
  };
}

function buildRunSummary(execution, rendered) {
  const validationOutputs = execution.completedSteps.filter(
    (stepName) => stepName === "run_tests_and_judge"
  );
  const implementationOutputs = execution.completedSteps.filter(
    (stepName) => stepName === "implement_or_repair"
  );
  const finalValidation = execution.outputs.run_tests_and_judge;
  const draft = readJson(rendered.resultRecordPath);

  const updatedDraft = {
    ...draft,
    success: Boolean(finalValidation?.passed),
    iterations: validationOutputs.length,
    repair_count: Math.max(implementationOutputs.length - 1, 0),
    final_verdict: finalValidation?.passed ? "resolved" : execution.status,
    failure_reason: finalValidation?.passed
      ? null
      : (execution.error ?? "validation_failed_or_not_executed"),
    notes:
      "Auto-populated core fields from run-one-task.mjs. Fill tool_calls and optional usage fields before appending.",
  };

  writeJson(rendered.resultRecordPath, updatedDraft);

  return updatedDraft;
}

async function runOneTask(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const rendered = renderTaskContext(argv);
  const sdk = await loadSdk();
  const workflow = await sdk.Workflow.fromYaml(rendered.workflowPath);

  if (args.dryRun) {
    writeJson(path.join(rendered.runDir, "dry-run-plan.json"), {
      workflow: workflow.name,
      steps: workflow.steps.map((step) => step.name),
      task_id: rendered.taskId,
      workspace: rendered.workspacePath,
      current_mount: rendered.currentDir,
    });
    printOk(`dry-run ready for ${rendered.taskId}`);
    console.log(`workflow: ${workflow.name}`);
    console.log(`steps: ${workflow.steps.map((step) => step.name).join(", ")}`);
    console.log(`run_dir: ${rendered.runDir}`);
    return rendered;
  }

  const loadedConfig = await sdk.loadConfig(args.obora_config);
  const llm = sdk.resolveLLMConfig(sdk.detectLLMConfigFromEnv(), loadedConfig);
  const runtime = new sdk.OboraRuntime({
    configPath: args.obora_config,
    config: loadedConfig,
    llm,
    verbose: args.verbose,
    stepTools: [createRunPreparedTestCommandTool(rendered)],
  });

  runtime.define(workflow.name, workflow);

  const originalCwd = process.cwd();
  process.chdir(rendered.workspacePath);

  let execution;

  try {
    const handle = await runtime.run(workflow.name);
    execution = await handle.wait();
  } finally {
    process.chdir(originalCwd);
  }

  writeJson(path.join(rendered.runDir, "obora-execution.json"), execution);
  writeJson(
    path.join(rendered.runDir, "result-record.autofill.json"),
    buildRunSummary(execution, rendered)
  );

  printOk(`workflow completed for ${rendered.taskId}`);
  console.log(`status: ${execution.status}`);
  console.log(`run_dir: ${rendered.runDir}`);
  return rendered;
}

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectExecution) {
  runOneTask().catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  });
}

export { runOneTask };
