#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

TMP_DIR="$(mktemp -d "$ROOT_DIR/.tmp-doc-structured-snippets.XXXXXX")"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

node --input-type=module - "$TMP_DIR" <<'JS'
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const tmpDir = process.argv[2];
const rootDir = process.cwd();
const require = createRequire(path.join(rootDir, "packages/sdk/package.json"));
const { parseDocument } = require("yaml");

const requiredBuiltFiles = [
  "packages/runtime/dist/index.js",
  "packages/sdk/dist/index.js",
];

const missing = requiredBuiltFiles.filter((file) => !existsSync(path.join(rootDir, file)));
if (missing.length > 0) {
  console.error("[FAIL] Built package files are missing. Run pnpm build before structured doc verification.");
  missing.forEach((file) => console.error(`  - ${file}`));
  process.exit(1);
}

const { Policy, Workflow, loadConfig } = await import(path.join(rootDir, "packages/sdk/dist/index.js"));

const docs = readdirSync("docs/tutorials")
  .sort()
  .map((name) => path.join("docs/tutorials", name))
  .filter((file) => file.endsWith(".md") && existsSync(file));

function fail(message) {
  console.error(`[FAIL] ${message}`);
  process.exit(1);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractFencedBlocks(markdown) {
  const regex = /```(yaml|yml|json)\n([\s\S]*?)```/gi;
  return Array.from(markdown.matchAll(regex)).map((match) => {
    const startLine = markdown.slice(0, match.index).split(/\r?\n/).length;
    return {
      kind: match[1].toLowerCase() === "json" ? "json" : "yaml",
      startLine,
      code: match[2].trim(),
    };
  });
}

function extractShellBlocks(markdown) {
  const regex = /```(?:bash|sh|shell)\n([\s\S]*?)```/gi;
  return Array.from(markdown.matchAll(regex)).map((match) => {
    const startLine = markdown.slice(0, match.index).split(/\r?\n/).length;
    return { startLine, code: match[1] };
  });
}

function extractHeredocs(shellCode) {
  const regex = /cat\s+>\s+([^\s]+)\s+<<\s*['"]?([A-Za-z0-9_-]+)['"]?\n([\s\S]*?)\n\2/g;
  return Array.from(shellCode.matchAll(regex)).flatMap((match) => {
    const target = match[1];
    const delimiter = match[2];
    const body = match[3].trim();
    if (!target || !delimiter || !body) return [];
    if (!/\.(ya?ml|json)$/i.test(target)) return [];
    return [{
      target,
      kind: target.endsWith(".json") ? "json" : "yaml",
      code: body,
    }];
  });
}

function parseStructured(kind, code, source) {
  if (kind === "json") {
    try {
      return JSON.parse(code);
    } catch (error) {
      fail(`${source} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const document = parseDocument(code);
  if (document.errors.length > 0) {
    fail(`${source} is not valid YAML: ${document.errors.map((error) => error.message).join("; ")}`);
  }
  return document.toJS();
}

function looksLikeWorkflow(value) {
  return isObject(value) && typeof value.name === "string" && Array.isArray(value.steps);
}

function looksLikeOneFileWorkflow(value) {
  return isObject(value) && ["validation-repair", "research-loop", "proof-loop", "judge"].includes(value.mode);
}

function looksLikePolicy(value) {
  return isObject(value)
    && !looksLikeWorkflow(value)
    && !looksLikeOneFileWorkflow(value)
    && (value.rules !== undefined || value.tools !== undefined || value.sandbox !== undefined || value.gates !== undefined);
}

function looksLikeConfig(value) {
  return isObject(value)
    && !looksLikeWorkflow(value)
    && !looksLikeOneFileWorkflow(value)
    && (value.defaults !== undefined || value.providers !== undefined || value.persistence !== undefined || value.artifacts !== undefined);
}

async function validateConfigFile(code, source) {
  const filePath = path.join(tmpDir, `config-${validated.config}.yaml`);
  validated.config += 1;
  await writeFile(filePath, code);
  try {
    await loadConfig(filePath);
  } catch (error) {
    fail(`${source} is not a valid Obora config: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateWorkflow(value, source) {
  try {
    Workflow.create(value);
  } catch (error) {
    fail(`${source} is not a valid Obora workflow: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validatePolicy(value, source) {
  try {
    Policy.create(value);
  } catch (error) {
    fail(`${source} is not a valid Obora policy: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function validateSemantic({ kind, code, value, source, target }) {
  if (kind !== "yaml" || !isObject(value)) return;

  if (target && /(?:^|\/)\.?obora\/config\.ya?ml$|(?:^|\/)config\.ya?ml$/i.test(target)) {
    await validateConfigFile(code, source);
    return;
  }

  if (target && /policy/i.test(target)) {
    validatePolicy(value, source);
    return;
  }

  if (target && /\.ya?ml$/i.test(target)) {
    validateWorkflow(value, source);
    return;
  }

  if (looksLikeConfig(value)) {
    await validateConfigFile(code, source);
    return;
  }

  if (looksLikePolicy(value)) {
    validatePolicy(value, source);
    return;
  }

  if (looksLikeWorkflow(value) || looksLikeOneFileWorkflow(value)) {
    validateWorkflow(value, source);
  }
}

const validated = {
  fencedYaml: 0,
  fencedJson: 0,
  heredocYaml: 0,
  heredocJson: 0,
  config: 0,
};

await docs.reduce(async (previousDoc, doc) => {
  await previousDoc;
  const markdown = await readFile(doc, "utf8");
  const docTmpDir = path.join(tmpDir, doc.replaceAll("/", "__"));
  await mkdir(docTmpDir, { recursive: true });

  await extractFencedBlocks(markdown).reduce(async (previousBlock, block) => {
    await previousBlock;
    const source = `${doc}:${block.startLine}`;
    const value = parseStructured(block.kind, block.code, source);
    if (block.kind === "json") validated.fencedJson += 1;
    else validated.fencedYaml += 1;
    await validateSemantic({ ...block, value, source });
  }, Promise.resolve());

  await extractShellBlocks(markdown).reduce(async (previousShellBlock, shellBlock) => {
    await previousShellBlock;
    await extractHeredocs(shellBlock.code).reduce(async (previousHeredoc, heredoc) => {
      await previousHeredoc;
      const source = `${doc}:${shellBlock.startLine} -> ${heredoc.target}`;
      const value = parseStructured(heredoc.kind, heredoc.code, source);
      const outputPath = path.join(docTmpDir, heredoc.target);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, heredoc.code);
      if (heredoc.kind === "json") validated.heredocJson += 1;
      else validated.heredocYaml += 1;
      await validateSemantic({ ...heredoc, value, source });
    }, Promise.resolve());
  }, Promise.resolve());
}, Promise.resolve());

const total = validated.fencedYaml + validated.fencedJson + validated.heredocYaml + validated.heredocJson;
if (total === 0) {
  fail("No checked YAML/JSON snippets were found.");
}

console.log(
  `[PASS] Checked structured tutorial snippets: ${validated.fencedYaml} fenced YAML, ${validated.fencedJson} fenced JSON, ${validated.heredocYaml} heredoc YAML, ${validated.heredocJson} heredoc JSON.`
);
JS
