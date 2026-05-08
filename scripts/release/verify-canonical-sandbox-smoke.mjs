#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const sandboxRoot = join(repoRoot, "sandbox");

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

const parseJson = (path) => {
  try {
    return { ok: true, value: readJson(path) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
};

const listEntries = (path) => (existsSync(path) ? readdirSync(path, { withFileTypes: true }) : []);

const listFiles = (path) =>
  listEntries(path)
    .filter((entry) => entry.isFile())
    .map((entry) => join(path, entry.name));

const requiredRootFiles = ["README.md", "agents.yaml", "obora.config.yaml", "run.sh"];

const isCanonicalSandbox = (entry) =>
  entry.isDirectory() && /^\d{2}-/.test(entry.name) && Number(entry.name.slice(0, 2)) <= 21;

const isWorkflowResult = (result) =>
  typeof result?.workflowName === "string" &&
  result.status === "completed" &&
  Array.isArray(result.completedSteps);

const validateJsonFile = ([path, parsed]) =>
  parsed.ok ? [] : [`${path}: invalid JSON (${parsed.error})`];

const validateWorkflowResult = (sandboxName, resultPath, result) => [
  ...(result.completedSteps.length > 0 ? [] : [`${resultPath}: completedSteps is empty`]),
  ...(typeof result.id === "string" ? [] : [`${resultPath}: missing result id`]),
  ...(typeof result.startedAt === "string" ? [] : [`${resultPath}: missing startedAt`]),
  ...(typeof result.endedAt === "string" ? [] : [`${resultPath}: missing endedAt`]),
  ...(result.stepRecords && typeof result.stepRecords === "object"
    ? []
    : [`${resultPath}: missing stepRecords`]),
  ...(result.outputs && typeof result.outputs === "object" ? [] : [`${resultPath}: missing outputs`]),
  ...result.completedSteps
    .filter((step) => !Object.hasOwn(result.stepRecords ?? {}, step))
    .map((step) => `${resultPath}: completed step '${step}' has no stepRecords entry`),
  ...result.completedSteps
    .filter((step) => !Object.hasOwn(result.outputs ?? {}, step))
    .map((step) => `${resultPath}: completed step '${step}' has no outputs entry`),
  ...(/loop/.test(sandboxName) && result.completedSteps.length < 2
    ? [`${resultPath}: loop sandbox should include at least two completed workflow steps`]
    : []),
];

const validateSandbox = (entry) => {
  const sandboxDir = join(sandboxRoot, entry.name);
  const resultsDir = join(sandboxDir, "output", "iterations", "results");
  const finalDir = join(sandboxDir, "output", "final");
  const workflowDir = join(sandboxDir, "workflows");
  const resultFiles = listFiles(resultsDir).filter((path) => path.endsWith(".json"));
  const parsedResults = resultFiles.map((path) => [path, parseJson(path)]);
  const workflowResults = parsedResults
    .filter(([, parsed]) => parsed.ok && isWorkflowResult(parsed.value))
    .map(([path, parsed]) => [path, parsed.value]);

  return [
    ...requiredRootFiles
      .filter((file) => !existsSync(join(sandboxDir, file)))
      .map((file) => `${entry.name}: missing ${file}`),
    ...(existsSync(workflowDir) && listFiles(workflowDir).some((path) => path.endsWith(".yaml"))
      ? []
      : [`${entry.name}: missing workflow YAML`]),
    ...(existsSync(finalDir) && listFiles(finalDir).length > 0
      ? []
      : [`${entry.name}: missing output/final artifacts`]),
    ...(resultFiles.length > 0 ? [] : [`${entry.name}: missing result JSON artifacts`]),
    ...parsedResults.flatMap(validateJsonFile),
    ...(workflowResults.length === 1
      ? []
      : [`${entry.name}: expected exactly one completed workflow result, saw ${workflowResults.length}`]),
    ...workflowResults.flatMap(([path, result]) => validateWorkflowResult(entry.name, path, result)),
  ];
};

const sandboxEntries = listEntries(sandboxRoot).filter(isCanonicalSandbox);
const failures = [
  ...(statSync(sandboxRoot).isDirectory() ? [] : [`missing sandbox root: ${sandboxRoot}`]),
  ...(sandboxEntries.length === 21
    ? []
    : [`expected 21 canonical sandboxes, saw ${sandboxEntries.length}`]),
  ...sandboxEntries.flatMap(validateSandbox),
];

if (failures.length > 0) {
  console.error("[FAIL] canonical sandbox artifact smoke failed");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`[PASS] canonical sandbox artifact smoke verified ${sandboxEntries.length} sandboxes.`);
