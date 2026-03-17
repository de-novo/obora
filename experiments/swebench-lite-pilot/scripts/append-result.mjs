import fs from "node:fs";
import { fileURLToPath } from "node:url";

import { printOk, readJson, resolveInputPath } from "./lib.mjs";

function validateRecord(record) {
  const required = [
    "task_id",
    "benchmark",
    "model",
    "success",
    "wall_time_sec",
    "iterations",
    "repair_count",
    "tool_calls",
    "final_verdict",
    "failure_reason",
  ];

  required.forEach((key) => {
    if (!(key in record)) {
      throw new Error(`Missing required result field: ${key}`);
    }
  });

  if (record.benchmark !== "swe-bench-lite") {
    throw new Error("benchmark must equal swe-bench-lite.");
  }
}

function main() {
  const recordPath = resolveInputPath(process.argv[2]);
  const resultsPath = resolveInputPath(process.argv[3]);
  const record = readJson(recordPath);

  validateRecord(record);
  fs.appendFileSync(resultsPath, `${JSON.stringify(record)}\n`, "utf8");
  printOk(`appended result row to ${resultsPath}`);
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
