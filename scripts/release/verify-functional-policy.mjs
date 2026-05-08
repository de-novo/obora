#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const roots = ["packages", "scripts"];
const budgets = {
  mutableBinding: 326,
  loopStatement: 502,
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
const loopPattern = new RegExp("\\b" + "fo" + "r\\s*(await\\s*)?\\(", "g");

const hasSourceExtension = (path) => [...sourceExtensions].some((extension) => path.endsWith(extension));

const hasExcludedPart = (path) => {
  const parts = relative(repoRoot, path).split("/");
  return parts.some((part) => excludedParts.has(part));
};

const shouldSkipFile = (path) => {
  const parts = relative(repoRoot, path).split("/");
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
    path,
    mutableBinding: countMatches(text, mutablePattern),
    loopStatement: countMatches(text, loopPattern),
  };
};

const counts = roots
  .flatMap((root) => listFiles(join(repoRoot, root)))
  .map(countFile)
  .reduce(
    (acc, item) => ({
      mutableBinding: acc.mutableBinding + item.mutableBinding,
      loopStatement: acc.loopStatement + item.loopStatement,
    }),
    { mutableBinding: 0, loopStatement: 0 }
  );

const failures = Object.entries(budgets)
  .filter(([name, budget]) => counts[name] > budget)
  .map(([name, budget]) => `${name} count ${counts[name]} exceeds baseline ${budget}`);

if (failures.length > 0) {
  console.error("[FAIL] functional policy check failed");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `[PASS] functional policy baseline respected: mutableBinding=${counts.mutableBinding}/${budgets.mutableBinding}, loopStatement=${counts.loopStatement}/${budgets.loopStatement}.`
);
