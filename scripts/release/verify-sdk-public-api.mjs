#!/usr/bin/env node

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const ts = require("typescript");

const snapshotPath = "packages/sdk/api-snapshot.json";
const packageJsonPath = "packages/sdk/package.json";

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function exportedNames(files) {
  const program = ts.createProgram(files, {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const result = {};

  files.forEach((file) => {
    const sourceFile = program.getSourceFile(file);
    const symbol = sourceFile ? checker.getSymbolAtLocation(sourceFile) : undefined;
    if (!symbol) {
      fail(`TypeScript could not inspect exports for ${file}`);
      result[file] = [];
      return;
    }

    result[file] = checker.getExportsOfModule(symbol).map((item) => item.name).sort();
  });

  return result;
}

function compareArray(label, actual, expected) {
  const added = actual.filter((name) => !expected.includes(name));
  const removed = expected.filter((name) => !actual.includes(name));
  if (added.length === 0 && removed.length === 0) {
    console.log(`[PASS] ${label} matches public API snapshot (${actual.length} entries).`);
    return;
  }

  fail(`${label} drifted from public API snapshot.`);
  if (added.length > 0) {
    console.error(`  Added: ${added.join(", ")}`);
  }
  if (removed.length > 0) {
    console.error(`  Removed: ${removed.join(", ")}`);
  }
}

const snapshot = readJson(snapshotPath);
const pkg = readJson(packageJsonPath);

const actualPackageExports = Object.keys(pkg.exports ?? {}).sort();
compareArray("packages/sdk package exports", actualPackageExports, snapshot.packageExports);

const declarationFiles = {
  root: "packages/sdk/dist/index.d.ts",
  testing: "packages/sdk/dist/testing/index.d.ts",
};
const actualExports = exportedNames(Object.values(declarationFiles));

compareArray(
  "@obora/sdk root exports",
  actualExports[declarationFiles.root] ?? [],
  snapshot.rootExports,
);
compareArray(
  "@obora/sdk/testing exports",
  actualExports[declarationFiles.testing] ?? [],
  snapshot.testingExports,
);

if (process.exitCode) {
  console.error("Update packages/sdk/api-snapshot.json only when the public SDK surface intentionally changes.");
  process.exit(process.exitCode);
}
