#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const publishablePackages = [
  "packages/runtime",
  "packages/adapters",
  "packages/sdk",
  "packages/cli",
];

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function readPackageJson(packageDir) {
  return JSON.parse(readFileSync(resolve(rootDir, packageDir, "package.json"), "utf8"));
}

function normalizeTag(rawTag) {
  const tag = String(rawTag ?? "").trim();
  if (!tag) {
    fail("release tag is required. Pass v<package-version> or set RELEASE_TAG.");
  }
  return tag.replace(/^refs\/tags\//, "");
}

const rawTag = process.argv[2] ?? process.env.RELEASE_TAG ?? process.env.GITHUB_REF_NAME ?? process.env.GITHUB_REF;
const releaseTag = normalizeTag(rawTag);
const match = /^v(?<version>\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/.exec(releaseTag);

if (!match?.groups?.version) {
  fail(`release tag must be semver-like and prefixed with v: ${releaseTag}`);
}

const releaseVersion = match.groups.version;
const packageVersions = publishablePackages.map((packageDir) => {
  const pkg = readPackageJson(packageDir);
  return { packageDir, name: pkg.name, version: pkg.version };
});

for (const pkg of packageVersions) {
  if (pkg.version !== releaseVersion) {
    fail(`${pkg.name} version ${pkg.version} does not match release tag ${releaseTag}`);
  }
}

const changelog = readFileSync(resolve(rootDir, "CHANGELOG.md"), "utf8");
if (!changelog.includes(`## [${releaseVersion}]`)) {
  fail(`CHANGELOG.md is missing a ## [${releaseVersion}] section`);
}

console.log(
  `[PASS] Release tag ${releaseTag} matches publishable package versions: ${packageVersions
    .map((pkg) => `${pkg.name}@${pkg.version}`)
    .join(", ")}.`
);
