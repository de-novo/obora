import { fileURLToPath } from "node:url";

import {
  ensureBenchmark,
  expectInteger,
  expectObject,
  expectString,
  printOk,
  readJson,
  resolveInputPath,
} from "./lib.mjs";

export function validateManifest(manifest) {
  expectObject(manifest, "manifest");
  expectString(manifest.schema_version, "schema_version");
  ensureBenchmark(manifest.benchmark);
  expectString(manifest.pilot_name, "pilot_name");
  expectString(manifest.selection_notes, "selection_notes");
  expectInteger(manifest.task_count, "task_count");

  if (!Array.isArray(manifest.tasks)) {
    throw new Error("tasks must be an array.");
  }

  if (manifest.tasks.length !== manifest.task_count) {
    throw new Error("task_count must match tasks.length.");
  }

  const seen = new Set();

  manifest.tasks.forEach((task, index) => {
    expectObject(task, `tasks[${index}]`);
    expectString(task.task_id, `tasks[${index}].task_id`);
    expectString(task.repo, `tasks[${index}].repo`);

    if (seen.has(task.task_id)) {
      throw new Error(`Duplicate task_id: ${task.task_id}`);
    }

    seen.add(task.task_id);
  });

  return manifest;
}

function main() {
  const filePath = resolveInputPath(process.argv[2]);
  const manifest = readJson(filePath);

  validateManifest(manifest);
  printOk(`manifest valid: ${filePath}`);
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
