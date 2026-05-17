#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const baselinePath = join(repoRoot, "scripts", "release", "functional-policy-baseline.json");
const shouldUpdateBaseline = process.argv.includes("--update");
const allowIncrease = process.argv.includes("--allow-increase");
const roots = ["packages", "scripts"];
const zeroCounts = {
  mutableBinding: 0,
  loopStatement: 0,
};

const excludedParts = new Set([
  ".coverage",
  ".git",
  ".review-gate",
  ".turbo",
  "__tests__",
  "coverage",
  "dist",
  "node_modules",
]);

const sourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".sh",
  ".ts",
  ".tsx",
]);

const mutablePattern = new RegExp("\\b" + "le" + "t\\b", "g");
const loopPattern = new RegExp("(?<!\\.)\\b" + "fo" + "r\\s*(await\\s*)?\\(", "g");

const hasSourceExtension = (path) => [...sourceExtensions].some((extension) => path.endsWith(extension));

const toRepoPath = (path) => relative(repoRoot, path).split("/").join("/");

const hasExcludedPart = (path) => {
  const parts = toRepoPath(path).split("/");
  return parts.some((part) => excludedParts.has(part));
};

const shouldSkipFile = (path) => {
  const parts = toRepoPath(path).split("/");
  const name = parts.at(-1) ?? "";
  return (
    hasExcludedPart(path) ||
    name.includes(".test.") ||
    name.includes(".spec.") ||
    !hasSourceExtension(path)
  );
};

const listFiles = (path) => {
  if (!existsSync(path) || hasExcludedPart(path)) {
    return [];
  }

  if (statSync(path).isFile()) {
    return shouldSkipFile(path) ? [] : [path];
  }

  return readdirSync(path).flatMap((entry) => listFiles(join(path, entry)));
};

const countMatches = (text, pattern) => [...text.matchAll(pattern)].length;

const countFile = (path) => {
  const text = readFileSync(path, "utf8");
  return {
    path: toRepoPath(path),
    mutableBinding: countMatches(text, mutablePattern),
    loopStatement: countMatches(text, loopPattern),
  };
};

const readBaselineDocument = () => {
  if (!existsSync(baselinePath)) {
    console.error(`[FAIL] missing functional policy baseline: ${toRepoPath(baselinePath)}`);
    process.exit(1);
  }

  return JSON.parse(readFileSync(baselinePath, "utf8"));
};

const readBaseline = () => readBaselineDocument().files ?? {};

const sumCounts = (items) =>
  items.reduce(
    (acc, item) => ({
      mutableBinding: acc.mutableBinding + item.mutableBinding,
      loopStatement: acc.loopStatement + item.loopStatement,
    }),
    zeroCounts
  );

const currentFiles = roots
  .flatMap((root) => listFiles(join(repoRoot, root)))
  .map(countFile);
const currentByPath = Object.fromEntries(currentFiles.map((file) => [file.path, file]));
const baselineByPath = readBaseline();
const allPaths = [...new Set([...Object.keys(currentByPath), ...Object.keys(baselineByPath)])].sort();

const failures = allPaths.flatMap((path) => {
  const current = currentByPath[path] ?? zeroCounts;
  const baseline = baselineByPath[path] ?? zeroCounts;
  const countFailures = Object.entries(baseline).flatMap(([name, allowed]) =>
    current[name] > allowed ? [`${path} ${name} count ${current[name]} exceeds file baseline ${allowed}`] : []
  );
  const staleFailures =
    currentByPath[path] === undefined ? [`${path} is no longer scanned; remove it from the functional baseline`] : [];

  return [...countFailures, ...staleFailures];
});
const counts = sumCounts(currentFiles);
const budgets = sumCounts(Object.values(baselineByPath));

if (shouldUpdateBaseline) {
  const increases = allPaths.flatMap((path) => {
    const current = currentByPath[path] ?? zeroCounts;
    const baseline = baselineByPath[path] ?? zeroCounts;
    return Object.entries(baseline).flatMap(([name, allowed]) =>
      current[name] > allowed ? [`${path} ${name} count ${current[name]} exceeds file baseline ${allowed}`] : []
    );
  });

  if (increases.length > 0 && !allowIncrease) {
    console.error("[FAIL] functional policy baseline update would increase tracked debt");
    increases.forEach((failure) => console.error(`- ${failure}`));
    console.error("Use --allow-increase only with documented reviewer approval.");
    process.exit(1);
  }

  const nextFiles = Object.fromEntries(
    currentFiles
      .filter(({ mutableBinding, loopStatement }) => mutableBinding > 0 || loopStatement > 0)
      .sort((a, b) => a.path.localeCompare(b.path))
      .map(({ path, mutableBinding, loopStatement }) => [path, { mutableBinding, loopStatement }])
  );
  const nextCounts = sumCounts(Object.values(nextFiles));

  writeFileSync(
    baselinePath,
    JSON.stringify(
      {
        ...readBaselineDocument(),
        files: nextFiles,
      },
      null,
      2
    ) + "\n"
  );

  console.log(
    `[PASS] functional policy baseline updated: mutableBinding=${budgets.mutableBinding}->${nextCounts.mutableBinding}, loopStatement=${budgets.loopStatement}->${nextCounts.loopStatement}, files=${Object.keys(baselineByPath).length}->${Object.keys(nextFiles).length}.`
  );
  process.exit(0);
}

if (failures.length > 0) {
  console.error("[FAIL] functional policy check failed");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `[PASS] functional policy file baselines respected: mutableBinding=${counts.mutableBinding}/${budgets.mutableBinding}, loopStatement=${counts.loopStatement}/${budgets.loopStatement}, files=${Object.keys(baselineByPath).length}.`
);
