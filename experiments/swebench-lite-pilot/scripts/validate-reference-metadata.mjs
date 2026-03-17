import { fileURLToPath } from "node:url";

import {
  ensureBenchmark,
  expectBoolean,
  expectNullableNumber,
  expectObject,
  expectString,
  printOk,
  readJson,
  resolveInputPath,
} from "./lib.mjs";

export function validateReferenceMetadata(referenceMetadata) {
  expectObject(referenceMetadata, "reference metadata");
  expectString(referenceMetadata.schema_version, "schema_version");
  ensureBenchmark(referenceMetadata.benchmark);
  expectString(referenceMetadata.snapshot_label, "snapshot_label");
  expectString(referenceMetadata.model_family, "model_family");
  expectBoolean(
    referenceMetadata.matched_local_baseline_available,
    "matched_local_baseline_available"
  );

  if (!Array.isArray(referenceMetadata.references) || referenceMetadata.references.length === 0) {
    throw new Error("references must be a non-empty array.");
  }

  referenceMetadata.references.forEach((reference, index) => {
    expectObject(reference, `references[${index}]`);
    expectString(reference.label, `references[${index}].label`);
    expectString(reference.source_type, `references[${index}].source_type`);
    expectString(reference.source_url, `references[${index}].source_url`);
    expectString(reference.model, `references[${index}].model`);
    expectNullableNumber(reference.score_percent, `references[${index}].score_percent`);
    expectString(reference.score_unit, `references[${index}].score_unit`);

    if (reference.notes !== undefined) {
      expectString(reference.notes, `references[${index}].notes`);
    }
  });

  if (referenceMetadata.comparison_notes !== undefined) {
    if (!Array.isArray(referenceMetadata.comparison_notes)) {
      throw new Error("comparison_notes must be an array when provided.");
    }

    referenceMetadata.comparison_notes.forEach((note, index) => {
      expectString(note, `comparison_notes[${index}]`);
    });
  }

  return referenceMetadata;
}

function main() {
  const filePath = resolveInputPath(process.argv[2]);
  const referenceMetadata = readJson(filePath);

  validateReferenceMetadata(referenceMetadata);
  printOk(`reference metadata valid: ${filePath}`);
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
