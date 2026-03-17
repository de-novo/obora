import { fileURLToPath } from "node:url";

import {
  ensureBenchmark,
  expectArray,
  expectNullableString,
  expectObject,
  expectString,
  expectStringArray,
  printOk,
  readJson,
  resolveInputPath,
} from "./lib.mjs";

export function validateTaskContext(taskContext) {
  expectObject(taskContext, "task context");
  expectString(taskContext.schema_version, "schema_version");
  ensureBenchmark(taskContext.benchmark);
  expectString(taskContext.task_id, "task_id");
  expectString(taskContext.repo, "repo");
  expectString(taskContext.issue_text, "issue_text");
  expectNullableString(taskContext.base_commit ?? null, "base_commit");
  expectString(taskContext.test_command, "test_command");
  expectString(taskContext.workspace_path, "workspace_path");

  if (taskContext.workspace_preparation !== undefined) {
    expectString(taskContext.workspace_preparation, "workspace_preparation");
  }

  if (taskContext.notes !== undefined) {
    expectStringArray(taskContext.notes, "notes");
  }

  if (taskContext.constraints !== undefined) {
    expectStringArray(taskContext.constraints, "constraints");
  }

  if (taskContext.patch_hint_paths !== undefined) {
    expectStringArray(taskContext.patch_hint_paths, "patch_hint_paths");
  }

  if (taskContext.metadata !== undefined) {
    expectObject(taskContext.metadata, "metadata");
  }

  if (taskContext.attachments !== undefined) {
    expectArray(taskContext.attachments, "attachments");
    taskContext.attachments.forEach((attachment, index) => {
      expectObject(attachment, `attachments[${index}]`);
      expectString(attachment.label, `attachments[${index}].label`);
      expectString(attachment.path, `attachments[${index}].path`);
    });
  }

  return taskContext;
}

function main() {
  const filePath = resolveInputPath(process.argv[2]);
  const taskContext = readJson(filePath);

  validateTaskContext(taskContext);
  printOk(`task context valid: ${filePath}`);
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
