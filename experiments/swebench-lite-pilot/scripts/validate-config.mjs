import { fileURLToPath } from "node:url";

import {
  ensureBenchmark,
  expectBoolean,
  expectInteger,
  expectObject,
  expectString,
  printOk,
  readJson,
  resolveInputPath,
} from "./lib.mjs";

export function validateConfig(config) {
  expectObject(config, "config");
  expectString(config.schema_version, "schema_version");
  ensureBenchmark(config.benchmark);
  expectString(config.preset_name, "preset_name");
  expectInteger(config.pilot_size, "pilot_size");

  if (![5, 10].includes(config.pilot_size)) {
    throw new Error("pilot_size must be 5 or 10.");
  }

  expectString(config.manifest_path, "manifest_path");
  expectString(config.results_path, "results_path");
  expectString(config.references_path, "references_path");

  expectObject(config.execution, "execution");
  expectString(config.execution.runner, "execution.runner");
  expectString(config.execution.mode, "execution.mode");
  expectString(config.execution.model, "execution.model");
  expectInteger(config.execution.max_iterations, "execution.max_iterations");
  expectBoolean(config.execution.record_optional_usage, "execution.record_optional_usage");

  if (config.execution.runner !== "obora-loop") {
    throw new Error("execution.runner must equal obora-loop.");
  }

  expectObject(config.fairness_controls, "fairness_controls");
  expectNumberLike(config.fairness_controls.temperature, "fairness_controls.temperature");
  expectString(config.fairness_controls.task_order, "fairness_controls.task_order");
  expectInteger(
    config.fairness_controls.max_wall_time_sec_per_task,
    "fairness_controls.max_wall_time_sec_per_task"
  );
  expectString(config.fairness_controls.notes, "fairness_controls.notes");

  return config;
}

function expectNumberLike(value, label) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(`${label} must be a number.`);
  }
}

function main() {
  const filePath = resolveInputPath(process.argv[2]);
  const config = readJson(filePath);

  validateConfig(config);
  printOk(`config valid: ${filePath}`);
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
