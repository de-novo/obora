import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ensureDirectory,
  pathExists,
  printOk,
  readJson,
  removeIfExists,
  resolveInputPath,
  resolveSiblingPath,
  sanitizePathComponent,
  timestampForPath,
  writeJson,
  writeText,
} from "./lib.mjs";
import { validateConfig } from "./validate-config.mjs";
import { validateManifest } from "./validate-manifest.mjs";
import { validateTaskContext } from "./validate-task-context.mjs";

function parseArgs(argv) {
  const args = {
    dryRun: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2).replace(/-/g, "_");

    if (["dry_run", "json"].includes(key)) {
      args[key] = true;
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}`);
    }

    args[key] = value;
    index += 1;
  }

  return args;
}

function renderTaskBrief(taskContext, pilotConfig, selectedTask, runSpec) {
  const lines = [
    "# SWE-bench Lite Pilot Task Brief",
    "",
    `- task_id: ${taskContext.task_id}`,
    `- benchmark: ${taskContext.benchmark}`,
    `- repo: ${taskContext.repo}`,
    `- workspace_path: ${taskContext.workspace_path}`,
    `- base_commit: ${taskContext.base_commit ?? "not supplied"}`,
    `- test_command: ${taskContext.test_command}`,
    `- pilot_preset: ${pilotConfig.preset_name}`,
    `- manifest_repo_entry: ${selectedTask.repo}`,
    `- run_id: ${runSpec.runId}`,
    "",
    "## Issue",
    "",
    taskContext.issue_text.trim(),
  ];

  if (taskContext.constraints?.length) {
    lines.push("", "## Constraints", "", ...taskContext.constraints.map((item) => `- ${item}`));
  }

  if (taskContext.notes?.length) {
    lines.push("", "## Notes", "", ...taskContext.notes.map((item) => `- ${item}`));
  }

  if (taskContext.patch_hint_paths?.length) {
    lines.push(
      "",
      "## Patch Hint Paths",
      "",
      ...taskContext.patch_hint_paths.map((item) => `- ${item}`)
    );
  }

  lines.push(
    "",
    "## Execution Boundary",
    "",
    "- The reusable Obora workflow is generic; only this task context changes per task.",
    "- Local workspace preparation is external to the runner and remains manual for now.",
    "- The runner mounts this task context under `.obora-swebench/current/` inside the prepared workspace."
  );

  return `${lines.join("\n")}\n`;
}

function resolveTaskContextSource(manifestTask, manifestPath, args) {
  if (args.task_context) {
    return resolveInputPath(args.task_context);
  }

  if (manifestTask.task_context_path) {
    return resolveSiblingPath(manifestPath, manifestTask.task_context_path);
  }

  throw new Error(
    "Task context source missing. Pass --task-context or add task_context_path to the manifest entry."
  );
}

export function renderTaskContext(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const configPath = resolveInputPath(args.config);
  const pilotConfig = validateConfig(readJson(configPath));
  const manifestPath = args.manifest
    ? resolveInputPath(args.manifest)
    : resolveSiblingPath(configPath, pilotConfig.manifest_path);
  const manifest = validateManifest(readJson(manifestPath));
  const workspacePath = resolveInputPath(args.workspace_path);

  if (!pathExists(workspacePath)) {
    throw new Error(`Prepared workspace path does not exist: ${workspacePath}`);
  }

  const selectedTask = manifest.tasks.find((task) => task.task_id === args.task_id);
  if (!selectedTask) {
    throw new Error(`Task id not found in manifest: ${args.task_id}`);
  }

  const taskContextPath = resolveTaskContextSource(selectedTask, manifestPath, args);
  const sourceTaskContext = validateTaskContext(readJson(taskContextPath));

  if (sourceTaskContext.task_id !== selectedTask.task_id) {
    throw new Error("task context task_id must match the selected manifest task.");
  }

  if (sourceTaskContext.repo !== selectedTask.repo) {
    throw new Error("task context repo must match the selected manifest task repo.");
  }

  const mountDirName = pilotConfig.execution.context_mount_dir;
  if (mountDirName !== ".obora-swebench") {
    throw new Error(
      "execution.context_mount_dir must stay .obora-swebench for the shared workflow path."
    );
  }

  const mountRoot = path.join(workspacePath, mountDirName);
  const runId = `${timestampForPath()}-${sanitizePathComponent(selectedTask.task_id)}`;
  const runDir = path.join(mountRoot, "runs", runId);
  const currentDir = path.join(mountRoot, "current");
  const inputDir = path.join(runDir, "input");
  const artifactDir = path.join(runDir, "artifacts");
  const logDir = path.join(runDir, "logs");
  const workflowPath = resolveSiblingPath(configPath, pilotConfig.execution.workflow_path);
  const resultRecordPath = path.join(runDir, "result-record.draft.json");

  const materializedTaskContext = {
    ...sourceTaskContext,
    benchmark: pilotConfig.benchmark,
    workspace_path: workspacePath,
    runtime_context: {
      preset_name: pilotConfig.preset_name,
      workflow_path: workflowPath,
      context_mount_dir: mountDirName,
      run_id: runId,
      run_dir: runDir,
      current_mount_dir: currentDir,
      results_path: resolveSiblingPath(configPath, pilotConfig.results_path),
      references_path: resolveSiblingPath(configPath, pilotConfig.references_path),
      max_iterations: pilotConfig.execution.max_iterations,
      model: pilotConfig.execution.model,
    },
  };

  const taskBrief = renderTaskBrief(materializedTaskContext, pilotConfig, selectedTask, { runId });
  const resultRecordDraft = {
    task_id: materializedTaskContext.task_id,
    benchmark: materializedTaskContext.benchmark,
    model: pilotConfig.execution.model,
    success: false,
    wall_time_sec: 0,
    iterations: 0,
    repair_count: 0,
    tool_calls: 0,
    final_verdict: "pending",
    failure_reason: null,
    notes:
      "Draft record created by render-task-context.mjs. Update after execution before appending to results.",
  };

  ensureDirectory(inputDir);
  ensureDirectory(artifactDir);
  ensureDirectory(logDir);
  writeJson(path.join(inputDir, "task-context.json"), materializedTaskContext);
  writeText(path.join(inputDir, "task-brief.md"), taskBrief);
  writeJson(path.join(inputDir, "pilot-config.snapshot.json"), pilotConfig);
  writeJson(path.join(inputDir, "manifest-task.snapshot.json"), selectedTask);
  writeJson(resultRecordPath, resultRecordDraft);

  removeIfExists(currentDir);
  ensureDirectory(path.dirname(currentDir));
  const relativeRunDir = path.relative(path.dirname(currentDir), runDir);
  writeText(
    path.join(runDir, "README.md"),
    "This directory is managed by the SWE-bench Lite pilot runner.\n"
  );
  fs.symlinkSync(relativeRunDir, currentDir, "dir");

  return {
    configPath,
    manifestPath,
    workflowPath,
    workspacePath,
    taskContextPath,
    taskId: selectedTask.task_id,
    repo: selectedTask.repo,
    mountRoot,
    runId,
    runDir,
    currentDir,
    inputDir,
    artifactDir,
    resultRecordPath,
    materializedTaskContext,
    resultRecordDraft,
  };
}

function main() {
  const result = renderTaskContext();

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printOk(`task context rendered for ${result.taskId}`);
  console.log(`workflow: ${result.workflowPath}`);
  console.log(`workspace: ${result.workspacePath}`);
  console.log(`run_dir: ${result.runDir}`);
  console.log(`current_mount: ${result.currentDir}`);
}

const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (isDirectExecution) {
  try {
    main();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}
