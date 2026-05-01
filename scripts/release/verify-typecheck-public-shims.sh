#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

node <<'JS'
const fs = require("node:fs");
const ts = require("typescript");

const contracts = [
  {
    name: "@obora/adapters",
    shim: "packages/adapters/src/typecheck-public.d.ts",
    declaration: "packages/adapters/dist/index.d.ts",
  },
  {
    name: "@obora/runtime",
    shim: "packages/runtime/src/typecheck-public.d.ts",
    declaration: "packages/runtime/dist/index.d.ts",
  },
  {
    name: "@obora/sdk",
    shim: "packages/sdk/src/typecheck-public.d.ts",
    declaration: "packages/sdk/dist/index.d.ts",
  },
];

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exitCode = 1;
}

for (const contract of contracts) {
  for (const file of [contract.shim, contract.declaration]) {
    if (!fs.existsSync(file)) {
      fail(`${contract.name} typecheck-public verification is missing ${file}`);
    }
  }
}

if (process.exitCode) {
  process.exit(process.exitCode);
}

const files = contracts.flatMap((contract) => [contract.shim, contract.declaration]);
const program = ts.createProgram(files, {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  target: ts.ScriptTarget.ES2022,
  skipLibCheck: true,
});
const checker = program.getTypeChecker();

function exportedNames(file) {
  const sourceFile = program.getSourceFile(file);
  if (!sourceFile) {
    fail(`TypeScript could not load ${file}`);
    return new Set();
  }

  const symbol = checker.getSymbolAtLocation(sourceFile);
  if (!symbol) {
    fail(`TypeScript could not inspect module symbol for ${file}`);
    return new Set();
  }

  return new Set(checker.getExportsOfModule(symbol).map((item) => item.name));
}

for (const contract of contracts) {
  const shimExports = exportedNames(contract.shim);
  const publicExports = exportedNames(contract.declaration);
  const missing = [...shimExports].filter((name) => !publicExports.has(name)).sort();

  if (missing.length > 0) {
    fail(
      `${contract.name} typecheck-public shim declares names absent from built public declarations: ${missing.join(", ")}`
    );
    continue;
  }

  console.log(
    `[PASS] ${contract.name} typecheck-public shim exports ${shimExports.size} names covered by ${contract.declaration}.`
  );
}

if (process.exitCode) {
  process.exit(process.exitCode);
}
JS
