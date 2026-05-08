#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const packageFiles = [
  "package.json",
  ...readdirSync(join(repoRoot, "packages"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join("packages", entry.name, "package.json"))
    .filter((path) => existsSync(join(repoRoot, path))),
];

const dependencyFields = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
];

const deprecatedPackages = new Set([
  "@mariozechner/pi-agent-core",
  "@mariozechner/pi-ai",
]);

const managedRanges = new Map([
  ["@earendil-works/pi-agent-core", "^0.74.0"],
  ["@earendil-works/pi-ai", "^0.74.0"],
  ["@playwright/test", "^1.59.1"],
  ["@types/node", "^25.6.2"],
  ["@typescript-eslint/eslint-plugin", "^8.59.2"],
  ["@typescript-eslint/parser", "^8.59.2"],
  ["@vitest/coverage-v8", "^4.1.5"],
  ["better-sqlite3", "^12.9.0"],
  ["effect", "^3.21.2"],
  ["prettier", "^3.8.3"],
  ["tsup", "^8.5.1"],
  ["turbo", "^2.9.10"],
  ["typescript", "^6.0.3"],
  ["vitest", "^4.1.5"],
  ["ws", "^8.20.0"],
  ["yaml", "^2.8.4"],
  ["zod", "^4.4.3"],
]);

const readPackage = (path) => ({
  path,
  manifest: JSON.parse(readFileSync(join(repoRoot, path), "utf8")),
});

const entriesFor = ({ path, manifest }) =>
  dependencyFields.flatMap((field) =>
    Object.entries(manifest[field] ?? {}).map(([name, spec]) => ({
      path,
      field,
      name,
      spec,
    }))
  );

const allEntries = packageFiles.map(readPackage).flatMap(entriesFor);

const deprecatedFailures = allEntries
  .filter(({ name }) => deprecatedPackages.has(name))
  .map(({ path, field, name }) => `${path}: ${field} must not use deprecated ${name}`);

const managedRangeFailures = allEntries
  .filter(({ field, name }) => field !== "peerDependencies" && managedRanges.has(name))
  .filter(({ name, spec }) => spec !== managedRanges.get(name))
  .map(
    ({ path, field, name, spec }) =>
      `${path}: ${field}.${name} is ${spec}; expected ${managedRanges.get(name)}`
  );

const groupedSpecs = Object.entries(
  allEntries
    .filter(({ field, spec }) => field !== "peerDependencies" && !spec.startsWith("workspace:"))
    .reduce(
      (acc, { name, spec, path, field }) => ({
        ...acc,
        [name]: [...(acc[name] ?? []), { spec, path, field }],
      }),
      {}
    )
);

const inconsistentSpecFailures = groupedSpecs
  .map(([name, entries]) => ({
    name,
    entries,
    specs: [...new Set(entries.map(({ spec }) => spec))],
  }))
  .filter(({ specs }) => specs.length > 1)
  .map(
    ({ name, entries }) =>
      `${name}: inconsistent specs ${entries
        .map(({ path, field, spec }) => `${path}:${field}=${spec}`)
        .join(", ")}`
  );

const failures = [
  ...deprecatedFailures,
  ...managedRangeFailures,
  ...inconsistentSpecFailures,
];

if (failures.length > 0) {
  console.error("[FAIL] dependency policy check failed");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`[PASS] dependency policy verified ${packageFiles.length} package manifests.`);
