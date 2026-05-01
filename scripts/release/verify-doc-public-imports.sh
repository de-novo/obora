#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

TMP_HITS="$(mktemp)"
cleanup() { rm -f "$TMP_HITS"; }
trap cleanup EXIT

node <<'JS' > "$TMP_HITS"
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function walk(dir, predicate, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, predicate, out);
    } else if (predicate(fullPath)) {
      out.push(fullPath);
    }
  }
  return out;
}

function findTypesTarget(value) {
  if (typeof value === "string") {
    return value.endsWith(".d.ts") || value.endsWith(".d.cts") ? value : null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  if (typeof value.types === "string") {
    return value.types;
  }
  for (const key of ["import", "require", "default"]) {
    const nested = findTypesTarget(value[key]);
    if (nested) return nested;
  }
  return null;
}

const publicSpecifiers = new Map();
for (const packageJson of walk("packages", (file) => file.endsWith("package.json"))) {
  const pkg = readJson(packageJson);
  if (typeof pkg.name !== "string" || pkg.private === true) {
    continue;
  }

  const packageDir = path.dirname(packageJson);
  if (pkg.exports && typeof pkg.exports === "object") {
    for (const [exportName, exportValue] of Object.entries(pkg.exports)) {
      const typesTarget = findTypesTarget(exportValue);
      if (!typesTarget) continue;
      const specifier = exportName === "." ? pkg.name : `${pkg.name}/${exportName.replace(/^\.\//, "")}`;
      publicSpecifiers.set(specifier, path.resolve(packageDir, typesTarget));
    }
  } else if (typeof pkg.types === "string") {
    publicSpecifiers.set(pkg.name, path.resolve(packageDir, pkg.types));
  }
}

const markdownFiles = [
  "README.md",
  ...walk("docs", (file) => file.endsWith(".md")),
  ...walk("packages", (file) => path.basename(file) === "README.md"),
].filter((file) => fs.existsSync(file));

const specifierPatterns = [
  /\bfrom\s+['"](@obora\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_./-]+)?)['"]/g,
  /\bimport\s*\(\s*['"](@obora\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_./-]+)?)['"]\s*\)/g,
  /\brequire\s*\(\s*['"](@obora\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_./-]+)?)['"]\s*\)/g,
];

const hits = [];
const importStatements = [];
for (const markdownFile of markdownFiles) {
  const lines = fs.readFileSync(markdownFile, "utf8").split(/\r?\n/);
  let buffer = [];
  let startLine = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const pattern of specifierPatterns) {
      pattern.lastIndex = 0;
      for (const match of line.matchAll(pattern)) {
        if (!publicSpecifiers.has(match[1])) {
          hits.push(`${markdownFile}:${index + 1}:${match[1]}`);
        }
      }
    }

    const trimmed = line.trim();
    if (buffer.length === 0 && /^import\s+(?!\()/.test(trimmed)) {
      buffer = [line];
      startLine = index + 1;
    } else if (buffer.length > 0) {
      buffer.push(line);
    }

    if (buffer.length > 0 && line.includes(";")) {
      const statement = buffer.join("\n");
      if (statement.includes("@obora/")) {
        importStatements.push({ markdownFile, startLine, statement });
      }
      buffer = [];
      startLine = 0;
    }
  }
}

for (const [specifier, declarationPath] of publicSpecifiers) {
  if (!fs.existsSync(declarationPath)) {
    hits.push(`${specifier}:missing declaration file ${path.relative(process.cwd(), declarationPath)}`);
  }
}

if (hits.length === 0 && importStatements.length > 0) {
  const declarationPaths = [...new Set(publicSpecifiers.values())];
  const program = ts.createProgram(declarationPaths, {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const exportCache = new Map();

  function getExports(specifier) {
    if (exportCache.has(specifier)) return exportCache.get(specifier);
    const declarationPath = publicSpecifiers.get(specifier);
    const sourceFile = program.getSourceFile(declarationPath);
    const symbol = sourceFile ? checker.getSymbolAtLocation(sourceFile) : undefined;
    const exports = symbol ? new Set(checker.getExportsOfModule(symbol).map((item) => item.name)) : new Set();
    exportCache.set(specifier, exports);
    return exports;
  }

  for (const { markdownFile, startLine, statement } of importStatements) {
    const sourceFile = ts.createSourceFile("doc-import.ts", statement, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
    for (const node of sourceFile.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) {
        continue;
      }
      const specifier = node.moduleSpecifier.text;
      if (!specifier.startsWith("@obora/") || !publicSpecifiers.has(specifier)) {
        continue;
      }

      const importClause = node.importClause;
      if (!importClause) continue;
      const exports = getExports(specifier);
      if (importClause.name && !exports.has("default")) {
        hits.push(`${markdownFile}:${startLine}:${specifier} missing default export`);
      }
      const namedBindings = importClause.namedBindings;
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          const importedName = (element.propertyName ?? element.name).text;
          if (!exports.has(importedName)) {
            hits.push(`${markdownFile}:${startLine}:${specifier} missing export ${importedName}`);
          }
        }
      }
    }
  }
}

for (const hit of hits) {
  console.log(hit);
}
JS

if [[ -s "$TMP_HITS" ]]; then
  echo "[FAIL] Markdown docs reference @obora imports that are not public package exports:" >&2
  cat "$TMP_HITS" >&2
  echo "       Update the docs sample or add the export intentionally in package.json." >&2
  exit 1
fi

echo "[PASS] Markdown @obora import samples match public package exports and declaration symbols."
