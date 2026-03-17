import { fileURLToPath } from "node:url";

import { pathExists, printOk, readJson, resolveInputPath, resolveSiblingPath } from "./lib.mjs";
import { validateConfig } from "./validate-config.mjs";
import { validateManifest } from "./validate-manifest.mjs";
import { validateReferenceMetadata } from "./validate-reference-metadata.mjs";

function main() {
  const configPath = resolveInputPath(process.argv[2]);
  const config = validateConfig(readJson(configPath));
  const manifestPath = resolveSiblingPath(configPath, config.manifest_path);
  const referencesPath = resolveSiblingPath(configPath, config.references_path);
  const workflowPath = resolveSiblingPath(configPath, config.execution.workflow_path);
  const manifest = validateManifest(readJson(manifestPath));

  validateReferenceMetadata(readJson(referencesPath));

  if (manifest.task_count !== config.pilot_size) {
    throw new Error("config pilot_size must match manifest task_count.");
  }

  if (!pathExists(workflowPath)) {
    throw new Error(`workflow file missing: ${workflowPath}`);
  }

  printOk(`pilot scaffold linked correctly: ${configPath}`);
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
