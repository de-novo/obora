#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

TMP_DIR="$(mktemp -d "$ROOT_DIR/.tmp-doc-shell-snippets.XXXXXX")"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

node - "$TMP_DIR" <<'JS'
const fs = require("node:fs");
const path = require("node:path");

const tmpDir = process.argv[2];

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

function extractShellBlocks(markdown) {
  const blocks = [];
  const regex = /```(?:bash|sh|shell)\n([\s\S]*?)```/gi;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const startLine = markdown.slice(0, match.index).split(/\r?\n/).length;
    blocks.push({ startLine, code: match[1].trim() });
  }
  return blocks;
}

const snippetFiles = [];
let counter = 0;
for (const doc of docs) {
  const markdown = fs.readFileSync(doc, "utf8");
  for (const block of extractShellBlocks(markdown)) {
    const fileName = `snippet-${String(counter).padStart(3, "0")}.sh`;
    counter += 1;
    const filePath = path.join(tmpDir, fileName);
    const source = [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      `# Source: ${doc}:${block.startLine}`,
      block.code,
      "",
    ].join("\n");
    fs.writeFileSync(filePath, source);
    snippetFiles.push(filePath);
  }
}

if (snippetFiles.length === 0) {
  console.error("[FAIL] No checked shell snippets were found.");
  process.exit(1);
}

fs.writeFileSync(path.join(tmpDir, "snippets.txt"), snippetFiles.join("\n"));
console.log(`[INFO] Generated ${snippetFiles.length} shell doc snippets for syntax verification.`);
JS

while IFS= read -r snippet; do
  bash -n "$snippet"
done < "$TMP_DIR/snippets.txt"

echo "[PASS] Checked shell doc snippets are valid bash syntax."
