#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

TMP_DIR="$(mktemp -d "$ROOT_DIR/.tmp-doc-code-snippets.XXXXXX")"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

node - "$TMP_DIR" <<'JS'
const fs = require("node:fs");
const path = require("node:path");

const tmpDir = process.argv[2];
const rootDir = process.cwd();

const publicPaths = {
  "@obora/runtime": "packages/runtime/dist/index.d.ts",
  "@obora/runtime/storage": "packages/runtime/dist/storage/index.d.ts",
  "@obora/adapters": "packages/adapters/dist/index.d.ts",
  "@obora/adapters/llm": "packages/adapters/dist/llm/index.d.ts",
  "@obora/adapters/tools": "packages/adapters/dist/tools/index.d.ts",
  "@obora/adapters/auth": "packages/adapters/dist/auth/index.d.ts",
  "@obora/adapters/testing": "packages/adapters/dist/testing/index.d.ts",
  "@obora/sdk": "packages/sdk/dist/index.d.ts",
  "@obora/sdk/testing": "packages/sdk/dist/testing/index.d.ts",
};

const missing = Object.values(publicPaths).filter((file) => !fs.existsSync(path.join(rootDir, file)));
if (missing.length > 0) {
  console.error("[FAIL] Built declaration files are missing. Run pnpm build before snippet verification.");
  for (const file of missing) console.error(`  - ${file}`);
  process.exit(1);
}

const docs = [
  "README.md",
  ...fs.readdirSync("packages")
    .sort()
    .map((name) => path.join("packages", name, "README.md"))
    .filter((file) => fs.existsSync(file)),
  ...fs.readdirSync("docs/tutorials")
    .sort()
    .map((name) => path.join("docs/tutorials", name))
    .filter((file) => file.endsWith(".md") && fs.existsSync(file)),
];

function extractTypeScriptBlocks(markdown) {
  const blocks = [];
  const regex = /```(?:typescript|ts)\n([\s\S]*?)```/gi;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const startLine = markdown.slice(0, match.index).split(/\r?\n/).length;
    blocks.push({ startLine, code: match[1].trim() });
  }
  return blocks;
}

function declaresIdentifier(code, identifier) {
  const pattern = new RegExp(`\\b(?:const|let|var|function|class|interface|type)\\s+${identifier}\\b`);
  return pattern.test(code) || new RegExp(`\\bimport\\s+[^;]*\\b${identifier}\\b`).test(code);
}

function buildPrelude(code) {
  const lines = [];

  if (/\badapter\b/.test(code) && !declaresIdentifier(code, "adapter")) {
    lines.push('declare const adapter: import("@obora/adapters").LLMAdapter;');
  }
  if (/\bruntime\b/.test(code) && !declaresIdentifier(code, "runtime")) {
    lines.push('declare const runtime: import("@obora/sdk").OboraRuntime;');
  }
  if (/\bOboraRuntime\b/.test(code) && !declaresIdentifier(code, "OboraRuntime")) {
    lines.push('declare const OboraRuntime: typeof import("@obora/sdk").OboraRuntime;');
  }
  if (/\bfailure\b/.test(code) && !declaresIdentifier(code, "failure")) {
    lines.push('declare const failure: import("@obora/runtime").CellFailure;');
  }
  if (/\bsnapshot\b/.test(code) && !declaresIdentifier(code, "snapshot")) {
    lines.push('declare const snapshot: import("@obora/runtime").VotingSessionSnapshot;');
  }
  if (/\bprocess\b/.test(code) && !declaresIdentifier(code, "process")) {
    lines.push('declare const process: { cwd(): string; env: Record<string, string | undefined>; stdout: { write(value: string): void } };');
  }

  return lines.length > 0 ? `${lines.join("\n")}\n\n` : "";
}

const snippetFiles = [];
let counter = 0;
for (const doc of docs) {
  const markdown = fs.readFileSync(doc, "utf8");
  for (const block of extractTypeScriptBlocks(markdown)) {
    if (block.code.includes("...")) {
      console.error(`[FAIL] ${doc}:${block.startLine} contains placeholder ellipsis in a checked TypeScript snippet.`);
      process.exit(1);
    }

    const fileName = `snippet-${String(counter).padStart(3, "0")}.ts`;
    counter += 1;
    const filePath = path.join(tmpDir, fileName);
    const source = [
      `// Source: ${doc}:${block.startLine}`,
      buildPrelude(block.code) + block.code,
      "export {};",
      "",
    ].join("\n");
    fs.writeFileSync(filePath, source);
    snippetFiles.push(fileName);
  }
}

if (snippetFiles.length === 0) {
  console.error("[FAIL] No checked TypeScript snippets were found.");
  process.exit(1);
}

const paths = Object.fromEntries(
  Object.entries(publicPaths).map(([specifier, target]) => [specifier, [`../${target}`]])
);
paths.zod = ["../packages/sdk/node_modules/zod/index.d.ts"];

fs.writeFileSync(
  path.join(tmpDir, "tsconfig.json"),
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        lib: ["ES2022", "DOM"],
        baseUrl: ".",
        paths,
      },
      files: snippetFiles,
    },
    null,
    2
  )
);

console.log(`[INFO] Generated ${snippetFiles.length} TypeScript doc snippets for verification.`);
JS

pnpm exec tsc --project "$TMP_DIR/tsconfig.json"

echo "[PASS] Checked TypeScript doc snippets compile against public declarations."
