#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const coverageMetrics = ["statements", "branches", "functions", "lines"];
const packages = [
  { label: "sdk", filter: "@obora/sdk" },
  { label: "runtime", filter: "@obora/runtime" },
  { label: "adapters", filter: "@obora/adapters" },
  { label: "cli", filter: "@obora/cli" },
  { label: "dashboard", filter: "@obora/dashboard" },
  { label: "ops", filter: "@obora/ops" },
];

const thresholdArg = process.argv.find((arg) => arg.startsWith("--threshold="));
const threshold = thresholdArg ? Number(thresholdArg.split("=")[1]) : undefined;
if (threshold !== undefined && (!Number.isFinite(threshold) || threshold < 0 || threshold > 100)) {
  console.error("Invalid --threshold value. Expected a number from 0 to 100.");
  process.exit(1);
}

const rootDir = process.cwd();
const thresholdsArg = process.argv.find((arg) => arg.startsWith("--thresholds="));
const thresholdsPath = thresholdsArg ? thresholdsArg.slice("--thresholds=".length) : undefined;

const formatPercent = (value) => `${value.toFixed(2)}%`;

const loadThresholds = (path) => {
  if (path === undefined) {
    return undefined;
  }

  if (path.length === 0) {
    console.error("Invalid --thresholds value. Expected a JSON file path.");
    process.exit(1);
  }

  const resolvedPath = resolve(rootDir, path);
  let raw;
  try {
    raw = JSON.parse(readFileSync(resolvedPath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to read coverage thresholds from ${resolvedPath}: ${message}`);
    process.exit(1);
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    console.error("Coverage thresholds must be a JSON object keyed by package name.");
    process.exit(1);
  }

  const expectedPackages = new Set(packages.map((pkg) => pkg.filter));
  const providedPackages = new Set(Object.keys(raw));
  const errors = [];

  for (const packageName of providedPackages) {
    if (!expectedPackages.has(packageName)) {
      errors.push(`unknown package: ${packageName}`);
      continue;
    }

    const packageThresholds = raw[packageName];
    if (
      !packageThresholds ||
      typeof packageThresholds !== "object" ||
      Array.isArray(packageThresholds)
    ) {
      errors.push(`${packageName}: thresholds must be an object`);
      continue;
    }

    for (const metric of Object.keys(packageThresholds)) {
      if (!coverageMetrics.includes(metric)) {
        errors.push(`${packageName}: unknown metric ${metric}`);
      }
    }

    for (const metric of coverageMetrics) {
      const value = packageThresholds[metric];
      if (value === undefined) {
        errors.push(`${packageName}: missing metric ${metric}`);
        continue;
      }

      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100) {
        errors.push(`${packageName}: ${metric} must be a number from 0 to 100`);
      }
    }
  }

  for (const packageName of expectedPackages) {
    if (!providedPackages.has(packageName)) {
      errors.push(`missing package: ${packageName}`);
    }
  }

  if (errors.length > 0) {
    console.error("Invalid coverage thresholds:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  return raw;
};

const thresholds = loadThresholds(thresholdsPath);
const outputDir = resolve(rootDir, ".coverage");
mkdirSync(outputDir, { recursive: true });

const rows = [];

for (const pkg of packages) {
  const reportsDirectory = resolve(outputDir, pkg.label);
  mkdirSync(reportsDirectory, { recursive: true });

  const result = spawnSync(
    "pnpm",
    [
      "--filter",
      pkg.filter,
      "exec",
      "vitest",
      "run",
      "--coverage",
      "--coverage.reporter=json-summary",
      "--coverage.reporter=text-summary",
      `--coverage.reportsDirectory=${reportsDirectory}`,
      "--silent",
    ],
    {
      cwd: rootDir,
      stdio: "inherit",
    }
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  const summaryPath = resolve(reportsDirectory, "coverage-summary.json");
  if (!existsSync(summaryPath)) {
    console.error(`Coverage summary was not created for ${pkg.filter}: ${summaryPath}`);
    process.exit(1);
  }

  const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
  rows.push({
    package: pkg.filter,
    statements: summary.total.statements.pct,
    branches: summary.total.branches.pct,
    functions: summary.total.functions.pct,
    lines: summary.total.lines.pct,
  });
}

const columns = [
  ["package", 18],
  ["statements", 12],
  ["branches", 10],
  ["functions", 11],
  ["lines", 8],
];

const formatCell = (value, width) => String(value).padEnd(width, " ");

console.log("");
console.log("Coverage summary");
console.log(columns.map(([name, width]) => formatCell(name, width)).join(""));
console.log(columns.map(([, width]) => "-".repeat(width - 1).padEnd(width, " ")).join(""));

for (const row of rows) {
  console.log(
    [
      formatCell(row.package, 18),
      formatCell(formatPercent(row.statements), 12),
      formatCell(formatPercent(row.branches), 10),
      formatCell(formatPercent(row.functions), 11),
      formatCell(formatPercent(row.lines), 8),
    ].join("")
  );
}

if (threshold !== undefined) {
  const failures = rows.flatMap((row) =>
    coverageMetrics
      .filter((metric) => row[metric] < threshold)
      .map((metric) => `${row.package} ${metric} ${formatPercent(row[metric])}`)
  );

  if (failures.length > 0) {
    console.error("");
    console.error(`Coverage threshold ${formatPercent(threshold)} was not met:`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}

if (thresholds) {
  const failures = rows.flatMap((row) =>
    coverageMetrics
      .filter((metric) => row[metric] < thresholds[row.package][metric])
      .map(
        (metric) =>
          `${row.package} ${metric} ${formatPercent(row[metric])} < ${formatPercent(thresholds[row.package][metric])}`
      )
  );

  if (failures.length > 0) {
    console.error("");
    console.error(`Coverage thresholds from ${thresholdsPath} were not met:`);
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }
}
