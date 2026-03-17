import { fileURLToPath } from "node:url";

import {
  average,
  expectBoolean,
  expectInteger,
  expectNullableNumber,
  expectNullableString,
  expectObject,
  expectString,
  printOk,
  readJson,
  readJsonLines,
  resolveInputPath,
  round,
} from "./lib.mjs";
import { validateReferenceMetadata } from "./validate-reference-metadata.mjs";

function validateResultRow(row, index) {
  expectObject(row, `results[${index}]`);
  expectString(row.task_id, `results[${index}].task_id`);
  expectString(row.benchmark, `results[${index}].benchmark`);

  if (row.benchmark !== "swe-bench-lite") {
    throw new Error(`results[${index}].benchmark must equal swe-bench-lite.`);
  }

  expectString(row.model, `results[${index}].model`);
  expectBoolean(row.success, `results[${index}].success`);
  expectNumberAtLeastZero(row.wall_time_sec, `results[${index}].wall_time_sec`);
  expectIntegerAtLeastZero(row.iterations, `results[${index}].iterations`);
  expectIntegerAtLeastZero(row.repair_count, `results[${index}].repair_count`);
  expectIntegerAtLeastZero(row.tool_calls, `results[${index}].tool_calls`);
  expectString(row.final_verdict, `results[${index}].final_verdict`);

  expectNullableString(row.failure_reason, `results[${index}].failure_reason`);

  if (row.prompt_tokens !== undefined) {
    expectIntegerAtLeastZero(row.prompt_tokens, `results[${index}].prompt_tokens`);
  }

  if (row.completion_tokens !== undefined) {
    expectIntegerAtLeastZero(row.completion_tokens, `results[${index}].completion_tokens`);
  }

  if (row.total_tokens !== undefined) {
    expectIntegerAtLeastZero(row.total_tokens, `results[${index}].total_tokens`);
  }

  if (row.estimated_cost_usd !== undefined) {
    expectNumberAtLeastZero(row.estimated_cost_usd, `results[${index}].estimated_cost_usd`);
  }

  if (row.public_reference_label !== undefined) {
    expectNullableString(row.public_reference_label, `results[${index}].public_reference_label`);
  }

  if (row.public_reference_score !== undefined) {
    expectNullableNumber(row.public_reference_score, `results[${index}].public_reference_score`);
  }
}

function expectNumberAtLeastZero(value, label) {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) {
    throw new Error(`${label} must be a number >= 0.`);
  }
}

function expectIntegerAtLeastZero(value, label) {
  expectInteger(value, label);

  if (value < 0) {
    throw new Error(`${label} must be an integer >= 0.`);
  }
}

function parseArgs(argv) {
  const resultsPathArg = argv[2];
  const referenceFlagIndex = argv.indexOf("--reference");
  const referencePathArg =
    referenceFlagIndex >= 0 && argv[referenceFlagIndex + 1]
      ? argv[referenceFlagIndex + 1]
      : undefined;

  return {
    resultsPath: resolveInputPath(resultsPathArg),
    referencePath: referencePathArg ? resolveInputPath(referencePathArg) : undefined,
  };
}

function buildSummary(results, referenceMetadata) {
  const successCount = results.filter((row) => row.success).length;
  const failureReasons = {};
  const models = [...new Set(results.map((row) => row.model))].sort();

  results.forEach((row) => {
    if (!row.success) {
      const key = row.failure_reason ?? "unspecified";
      failureReasons[key] = (failureReasons[key] ?? 0) + 1;
    }
  });

  const reference = referenceMetadata?.references.find(
    (item) => typeof item.score_percent === "number"
  );
  const successRatePercent = round((successCount / results.length) * 100, 2);

  return {
    benchmark: "swe-bench-lite",
    tasks_attempted: results.length,
    models,
    success_count: successCount,
    success_rate_percent: successRatePercent,
    average_wall_time_sec: round(average(results.map((row) => row.wall_time_sec)), 2),
    average_iterations: round(average(results.map((row) => row.iterations)), 2),
    average_repair_count: round(average(results.map((row) => row.repair_count)), 2),
    average_tool_calls: round(average(results.map((row) => row.tool_calls)), 2),
    failure_reasons: failureReasons,
    public_reference: reference
      ? {
          label: reference.label,
          model: reference.model,
          score_percent: reference.score_percent,
          delta_percent: round(successRatePercent - reference.score_percent, 2),
          source_url: reference.source_url,
        }
      : null,
  };
}

function main() {
  const { resultsPath, referencePath } = parseArgs(process.argv);
  const results = readJsonLines(resultsPath);
  const seenTaskIds = new Set();

  if (results.length === 0) {
    throw new Error("results file must contain at least one JSONL row.");
  }

  results.forEach((row, index) => {
    validateResultRow(row, index);

    if (seenTaskIds.has(row.task_id)) {
      throw new Error(`Duplicate task_id in results: ${row.task_id}`);
    }

    seenTaskIds.add(row.task_id);
  });

  const referenceMetadata = referencePath
    ? validateReferenceMetadata(readJson(referencePath))
    : undefined;

  const summary = buildSummary(results, referenceMetadata);

  printOk(`results summarized: ${resultsPath}`);
  console.log(JSON.stringify(summary, null, 2));
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
